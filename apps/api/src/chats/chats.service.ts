import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMessageType, UserRole } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async ensureThreadForPairedDevice(params: {
    organizationId: string;
    deviceId: string;
    deviceName: string;
    peerUserId: string;
  }) {
    const owner = await this.prisma.user.findFirst({
      where: {
        organizationId: params.organizationId,
        role: { in: [UserRole.ADMIN, UserRole.OWNER] },
        blocked: false,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) return null;

    return this.prisma.chatThread.upsert({
      where: {
        organizationId_ownerUserId_peerUserId: {
          organizationId: params.organizationId,
          ownerUserId: owner.id,
          peerUserId: params.peerUserId,
        },
      },
      update: { deviceId: params.deviceId },
      create: {
        organizationId: params.organizationId,
        ownerUserId: owner.id,
        peerUserId: params.peerUserId,
        deviceId: params.deviceId,
        lastMessagePreview: params.deviceName,
      },
    });
  }

  async listForAdmin(organizationId: string, userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: { organizationId },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true } },
        peer: { select: { id: true, name: true, email: true, role: true, deviceId: true } },
        device: { select: { id: true, name: true, status: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'chat.list_viewed',
      resourceType: 'ChatThread',
    });
    return threads;
  }

  async listForDevice(organizationId: string, deviceId: string) {
    return this.prisma.chatThread.findMany({
      where: { organizationId, deviceId },
      include: {
        owner: { select: { id: true, name: true, role: true, lastSeenAt: true } },
        peer: { select: { id: true, name: true, role: true, lastSeenAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async messagesForAdmin(
    organizationId: string,
    userId: string,
    threadId: string,
    cursor?: string,
    take = 40,
  ) {
    await this.assertThread(organizationId, threadId);
    await this.audit.log({
      organizationId,
      userId,
      action: 'chat.messages_viewed',
      resourceType: 'ChatThread',
      resourceId: threadId,
    });
    return this.pageMessages(threadId, cursor, take);
  }

  async messagesForDevice(
    organizationId: string,
    deviceId: string,
    threadId: string,
    cursor?: string,
    take = 40,
  ) {
    await this.assertDeviceThread(organizationId, deviceId, threadId);
    return this.pageMessages(threadId, cursor, take);
  }

  async sendFromDevice(
    organizationId: string,
    deviceId: string,
    threadId: string,
    text: string,
  ) {
    const thread = await this.assertDeviceThread(organizationId, deviceId, threadId);
    const peer = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    if (!peer) {
      throw new ForbiddenException('No user account for this device');
    }
    return this.appendMessage({
      thread,
      senderUserId: peer.id,
      receiverUserId: thread.ownerUserId,
      text,
    });
  }

  async sendFromAdmin(
    organizationId: string,
    userId: string,
    threadId: string,
    text: string,
  ) {
    throw new ForbiddenException('Admin cannot send chat messages');
  }

  private async pageMessages(threadId: string, cursor?: string, take = 40) {
    const items = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 80),
    });
    return {
      items: items.reverse(),
      nextCursor: items.length ? items[0].createdAt.toISOString() : null,
    };
  }

  private async appendMessage(params: {
    thread: { id: string; organizationId: string };
    senderUserId: string;
    receiverUserId: string;
    text: string;
  }) {
    const trimmed = params.text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message text is required');
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        threadId: params.thread.id,
        senderUserId: params.senderUserId,
        receiverUserId: params.receiverUserId,
        messageType: ChatMessageType.TEXT,
        text: trimmed,
        deliveredAt: new Date(),
      },
    });
    await this.prisma.chatThread.update({
      where: { id: params.thread.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: trimmed.slice(0, 140),
      },
    });
    this.chatGateway.emitToOrg(params.thread.organizationId, 'chat.message', {
      threadId: params.thread.id,
      message,
    });
    return message;
  }

  async markRead(organizationId: string, deviceId: string, threadId: string) {
    const thread = await this.assertDeviceThread(organizationId, deviceId, threadId);
    const reader = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    await this.prisma.chatMessage.updateMany({
      where: {
        threadId: thread.id,
        readAt: null,
        senderUserId: { not: reader?.id ?? '' },
      },
      data: { readAt: new Date() },
    });
    this.chatGateway.emitToOrg(organizationId, 'chat.read', { threadId });
    return { ok: true };
  }

  private async assertThread(organizationId: string, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, organizationId },
    });
    if (!thread) throw new NotFoundException('Chat not found');
    return thread;
  }

  private async assertDeviceThread(
    organizationId: string,
    deviceId: string,
    threadId: string,
  ) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, organizationId, deviceId },
    });
    if (!thread) throw new ForbiddenException('Chat not found');
    return thread;
  }
}
