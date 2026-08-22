import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentInvoiceStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { seesAllOrganizations } from '../auth/platform-org';
import { NowPaymentsService } from './nowpayments.service';

export type PaymentInvoiceView = {
  id: string;
  plan: SubscriptionPlan;
  status: PaymentInvoiceStatus;
  priceUsd: number;
  payAddress: string;
  payAmount: string;
  payCurrency: string;
  network: string | null;
  expiresAt: string;
  remainingSeconds: number;
  paid: boolean;
  checkoutUrl: string | null;
  guardarianUrl: string | null;
};

export type SubscriptionView = {
  id: string | null;
  status: SubscriptionStatus | 'NONE';
  plan: SubscriptionPlan | 'NONE';
  maxDevices: number;
  deviceCount: number;
  devicesUsed: string;
  expiresAt: string | null;
  startedAt: string | null;
  active: boolean;
  trial: boolean;
  canWatchVideo: boolean;
  canWatchAudio: boolean;
  canRecordings: boolean;
  canLinkTwoApps: boolean;
  priceProUsd: number;
  priceProPlusUsd: number;
};

const PRO_PRICE = 25;
const PRO_PLUS_PRICE = 25;
const TRIAL_HOURS = 72;
const PAID_DAYS = 365;

const PAID_PROVIDER_STATUSES = new Set([
  'confirming',
  'confirmed',
  'sending',
  'partially_paid',
  'finished',
]);
const MIN_ACCEPT_USDT = 15;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nowpayments: NowPaymentsService,
    private readonly config: ConfigService,
  ) {}

  async forOrganization(organizationId: string): Promise<SubscriptionView> {
    const [sub, deviceCount] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({
        where: { organizationId, disabled: false },
      }),
    ]);

    const status = this.effectiveStatus(sub?.status, sub?.expiresAt);
    const plan = sub?.plan ?? 'NONE';
    const active = status === SubscriptionStatus.ACTIVE;
    const maxDevices =
      sub?.maxDevices ??
      this.maxDevicesFor(plan === 'NONE' ? SubscriptionPlan.TRIAL : plan);
    const trial = active && plan === SubscriptionPlan.TRIAL;
    const canWatchVideo = active;
    const canWatchAudio = active && plan === SubscriptionPlan.PRO_PLUS;
    const canRecordings = canWatchAudio;
    const canLinkTwoApps = active;

    return {
      id: sub?.id ?? null,
      status,
      plan,
      maxDevices,
      deviceCount,
      devicesUsed: `${deviceCount} / ${maxDevices}`,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      active,
      trial,
      canWatchVideo,
      canWatchAudio,
      canRecordings,
      canLinkTwoApps,
      priceProUsd: PRO_PRICE,
      priceProPlusUsd: PRO_PLUS_PRICE,
    };
  }

  async assertCanPair(organizationId: string) {
    await this.ensureTrial(organizationId);
    const view = await this.forOrganization(organizationId);
    if (!view.active) {
      return { ok: false as const, reason: 'subscription_inactive' as const, view };
    }
    if (view.deviceCount >= view.maxDevices) {
      return { ok: false as const, reason: 'device_limit_reached' as const, view };
    }
    return { ok: true as const, view };
  }

  async assertCanWatch(
    organizationId: string,
    feature: 'video' | 'audio' | 'recordings' = 'video',
  ) {
    const view = await this.forOrganization(organizationId);
    if (!view.active || !view.canWatchVideo) {
      return { ok: false as const, reason: 'subscription_inactive' as const, view };
    }
    if (feature === 'audio' && !view.canWatchAudio) {
      return { ok: false as const, reason: 'upgrade_required' as const, view };
    }
    if (feature === 'recordings' && !view.canRecordings) {
      return { ok: false as const, reason: 'upgrade_required' as const, view };
    }
    return { ok: true as const, view };
  }

  async list(organizationId: string) {
    return this.prisma.subscription.findMany({
      where: seesAllOrganizations(organizationId) ? {} : { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ensureTrial(organizationId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    const now = new Date();
    return this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.TRIAL,
        maxDevices: this.maxDevicesFor(SubscriptionPlan.TRIAL),
        startedAt: now,
        expiresAt: new Date(now.getTime() + TRIAL_HOURS * 60 * 60 * 1000),
      },
    });
  }

  /**
   * 72h live-view demo for the pairing-code issuer. Starts when someone accepts
   * their code (not when they join as an invitee on someone else's code).
   */
  async ensureWatcherTrial(organizationId: string) {
    return this.ensureTrial(organizationId);
  }

  /** Pairing codes can be generated before the watcher trial starts. */
  assertMayIssuePairingCode(view: SubscriptionView) {
    if (view.active) return;
    if (view.status === 'NONE') return;
    throw new BadRequestException('Subscription is not active');
  }

  /**
   * One free trial per physical phone. Matches ANY known signal
   * (fingerprint hash, ANDROID_ID, Widevine id).
   */
  async assertInstallMayCreateAccount(
    rawInstallId?: string | null,
    rawSignals?: string[] | null,
  ) {
    const keys = this.collectInstallKeys(rawInstallId, rawSignals);
    if (keys.length === 0) {
      throw new BadRequestException('Device id required');
    }
    if (!this.hasHardwareInstallSignal(keys)) {
      throw new BadRequestException(
        'Device id required. Reinstall the app or update Android and try again.',
      );
    }
    const claim = await this.findTrialClaim(keys);
    if (!claim) {
      return { installId: keys[0], claim: null };
    }
    const status = await this.trialStatusForInstall(rawInstallId, rawSignals);
    throw new BadRequestException(
      status.message ??
        'Free trial already used on this phone. Sign in with your existing account.',
    );
  }

  async claimTrialForInstall(
    rawInstallId: string | null | undefined,
    organizationId: string,
    expiresAt: Date,
    rawSignals?: string[] | null,
  ) {
    const keys = this.collectInstallKeys(rawInstallId, rawSignals);
    if (keys.length === 0) {
      throw new BadRequestException('Device id required');
    }
    if (!this.hasHardwareInstallSignal(keys)) {
      throw new BadRequestException(
        'Device id required. Reinstall the app or update Android and try again.',
      );
    }
    const existing = await this.findTrialClaim(keys);
    if (existing && existing.organizationId !== organizationId) {
      const status = await this.trialStatusForInstall(rawInstallId, rawSignals);
      throw new BadRequestException(
        status.message ??
          'Free trial already used on this phone. Sign in with your existing account.',
      );
    }
    await this.upsertTrialClaims(keys, organizationId, expiresAt);
    return existing ?? { installId: keys[0], organizationId, expiresAt };
  }

  /**
   * After login, attach any newly observed hardware signals to this phone's claim
   * so reinstall + ANDROID_ID rotation still matches Widevine (or vice versa).
   */
  async syncTrialSignalsForOrganization(
    organizationId: string,
    rawInstallId?: string | null,
    rawSignals?: string[] | null,
  ) {
    const keys = this.collectInstallKeys(rawInstallId, rawSignals);
    if (keys.length === 0 || !this.hasHardwareInstallSignal(keys)) {
      return null;
    }
    const existing = await this.prisma.trialDeviceClaim.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!existing) {
      return null;
    }
    await this.upsertTrialClaims(keys, organizationId, existing.expiresAt);
    return existing;
  }

  async trialStatusForInstall(
    rawInstallId?: string | null,
    rawSignals?: string[] | null,
  ) {
    const keys = this.collectInstallKeys(rawInstallId, rawSignals);
    if (keys.length === 0) {
      return {
        trialBlocked: false,
        trialEnded: false,
        existingPhone: null as string | null,
        existingName: null as string | null,
        message: null as string | null,
      };
    }
    const claim = await this.findTrialClaim(keys);
    if (!claim) {
      return {
        trialBlocked: false,
        trialEnded: false,
        existingPhone: null,
        existingName: null,
        message: null,
      };
    }
    const owner = this.prisma.user
      ? await this.prisma.user.findFirst({
          where: {
            organizationId: claim.organizationId,
            role: UserRole.USER,
            blocked: false,
            AND: [
              { phone: { not: null } },
              { NOT: { phone: '' } },
              {
                NOT: [
                  { email: { startsWith: 'callcenter+' } },
                  { email: { endsWith: '@support.internal' } },
                  { name: { equals: 'Call Center' } },
                ],
              },
            ],
          },
          orderBy: { createdAt: 'asc' },
          select: { phone: true, name: true },
        })
      : null;
    const existingPhone = owner?.phone?.replace(/\D/g, '') || null;
    const existingName = owner?.name ?? null;
    if (claim.expiresAt <= new Date()) {
      return {
        trialBlocked: true,
        trialEnded: true,
        existingPhone,
        existingName,
        message: existingPhone
          ? `Trial ended on this phone. Sign in as ${existingPhone}. Buy Pro or Pro+ for live video.`
          : 'Trial ended on this phone. Buy Pro or Pro+ to continue.',
      };
    }
    return {
      trialBlocked: true,
      trialEnded: false,
      existingPhone,
      existingName,
      message: existingPhone
        ? `Free trial already used on this phone. Sign in as ${existingPhone}.`
        : 'Free trial already used on this phone. Sign in with your existing account.',
    };
  }

  normalizeInstallId(raw?: string | null) {
    const value = (raw ?? '').trim();
    if (value.length < 8 || value.length > 160) {
      return null;
    }
    if (!/^[A-Za-z0-9._:+-]+$/.test(value)) {
      return null;
    }
    return value;
  }

  collectInstallKeys(
    rawInstallId?: string | null,
    rawSignals?: string[] | null,
  ) {
    const keys = [
      this.normalizeInstallId(rawInstallId),
      ...(rawSignals ?? []).map((s) => this.normalizeInstallId(s)),
    ].filter((v): v is string => Boolean(v));
    return [...new Set(keys)];
  }

  hasHardwareInstallSignal(keys: string[]) {
    return keys.some(
      (key) =>
        key.startsWith('aid:') ||
        key.startsWith('drm:') ||
        key.startsWith('fp:'),
    );
  }

  private async findTrialClaim(keys: string[]) {
    if (keys.length === 0) return null;
    return this.prisma.trialDeviceClaim.findFirst({
      where: { installId: { in: keys } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async upsertTrialClaims(
    keys: string[],
    organizationId: string,
    expiresAt: Date,
  ) {
    for (const installId of keys) {
      const existing = await this.prisma.trialDeviceClaim.findUnique({
        where: { installId },
      });
      if (existing && existing.organizationId !== organizationId) {
        if (existing.expiresAt <= new Date()) {
          throw new BadRequestException(
            'Trial ended on this phone. Buy Pro or Pro+ to continue.',
          );
        }
        throw new BadRequestException(
          'Free trial already used on this phone. Sign in with your existing account.',
        );
      }
      if (existing) {
        await this.prisma.trialDeviceClaim.update({
          where: { installId },
          data: { expiresAt },
        });
      } else {
        await this.prisma.trialDeviceClaim.create({
          data: { installId, organizationId, expiresAt },
        });
      }
    }
  }

  async createInvoice(
    organizationId: string,
    plan: 'PRO' | 'PRO_PLUS',
    deviceId?: string,
  ): Promise<PaymentInvoiceView> {
    const nextPlan =
      plan === 'PRO_PLUS' ? SubscriptionPlan.PRO_PLUS : SubscriptionPlan.PRO;
    if (nextPlan === SubscriptionPlan.PRO_PLUS) {
      const current = await this.forOrganization(organizationId);
      if (!current.active || current.plan !== SubscriptionPlan.PRO) {
        throw new ForbiddenException('Pay Pro first, then Pro+');
      }
    }
    const priceUsd =
      nextPlan === SubscriptionPlan.PRO_PLUS ? PRO_PLUS_PRICE : PRO_PRICE;

    const existing = await this.prisma.paymentInvoice.findFirst({
      where: {
        organizationId,
        plan: nextPlan,
        status: {
          in: [PaymentInvoiceStatus.WAITING, PaymentInvoiceStatus.CONFIRMING],
        },
        expiresAt: { gt: new Date() },
        NOT: { payAddress: '' },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.presentInvoice(existing);
    }

    const pendingId = `invoice:${organizationId.slice(-8)}:${Date.now()}`;
    const placeholder = await this.prisma.paymentInvoice.create({
      data: {
        organizationId,
        deviceId: deviceId ?? null,
        plan: nextPlan,
        status: PaymentInvoiceStatus.WAITING,
        priceUsd,
        nowPaymentId: pendingId,
        payAddress: '',
        payAmount: String(priceUsd),
        payCurrency: this.nowpayments.payCurrency(),
        network: this.nowpayments.networkLabel(),
        expiresAt: new Date(
          Date.now() + this.nowpayments.invoiceTtlMinutes() * 60 * 1000,
        ),
        lastProviderStatus: 'waiting',
      },
    });

    let payment;
    try {
      payment = await this.nowpayments.createPayment({
        priceUsd,
        orderId: placeholder.id,
        description: `Monitor ${plan} subscription`,
        ipnCallbackUrl: this.ipnCallbackUrl(),
      });
    } catch (err) {
      await this.prisma.paymentInvoice.delete({ where: { id: placeholder.id } });
      throw err;
    }
    if (!payment.pay_address || payment.payment_id == null || payment.payment_id === '') {
      await this.prisma.paymentInvoice.delete({ where: { id: placeholder.id } });
      throw new BadRequestException('NOWPayments did not return a deposit address');
    }
    const payCurrency = (
      payment.pay_currency || this.nowpayments.payCurrency()
    ).toLowerCase();
    const payAddress = payment.pay_address ?? '';
    const payAmount = String(payment.pay_amount ?? priceUsd);
    const network =
      payment.network || this.nowpayments.networkLabel(payCurrency);
    const providerExpiry = payment.expiration_estimate_date
      ? new Date(payment.expiration_estimate_date)
      : null;
    const expiresAt =
      providerExpiry && !Number.isNaN(providerExpiry.getTime())
        ? providerExpiry
        : new Date(
            Date.now() + this.nowpayments.invoiceTtlMinutes() * 60 * 1000,
          );

    const invoice = await this.prisma.paymentInvoice.update({
      where: { id: placeholder.id },
      data: {
        nowPaymentId: String(payment.payment_id),
        payAddress,
        payAmount,
        payCurrency,
        network,
        expiresAt,
        lastProviderStatus: payment.payment_status ?? 'waiting',
        checkoutUrl: this.guardarianUrl(payAddress, payAmount, network, priceUsd),
      },
    });
    return this.presentInvoice(invoice);
  }

  async getInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.paymentInvoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.refreshInvoice(invoice.id);
  }

  async handleNowPaymentsIpn(signature: string | undefined, body: unknown) {
    if (!this.nowpayments.verifyIpnSignature(body, signature)) {
      throw new UnauthorizedException('Invalid NOWPayments signature');
    }
    const payload = (body ?? {}) as Record<string, unknown>;
    const paymentId = String(payload.payment_id ?? '').trim();
    const orderId = String(payload.order_id ?? '').trim();
    const invoiceId = String(payload.invoice_id ?? '').trim();
    if (!paymentId && !orderId && !invoiceId) {
      throw new BadRequestException('payment_id required');
    }
    await this.applyProviderStatus(String(payload.payment_status ?? ''), {
      paymentId: paymentId || undefined,
      orderId: orderId || undefined,
      invoiceId: invoiceId || undefined,
      actuallyPaid: payload.actually_paid as number | string | undefined,
      actuallyPaidFiat: payload.actually_paid_at_fiat as number | string | undefined,
    });
    return { ok: true };
  }

  async refreshInvoice(invoiceId: string): Promise<PaymentInvoiceView> {
    const invoice = await this.prisma.paymentInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status === PaymentInvoiceStatus.WAITING ||
      invoice.status === PaymentInvoiceStatus.CONFIRMING
    ) {
      try {
        let payment: Awaited<
          ReturnType<NowPaymentsService['getPayment']>
        > | null = null;
        if (invoice.nowPaymentId.startsWith('invoice:')) {
          payment = await this.nowpayments.findPaymentByOrderId(invoice.id);
        } else {
          try {
            payment = await this.nowpayments.getPayment(invoice.nowPaymentId);
          } catch {
            payment = await this.nowpayments.findPaymentByOrderId(invoice.id);
          }
        }
        if (payment?.payment_id) {
          await this.applyProviderStatus(String(payment.payment_status ?? ''), {
            paymentId: String(payment.payment_id),
            orderId: String(payment.order_id ?? invoice.id),
            invoiceId: String(payment.invoice_id ?? invoice.nowInvoiceId ?? ''),
            payAddress: payment.pay_address,
            payAmount: payment.pay_amount,
            payCurrency: payment.pay_currency,
            actuallyPaid: payment.actually_paid,
            actuallyPaidFiat: payment.actually_paid_at_fiat,
          });
        }
      } catch {
        // Keep last known status if NOWPayments is briefly unreachable.
      }
    }
    const fresh = await this.prisma.paymentInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (
      fresh.status === PaymentInvoiceStatus.WAITING &&
      !fresh.activatedAt &&
      fresh.expiresAt <= new Date()
    ) {
      const expired = await this.prisma.paymentInvoice.update({
        where: { id: fresh.id },
        data: { status: PaymentInvoiceStatus.EXPIRED },
      });
      return this.presentInvoice(expired);
    }
    return this.presentInvoice(fresh);
  }

  private async applyProviderStatus(
    providerStatus: string,
    extras: {
      paymentId?: string;
      orderId?: string;
      invoiceId?: string;
      payAddress?: string;
      payAmount?: number | string;
      payCurrency?: string;
      actuallyPaid?: number | string;
      actuallyPaidFiat?: number | string;
    },
  ) {
    const invoice =
      (extras.paymentId
        ? await this.prisma.paymentInvoice.findUnique({
            where: { nowPaymentId: extras.paymentId },
          })
        : null) ??
      (extras.invoiceId
        ? await this.prisma.paymentInvoice.findFirst({
            where: { nowInvoiceId: extras.invoiceId },
          })
        : null) ??
      (extras.orderId
        ? await this.prisma.paymentInvoice.findUnique({
            where: { id: extras.orderId },
          })
        : null);
    if (!invoice) return;
    if (extras.paymentId && extras.paymentId !== invoice.nowPaymentId) {
      await this.prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: {
          nowPaymentId: extras.paymentId,
          payAddress: extras.payAddress || invoice.payAddress,
          payAmount:
            extras.payAmount != null
              ? String(extras.payAmount)
              : invoice.payAmount,
          payCurrency: extras.payCurrency
            ? String(extras.payCurrency).toLowerCase()
            : invoice.payCurrency,
        },
      });
    }
    const status = providerStatus.toLowerCase();
    if (invoice.activatedAt) {
      await this.prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { lastProviderStatus: status },
      });
      return;
    }

    const enough = this.receivedEnough(extras.actuallyPaid, extras.actuallyPaidFiat);
    if (enough) {
      await this.activatePaidInvoice(invoice, status);
      return;
    }

    if (status === 'expired' || status === 'failed' || status === 'refunded') {
      await this.prisma.paymentInvoice.updateMany({
        where: { id: invoice.id, activatedAt: null },
        data: {
          status:
            status === 'expired'
              ? PaymentInvoiceStatus.EXPIRED
              : PaymentInvoiceStatus.FAILED,
          lastProviderStatus: status,
        },
      });
      return;
    }

    if (!PAID_PROVIDER_STATUSES.has(status)) {
      await this.prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { lastProviderStatus: status },
      });
      return;
    }

    await this.activatePaidInvoice(invoice, status);
  }

  private receivedEnough(
    actuallyPaid?: number | string,
    actuallyPaidFiat?: number | string,
  ) {
    const crypto = Number(actuallyPaid);
    const fiat = Number(actuallyPaidFiat);
    if (Number.isFinite(crypto) && crypto >= MIN_ACCEPT_USDT) return true;
    if (Number.isFinite(fiat) && fiat >= MIN_ACCEPT_USDT) return true;
    return false;
  }

  private async activatePaidInvoice(
    invoice: { id: string; organizationId: string; plan: SubscriptionPlan },
    status: string,
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAID_DAYS * 24 * 60 * 60 * 1000);
    const claimed = await this.prisma.paymentInvoice.updateMany({
      where: { id: invoice.id, activatedAt: null },
      data: {
        status: PaymentInvoiceStatus.FINISHED,
        lastProviderStatus: status,
        paidAt: now,
        activatedAt: now,
      },
    });
    if (claimed.count === 0) return;
    await this.prisma.subscription.create({
      data: {
        organizationId: invoice.organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: invoice.plan,
        maxDevices: this.maxDevicesFor(invoice.plan),
        startedAt: now,
        expiresAt,
      },
    });
  }

  private presentInvoice(invoice: {
    id: string;
    plan: SubscriptionPlan;
    status: PaymentInvoiceStatus;
    priceUsd: number;
    payAddress: string;
    payAmount: string;
    payCurrency: string;
    network: string | null;
    expiresAt: Date;
    activatedAt: Date | null;
    checkoutUrl?: string | null;
  }): PaymentInvoiceView {
    const remainingSeconds = Math.max(
      0,
      Math.floor((invoice.expiresAt.getTime() - Date.now()) / 1000),
    );
    const cardUrl = invoice.payAddress
      ? this.guardarianUrl(
          invoice.payAddress,
          invoice.payAmount,
          invoice.network,
          invoice.priceUsd,
        )
      : invoice.checkoutUrl?.trim() || null;
    return {
      id: invoice.id,
      plan: invoice.plan,
      status: invoice.status,
      priceUsd: invoice.priceUsd,
      payAddress: invoice.payAddress,
      payAmount: invoice.payAmount,
      payCurrency: invoice.payCurrency,
      network: invoice.network,
      expiresAt: invoice.expiresAt.toISOString(),
      remainingSeconds,
      paid: Boolean(invoice.activatedAt) || invoice.status === PaymentInvoiceStatus.FINISHED,
      checkoutUrl: cardUrl,
      guardarianUrl: cardUrl,
    };
  }

  private publicBaseUrl() {
    return (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
  }

  private ipnCallbackUrl() {
    const publicBase = this.publicBaseUrl();
    if (!publicBase) return undefined;
    return `${publicBase}/api/v1/subscriptions/nowpayments/ipn`;
  }

  private guardarianUrl(
    address: string,
    amount: string,
    _network: string | null,
    priceUsd?: number,
  ) {
    const rawWidget =
      this.config.get<string>('GUARDARIAN_WIDGET_URL')?.trim() ||
      'https://guardarian.com/buy-usdt';
    const widget = rawWidget
      .replace(/\/calculator\/v1\/?$/i, '/buy-usdt')
      .replace(/\/calculator\/?$/i, '/buy-usdt');
    const token = this.config.get<string>('GUARDARIAN_PARTNER_TOKEN')?.trim();
    const params = new URLSearchParams({
      default_fiat_currency: 'USD',
      default_from_amount: String(priceUsd && priceUsd > 0 ? priceUsd : amount || '25'),
      default_crypto_currency: 'USDT',
      to_network: 'TRX',
      from_currency: 'USD',
      from_amount: String(priceUsd && priceUsd > 0 ? priceUsd : amount || '25'),
      to_currency: 'USDT',
      payout_address: address,
    });
    if (token) params.set('partner_api_token', token);
    return `${widget}?${params.toString()}`;
  }

  async grantManual(
    organizationId: string,
    plan: 'TRIAL' | 'PRO' | 'PRO_PLUS',
    days?: number,
  ) {
    const nextPlan =
      plan === 'PRO_PLUS'
        ? SubscriptionPlan.PRO_PLUS
        : plan === 'PRO'
          ? SubscriptionPlan.PRO
          : SubscriptionPlan.TRIAL;
    const now = new Date();
    const expiresAt =
      nextPlan === SubscriptionPlan.TRIAL
        ? new Date(
            now.getTime() +
              (days != null
                ? days * 24 * 60 * 60 * 1000
                : TRIAL_HOURS * 60 * 60 * 1000),
          )
        : new Date(
            now.getTime() + (days ?? PAID_DAYS) * 24 * 60 * 60 * 1000,
          );
    await this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: nextPlan,
        maxDevices: this.maxDevicesFor(nextPlan),
        startedAt: now,
        expiresAt,
      },
    });
    return this.forOrganization(organizationId);
  }

  async purchase(organizationId: string, plan: 'PRO' | 'PRO_PLUS') {
    const nextPlan =
      plan === 'PRO_PLUS' ? SubscriptionPlan.PRO_PLUS : SubscriptionPlan.PRO;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAID_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: nextPlan,
        maxDevices: this.maxDevicesFor(nextPlan),
        startedAt: now,
        expiresAt,
      },
    });
  }

  async activateDemo(organizationId: string) {
    return this.purchase(organizationId, 'PRO_PLUS');
  }

  parsePlan(value?: string): 'TRIAL' | 'PRO' | 'PRO_PLUS' {
    const plan = (value ?? '').trim().toUpperCase().replace('+', '_PLUS');
    if (plan === 'PRO_PLUS' || plan === 'PROPLUS') return 'PRO_PLUS';
    if (plan === 'PRO') return 'PRO';
    if (plan === 'TRIAL') return 'TRIAL';
    throw new BadRequestException('Plan must be TRIAL, PRO or PRO_PLUS');
  }

  private maxDevicesFor(plan: SubscriptionPlan | 'NONE') {
    if (plan === SubscriptionPlan.PRO || plan === SubscriptionPlan.PRO_PLUS) {
      return 2;
    }
    return 2;
  }

  private effectiveStatus(
    status?: SubscriptionStatus | null,
    expiresAt?: Date | null,
  ): SubscriptionStatus | 'NONE' {
    if (!status) return 'NONE';
    if (status === SubscriptionStatus.ACTIVE && expiresAt && expiresAt <= new Date()) {
      return SubscriptionStatus.EXPIRED;
    }
    return status;
  }
}
