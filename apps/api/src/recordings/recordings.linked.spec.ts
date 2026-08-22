import { ForbiddenException } from '@nestjs/common';
import { RecordingsService } from './recordings.service';

describe('linked viewer recordings (Pro+ history)', () => {
  function setup() {
    const prisma = {
      organization: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      device: {
        findFirst: jest.fn(),
      },
      recordingSegment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 0 } }),
      },
      $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    };
    const events = { emitToOrg: jest.fn() };
    const audit = { log: jest.fn() };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('playback-jwt'),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'RECORDINGS_DIR') return './uploads/recordings';
        if (key === 'FFMPEG_PATH') return 'ffmpeg';
        if (key === 'MEDIAMTX_RTSP_BASE') return 'rtsp://127.0.0.1:8554';
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
    };
    const subscriptions = {
      assertCanWatch: jest.fn().mockResolvedValue({
        ok: true,
        view: { canRecordings: true, canWatchAudio: true },
      }),
    };
    const service = new RecordingsService(
      prisma as never,
      events as never,
      audit as never,
      jwt as never,
      config as never,
      subscriptions as never,
    );
    return { prisma, subscriptions, jwt, service };
  }

  afterEach(() => {
    // Clear maintenance interval so Jest can exit.
  });

  it('blocks history list without Pro+', async () => {
    const { subscriptions, service } = setup();
    subscriptions.assertCanWatch.mockResolvedValue({ ok: false, reason: 'upgrade' });
    await expect(
      service.listForLinkedViewer('viewer-1', 'org-viewer', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    service.onModuleDestroy();
  });

  it('lists only last 3 days for linked target', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst.mockResolvedValue({
      id: 'target-1',
      organizationId: 'org-target',
      linkedFromDeviceId: 'viewer-1',
      disabled: false,
      name: 'Tan',
      capabilitiesJson: null,
    });
    prisma.recordingSegment.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        status: 'READY',
        startedAt: new Date(),
        deviceId: 'target-1',
      },
    ]);
    prisma.recordingSegment.count.mockResolvedValue(1);

    const result = await service.listForLinkedViewer(
      'viewer-1',
      'org-viewer',
      'target-1',
    );
    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: { id: 'target-1' },
    });
    expect(result.items).toHaveLength(1);
    const whereArg = prisma.recordingSegment.findMany.mock.calls[0][0].where;
    expect(whereArg.deviceId).toBe('target-1');
    expect(whereArg.startedAt?.gte).toBeInstanceOf(Date);
    const ageMs = Date.now() - whereArg.startedAt.gte.getTime();
    expect(ageMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
    service.onModuleDestroy();
  });

  it('rejects playback for non-linked device', async () => {
    const { prisma, service } = setup();
    prisma.recordingSegment.findFirst.mockResolvedValue({
      id: 'rec-1',
      status: 'READY',
      startedAt: new Date(),
      deviceId: 'stranger',
      organizationId: 'org-x',
      device: { id: 'stranger' },
    });
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      service.playbackTokenForLinkedViewer(
        'viewer-1',
        'org-viewer',
        'viewer-1',
        'rec-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    service.onModuleDestroy();
  });

  it('rejects playback older than 3 days', async () => {
    const { prisma, service } = setup();
    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    prisma.recordingSegment.findFirst.mockResolvedValue({
      id: 'rec-old',
      status: 'READY',
      startedAt: old,
      deviceId: 'target-1',
      organizationId: 'org-target',
      device: { id: 'target-1' },
    });
    prisma.device.findFirst.mockResolvedValue({
      id: 'target-1',
      linkedFromDeviceId: 'viewer-1',
      disabled: false,
    });

    await expect(
      service.playbackTokenForLinkedViewer(
        'viewer-1',
        'org-viewer',
        'viewer-1',
        'rec-old',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    service.onModuleDestroy();
  });

  it('starts recording for linked Pro+ viewer and sets 3-day retention', async () => {
    const { prisma, service } = setup();
    prisma.device.findFirst.mockResolvedValue({
      id: 'target-1',
      organizationId: 'org-target',
      linkedFromDeviceId: 'viewer-1',
      disabled: false,
      name: 'Tan',
      capabilitiesJson: { cameraFacing: 'FRONT' },
    });

    const result = await service.startForLinkedViewer(
      'viewer-1',
      'org-viewer',
      'target-1',
    );
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-target' },
      data: { recordingRetentionDays: 3 },
    });
    expect(result.ok).toBe(true);
    expect(result.deviceId).toBe('target-1');
    await service.stop('org-target', 'target-1');
    service.onModuleDestroy();
  });

  it('issues playback url for ready linked recording within 3 days', async () => {
    const { prisma, jwt, service } = setup();
    prisma.recordingSegment.findFirst
      .mockResolvedValueOnce({
        id: 'rec-1',
        status: 'READY',
        startedAt: new Date(),
        deviceId: 'target-1',
        organizationId: 'org-target',
        device: { id: 'target-1' },
      })
      .mockResolvedValueOnce({
        id: 'rec-1',
        status: 'READY',
        startedAt: new Date(),
        organizationId: 'org-target',
        storagePath: 'org-target/target-1/rec-1.webm',
        deviceName: 'Tan',
        cameraFacing: 'FRONT',
      });
    prisma.device.findFirst.mockResolvedValue({
      id: 'target-1',
      linkedFromDeviceId: 'viewer-1',
      disabled: false,
    });

    const result = await service.playbackTokenForLinkedViewer(
      'viewer-1',
      'org-viewer',
      'viewer-1',
      'rec-1',
    );
    expect(jwt.signAsync).toHaveBeenCalled();
    expect(result.url).toContain('/recordings/rec-1/media?token=');
    service.onModuleDestroy();
  });
});
