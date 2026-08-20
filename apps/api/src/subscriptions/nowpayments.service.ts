import { createHmac, timingSafeEqual } from 'crypto';
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type NowPayment = {
  payment_id: string | number;
  payment_status: string;
  pay_address?: string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  actually_paid_at_fiat?: number | string;
  pay_currency?: string;
  network?: string;
  expiration_estimate_date?: string;
  price_amount?: number | string;
  order_id?: string;
  invoice_id?: string | number;
};

export type NowInvoice = {
  id: string | number;
  invoice_url: string;
  order_id?: string;
};

@Injectable()
export class NowPaymentsService {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return Boolean(this.apiKey());
  }

  async createInvoice(params: {
    priceUsd: number;
    orderId: string;
    description: string;
    ipnCallbackUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<NowInvoice> {
    const body: Record<string, unknown> = {
      price_amount: params.priceUsd,
      price_currency: 'usd',
      order_id: params.orderId,
      order_description: params.description,
    };
    if (params.ipnCallbackUrl) body.ipn_callback_url = params.ipnCallbackUrl;
    if (params.successUrl) body.success_url = params.successUrl;
    if (params.cancelUrl) body.cancel_url = params.cancelUrl;
    return this.request<NowInvoice>('/invoice', {
      method: 'POST',
      apiKey: this.requireApiKey(),
      body,
    });
  }

  async findPaymentByOrderId(orderId: string): Promise<NowPayment | null> {
    const raw = await this.request<unknown>('/payment/?limit=50&sortBy=created_at&orderBy=desc', {
      method: 'GET',
      apiKey: this.requireApiKey(),
    });
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? ((raw as { data?: unknown }).data ??
            (raw as { payments?: unknown }).payments ??
            [])
        : [];
    const rows = Array.isArray(list) ? list : [];
    const match = rows.find((item) => {
      if (!item || typeof item !== 'object') return false;
      return String((item as NowPayment).order_id ?? '') === orderId;
    });
    return (match as NowPayment | undefined) ?? null;
  }

  async createPayment(params: {
    priceUsd: number;
    orderId: string;
    description: string;
    ipnCallbackUrl?: string;
  }): Promise<NowPayment> {
    const apiKey = this.requireApiKey();
    const payCurrency = this.payCurrency();
    const body: Record<string, unknown> = {
      price_amount: params.priceUsd,
      price_currency: 'usd',
      pay_currency: payCurrency,
      order_id: params.orderId,
      order_description: params.description,
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    };
    if (params.ipnCallbackUrl) {
      body.ipn_callback_url = params.ipnCallbackUrl;
    }
    return this.request<NowPayment>('/payment', {
      method: 'POST',
      apiKey,
      body,
    });
  }

  async getPayment(paymentId: string): Promise<NowPayment> {
    return this.request<NowPayment>(`/payment/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      apiKey: this.requireApiKey(),
    });
  }

  verifyIpnSignature(rawBody: unknown, signature: string | undefined) {
    const secret = this.config.get<string>('NOWPAYMENTS_IPN_SECRET')?.trim();
    if (!secret || !signature) return false;
    const expected = createHmac('sha512', secret)
      .update(JSON.stringify(this.sortDeep(rawBody)))
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  payCurrency() {
    return (
      this.config.get<string>('NOWPAYMENTS_PAY_CURRENCY')?.trim() ||
      'usdttrc20'
    ).toLowerCase();
  }

  networkLabel(payCurrency = this.payCurrency()) {
    if (payCurrency.includes('trc20') || payCurrency.includes('trx')) {
      return 'TRC20';
    }
    if (payCurrency.includes('bsc') || payCurrency.includes('bep20')) {
      return 'BSC';
    }
    if (payCurrency.includes('erc20') || payCurrency.includes('eth')) {
      return 'ERC20';
    }
    return payCurrency.toUpperCase();
  }

  invoiceTtlMinutes() {
    const raw = Number(
      this.config.get<string>('NOWPAYMENTS_INVOICE_TTL_MINUTES') ?? '30',
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
  }

  private apiKey() {
    return this.config.get<string>('NOWPAYMENTS_API_KEY')?.trim() || '';
  }

  private requireApiKey() {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'NOWPayments API key is not configured',
      );
    }
    return key;
  }

  private baseUrl() {
    const sandbox =
      this.config.get<string>('NOWPAYMENTS_SANDBOX')?.trim() === 'true';
    return sandbox
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';
  }

  private async request<T>(
    path: string,
    opts: { method: 'GET' | 'POST'; apiKey: string; body?: unknown },
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method: opts.method,
      headers: {
        'x-api-key': opts.apiKey,
        'Content-Type': 'application/json',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text };
    }
    if (!res.ok) {
      const message =
        typeof json === 'object' && json && 'message' in json
          ? String((json as { message: unknown }).message)
          : `NOWPayments error ${res.status}`;
      throw new ServiceUnavailableException(message);
    }
    return json as T;
  }

  private sortDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortDeep(item));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortDeep((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  }
}
