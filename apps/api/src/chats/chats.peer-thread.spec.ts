import { ChatsService } from './chats.service';

describe('ensureThreadForPairedDevice', () => {
  function setup() {
    const prisma = {
      user: {
        findFirst: jest.fn(),
      },
      chatThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread-1' }),
      },
    };
    const service = new ChatsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  }

  it('creates thread in issuer org when owner and peer are in different orgs', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({
      id: 'issuer-user',
      organizationId: 'org-issuer',
    });

    await service.ensureThreadForPairedDevice({
      organizationId: 'org-invitee-wrong',
      deviceId: 'device-2',
      deviceName: 'Shohruh',
      peerUserId: 'peer-2',
      ownerUserId: 'issuer-user',
    });

    expect(prisma.chatThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_ownerUserId_peerUserId: {
            organizationId: 'org-issuer',
            ownerUserId: 'issuer-user',
            peerUserId: 'peer-2',
          },
        },
        create: expect.objectContaining({
          organizationId: 'org-issuer',
          deviceId: 'device-2',
        }),
      }),
    );
  });
});
