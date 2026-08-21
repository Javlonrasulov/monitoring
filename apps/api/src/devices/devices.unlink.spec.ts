import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DevicesService } from './devices.service';

describe('device link and unlink', () => {
  function setup() {
    const prisma = {
      device: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
      devicePairingCode: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const events = { emitToOrg: jest.fn() };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const subscriptions = {
      ensureTrial: jest.fn().mockResolvedValue({}),
      forOrganization: jest.fn().mockResolvedValue({ active: true }),
      assertCanPair: jest.fn(),
    };
    const chats = {
      ensureThreadForPairedDevice: jest.fn().mockResolvedValue({ id: 't1' }),
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('new-device-jwt'),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
      get: jest.fn().mockReturnValue('30d'),
    };
    const service = new DevicesService(
      prisma as never,
      jwt as never,
      config as never,
      events as never,
      audit as never,
      {} as never,
      subscriptions as never,
      chats as never,
    );
    return { prisma, events, subscriptions, chats, service };
  }

  it('lists mutual peers for the invitee as well as the issuer', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst
      .mockResolvedValueOnce({
        id: 'user-2',
        linkedFromDeviceId: 'user-1',
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        name: 'Issuer',
        status: 'ONLINE',
        lastSeen: new Date('2026-01-01'),
        deviceModel: 'Pixel',
        capabilitiesJson: {},
        disabled: false,
      });
    prisma.device.findMany.mockResolvedValue([]);

    const list = await service.listLinkedForDevice('user-2', 'org-2');
    expect(list).toEqual([
      expect.objectContaining({ id: 'user-1', name: 'Issuer' }),
    ]);
  });

  it('unlinks without deleting so admin can still see the device', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst
      .mockResolvedValueOnce({
        id: 'user-1',
        organizationId: 'org-1',
        linkedFromDeviceId: null,
        name: 'Issuer',
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        organizationId: 'org-1',
        linkedFromDeviceId: 'user-1',
        name: 'Qul',
      });
    prisma.user.findFirst.mockResolvedValue({ id: 'viewer-user' });
    prisma.device.update.mockResolvedValue({ id: 'user-2' });

    await expect(
      service.unlinkLinkedDevice('user-1', 'org-1', 'user-2'),
    ).resolves.toEqual({ ok: true });
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { linkedFromDeviceId: null },
    });
    expect(prisma.device.delete).not.toHaveBeenCalled();
  });

  it('blocks a second live link while one is still connected', async () => {
    const { prisma, subscriptions, service } = setup();
    prisma.devicePairingCode.findUnique.mockResolvedValue({
      id: 'code-1',
      code: 'ABC123',
      organizationId: 'org-1',
      branchId: 'b1',
      issuerDeviceId: 'user-1',
      issuerUserId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.device.findFirst
      .mockResolvedValueOnce({
        id: 'user-3',
        name: 'New',
        organizationId: 'org-x',
        branchId: 'bx',
        disabled: false,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        organizationId: 'org-1',
        disabled: false,
      });
    prisma.device.count.mockResolvedValue(2);

    await expect(service.linkExistingDevice('user-3', 'ABC123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(subscriptions.assertCanPair).not.toHaveBeenCalled();
    expect(prisma.device.update).not.toHaveBeenCalled();
  });

  it('allows linking another phone after unlink even if org already has two devices', async () => {
    const { prisma, service } = setup();
    prisma.devicePairingCode.findUnique.mockResolvedValue({
      id: 'code-2',
      code: 'XYZ789',
      organizationId: 'org-1',
      branchId: 'b1',
      issuerDeviceId: 'user-1',
      issuerUserId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.device.findFirst
      .mockResolvedValueOnce({
        id: 'user-3',
        name: 'New',
        organizationId: 'org-x',
        branchId: 'bx',
        disabled: false,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        organizationId: 'org-1',
        disabled: false,
      });
    prisma.device.count.mockResolvedValue(1);
    prisma.device.update.mockResolvedValue({
      id: 'user-3',
      name: 'New',
      organizationId: 'org-x',
      branchId: 'bx',
      linkedFromDeviceId: 'user-1',
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'peer-3' });

    const result = await service.linkExistingDevice('user-3', 'XYZ789');
    expect(result).toMatchObject({
      ok: true,
      linkedToDeviceId: 'user-1',
      organizationId: 'org-x',
      deviceToken: 'new-device-jwt',
    });
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: 'user-3' },
      data: {
        linkedFromDeviceId: 'user-1',
      },
    });
  });

  it('rejects linking a device to itself', async () => {
    const { prisma, service } = setup();
    prisma.devicePairingCode.findUnique.mockResolvedValue({
      id: 'code-3',
      code: 'SELF01',
      organizationId: 'org-1',
      branchId: 'b1',
      issuerDeviceId: 'user-1',
      issuerUserId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.device.findFirst.mockResolvedValue({
      id: 'user-1',
      name: 'Me',
      organizationId: 'org-1',
      branchId: 'b1',
      disabled: false,
    });

    await expect(service.linkExistingDevice('user-1', 'SELF01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows the invitee to unlink the issuer (mutual live pair)', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst
      .mockResolvedValueOnce({
        id: 'user-2',
        organizationId: 'org-2',
        linkedFromDeviceId: 'user-1',
        name: 'Invitee',
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        organizationId: 'org-1',
        linkedFromDeviceId: null,
        name: 'Issuer',
      });
    prisma.user.findFirst.mockResolvedValue({ id: 'viewer-user' });
    prisma.device.update.mockResolvedValue({ id: 'user-2' });

    await expect(
      service.unlinkLinkedDevice('user-2', 'org-2', 'user-1'),
    ).resolves.toEqual({ ok: true });
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { linkedFromDeviceId: null },
    });
  });

  it('forbids unlinking someone else’s device', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst.mockResolvedValue(null);
    await expect(
      service.unlinkLinkedDevice('user-1', 'org-1', 'stranger'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
