import { BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

describe('trial device claim', () => {
  function setup() {
    const prisma = {
      trialDeviceClaim: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      subscription: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      device: { count: jest.fn() },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          phone: '998901112233',
          name: 'Owner',
        }),
      },
      paymentInvoice: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new SubscriptionsService(
      prisma as never,
      { get: jest.fn(), getOrThrow: jest.fn() } as never,
      {} as never,
    );
    return { prisma, service };
  }

  it('allows pairing code generation before watcher trial exists', () => {
    const { service } = setup();
    expect(() =>
      service.assertMayIssuePairingCode({
        id: null,
        status: 'NONE',
        plan: 'NONE',
        maxDevices: 2,
        deviceCount: 1,
        devicesUsed: '1 / 2',
        expiresAt: null,
        startedAt: null,
        active: false,
        trial: false,
        canWatchVideo: false,
        canWatchAudio: false,
        canRecordings: false,
        canLinkTwoApps: false,
        priceProUsd: 25,
        priceProPlusUsd: 25,
      }),
    ).not.toThrow();
  });

  it('blocks pairing code generation when subscription is expired', () => {
    const { service } = setup();
    expect(() =>
      service.assertMayIssuePairingCode({
        id: 'sub-1',
        status: 'EXPIRED',
        plan: 'TRIAL',
        maxDevices: 2,
        deviceCount: 1,
        devicesUsed: '1 / 2',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        startedAt: null,
        active: false,
        trial: false,
        canWatchVideo: false,
        canWatchAudio: false,
        canRecordings: false,
        canLinkTwoApps: false,
        priceProUsd: 25,
        priceProPlusUsd: 25,
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks a new account after trial ended on the same phone', async () => {
    const { prisma, service } = setup();
    prisma.trialDeviceClaim.findFirst.mockResolvedValue({
      installId: 'aid:abc12345',
      organizationId: 'org-old',
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.assertInstallMayCreateAccount('fp:deadbeefcafe', [
        'aid:abc12345',
        'drm:fff11122',
      ]),
    ).rejects.toThrow(/Trial ended on this phone/);
  });

  it('blocks when only Widevine signal matches', async () => {
    const { prisma, service } = setup();
    prisma.trialDeviceClaim.findFirst.mockResolvedValue({
      installId: 'drm:widevine99',
      organizationId: 'org-old',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.assertInstallMayCreateAccount('fp:newhashvalue1', [
        'aid:changed99',
        'drm:widevine99',
      ]),
    ).rejects.toThrow(/Free trial already used/);
  });

  it('allows first account on a new phone', async () => {
    const { prisma, service } = setup();
    prisma.trialDeviceClaim.findFirst.mockResolvedValue(null);
    await expect(
      service.assertInstallMayCreateAccount('fp:newphone99abcd', [
        'aid:newphone99',
      ]),
    ).resolves.toMatchObject({ installId: 'fp:newphone99abcd', claim: null });
  });

  it('rejects weak uid-only fingerprints', async () => {
    const { service } = setup();
    await expect(
      service.assertInstallMayCreateAccount('uid:12345678-aaaa'),
    ).rejects.toThrow(/Device id required/);
  });

  it('rejects missing install id', async () => {
    const { service } = setup();
    await expect(service.assertInstallMayCreateAccount('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores every signal when claiming a trial', async () => {
    const { prisma, service } = setup();
    prisma.trialDeviceClaim.findFirst.mockResolvedValue(null);
    prisma.trialDeviceClaim.findUnique.mockResolvedValue(null);
    await service.claimTrialForInstall(
      'fp:abcdef0123456789',
      'org-1',
      new Date('2030-01-01T00:00:00.000Z'),
      ['aid:androidid99', 'drm:widevine99'],
    );
    expect(prisma.trialDeviceClaim.create).toHaveBeenCalledTimes(3);
  });

  it('does not let a second org steal an existing claim key', async () => {
    const { prisma, service } = setup();
    prisma.trialDeviceClaim.findFirst.mockResolvedValue(null);
    prisma.trialDeviceClaim.findUnique.mockResolvedValue({
      installId: 'aid:androidid99',
      organizationId: 'org-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.claimTrialForInstall(
        'fp:abcdef0123456789',
        'org-2',
        new Date('2030-01-01T00:00:00.000Z'),
        ['aid:androidid99'],
      ),
    ).rejects.toThrow(/Free trial already used/);
    expect(prisma.trialDeviceClaim.update).not.toHaveBeenCalled();
  });
});
