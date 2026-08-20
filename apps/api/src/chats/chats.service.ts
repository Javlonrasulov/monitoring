import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatMessageType,
  ChatThreadKind,
  Prisma,
  UserRole,
} from '../generated/prisma';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChatGateway } from './chat.gateway';
import { ChatStorageService } from './chat-storage.service';
import { ALLOWED_REACTIONS, InitUploadDto } from './chats.dto';
import type { Request, Response } from 'express';
import { seesAllOrganizations } from '../auth/platform-org';

const URL_RE = /https?:\/\/[^\s]+/i;
const CALL_CENTER_NAME = 'Call Center';
const SUPPORT_WELCOME =
  'Welcome to Call Center support. Please describe your issue in detail and attach screenshots or photos if helpful. Our team will reply as soon as possible.';

type ThreadRow = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  peerUserId: string;
  deviceId: string | null;
  kind?: ChatThreadKind;
};

const threadUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  lastSeenAt: true,
  avatarKey: true,
  avatarUpdatedAt: true,
  phone: true,
  deviceId: true,
} as const;

const threadInclude = {
  owner: { select: threadUserSelect },
  peer: { select: threadUserSelect },
  device: { select: { id: true, name: true, status: true, lastSeen: true } },
} as const;

type MessageInclude = Prisma.ChatMessageGetPayload<{
  include: {
    reactions: true;
    replyTo: true;
    forwardedFrom: true;
  };
}>;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly chatGateway: ChatGateway,
    private readonly storage: ChatStorageService,
  ) {}

  async ensureThreadForPairedDevice(params: {
    organizationId: string;
    deviceId: string;
    deviceName: string;
    peerUserId: string;
    ownerUserId?: string | null;
  }) {
    const owner =
      (params.ownerUserId
        ? await this.prisma.user.findFirst({
            where: {
              id: params.ownerUserId,
              organizationId: params.organizationId,
              blocked: false,
            },
          })
        : null) ??
      (await this.prisma.user.findFirst({
        where: {
          organizationId: params.organizationId,
          role: { in: [UserRole.ADMIN, UserRole.OWNER] },
          blocked: false,
        },
        orderBy: { createdAt: 'asc' },
      }));
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
      },
    });
  }

  async listForAdmin(organizationId: string, userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: seesAllOrganizations(organizationId)
        ? { kind: ChatThreadKind.PEER }
        : { organizationId, kind: ChatThreadKind.PEER },
      include: threadInclude,
      orderBy: { lastMessageAt: 'desc' },
    });
    const unread = await this.unreadMap(
      threads.map((t) => t.id),
      userId,
    );
    await this.audit.log({
      organizationId,
      userId,
      action: 'chat.list_viewed',
      resourceType: 'ChatThread',
    });
    return threads.map((thread) =>
      this.presentThread(thread, userId, unread.get(thread.id) ?? 0, true),
    );
  }

  async listForDevice(organizationId: string, deviceId: string) {
    const viewer = await this.deviceUser(organizationId, deviceId);
    await this.prisma.user.updateMany({
      where: { id: viewer.id },
      data: { lastSeenAt: new Date() },
    });
    const threads = await this.prisma.chatThread.findMany({
      where: {
        organizationId,
        OR: [
          { deviceId },
          { ownerUserId: viewer.id },
          { peerUserId: viewer.id },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, role: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true } },
        peer: { select: { id: true, name: true, role: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true } },
        device: { select: { id: true, name: true, status: true, lastSeen: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    const unread = await this.unreadMap(
      threads.map((t) => t.id),
      viewer.id,
    );
    return threads
      .filter((thread) => thread.kind !== ChatThreadKind.SUPPORT)
      .filter((thread) => {
        const counterpart =
          thread.owner.id === viewer.id ? thread.peer : thread.owner;
        return counterpart.role === UserRole.USER;
      })
      .map((thread) =>
        this.presentThread(thread, viewer.id, unread.get(thread.id) ?? 0, false),
      );
  }

  async listSupportForAdmin(organizationId: string, userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: seesAllOrganizations(organizationId)
        ? { kind: ChatThreadKind.SUPPORT }
        : { organizationId, kind: ChatThreadKind.SUPPORT },
      include: threadInclude,
      orderBy: { lastMessageAt: 'desc' },
    });
    const unread = await this.unreadMap(
      threads.map((t) => t.id),
      userId,
    );
    await this.audit.log({
      organizationId,
      userId,
      action: 'chat.support_list_viewed',
      resourceType: 'ChatThread',
    });
    return threads.map((thread) =>
      this.presentThread(thread, userId, unread.get(thread.id) ?? 0, true),
    );
  }

  async openSupportForDevice(organizationId: string, deviceId: string) {
    const customer = await this.deviceUser(organizationId, deviceId);
    const thread = await this.ensureSupportThread(
      organizationId,
      customer.id,
      deviceId,
    );
    const count = await this.prisma.chatMessage.count({
      where: { threadId: thread.id },
    });
    if (count === 0) {
      await this.appendSystemMessage(thread, SUPPORT_WELCOME, customer.id);
    }
    const unread = await this.unreadMap([thread.id], customer.id);
    return this.presentThread(thread, customer.id, unread.get(thread.id) ?? 0, false);
  }

  async openSupportForAdmin(
    organizationId: string,
    adminUserId: string,
    peerUserId: string,
  ) {
    const customer = await this.prisma.user.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id: peerUserId, role: UserRole.USER, deviceId: { not: null } }
        : {
            id: peerUserId,
            organizationId,
            role: UserRole.USER,
            deviceId: { not: null },
          },
    });
    if (!customer?.deviceId) {
      throw new NotFoundException('App user not found');
    }
    const thread = await this.ensureSupportThread(
      customer.organizationId,
      customer.id,
      customer.deviceId,
    );
    const count = await this.prisma.chatMessage.count({
      where: { threadId: thread.id },
    });
    if (count === 0) {
      await this.appendSystemMessage(thread, SUPPORT_WELCOME, customer.id);
    }
    const unread = await this.unreadMap([thread.id], adminUserId);
    return this.presentThread(thread, adminUserId, unread.get(thread.id) ?? 0, true);
  }

  async threadForAdmin(organizationId: string, userId: string, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id: threadId }
        : { id: threadId, organizationId },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true } },
        peer: {
          select: { id: true, name: true, email: true, role: true, deviceId: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true },
        },
        device: { select: { id: true, name: true, status: true, lastSeen: true } },
      },
    });
    if (!thread) throw new NotFoundException('Chat not found');
    const unread = await this.unreadMap([thread.id], userId);
    return this.presentThread(thread, userId, unread.get(thread.id) ?? 0, true);
  }

  async threadForDevice(organizationId: string, deviceId: string, threadId: string) {
    const viewer = await this.deviceUser(organizationId, deviceId);
    const thread = await this.prisma.chatThread.findFirst({
      where: this.deviceThreadWhere(organizationId, deviceId, viewer.id, threadId),
      include: {
        owner: { select: { id: true, name: true, role: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true } },
        peer: { select: { id: true, name: true, role: true, lastSeenAt: true, avatarKey: true, avatarUpdatedAt: true, phone: true } },
        device: { select: { id: true, name: true, status: true, lastSeen: true } },
      },
    });
    if (!thread) throw new ForbiddenException('Chat not found');
    const unread = await this.unreadMap([thread.id], viewer.id);
    return this.presentThread(thread, viewer.id, unread.get(thread.id) ?? 0, false);
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
    return this.pageMessages(threadId, userId, cursor, take, { audit: true });
  }

  async messagesForDevice(
    organizationId: string,
    deviceId: string,
    threadId: string,
    cursor?: string,
    take = 40,
  ) {
    await this.assertDeviceThread(organizationId, deviceId, threadId);
    const viewer = await this.deviceUser(organizationId, deviceId);
    return this.pageMessages(threadId, viewer.id, cursor, take, { audit: false });
  }

  async searchMessages(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    query: string,
    deviceId?: string,
    audit = false,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const q = query.trim().slice(0, 120);
    if (q.length < 1) return { items: [] };
    const hidden = audit
      ? []
      : (
          await this.prisma.chatMessageHide.findMany({
            where: { userId: viewerUserId, message: { threadId } },
            select: { messageId: true },
          })
        ).map((h) => h.messageId);
    const items = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        id: hidden.length ? { notIn: hidden } : undefined,
        deletedForEveryone: audit ? undefined : false,
        OR: [
          { text: { contains: q, mode: 'insensitive' } },
          { fileName: { contains: q, mode: 'insensitive' } },
          { sender: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return {
      items: items.map((item) => this.presentMessage(item, viewerUserId, audit)),
    };
  }

  async mediaForThread(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    kind: string,
    deviceId?: string,
    audit = false,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const typeMap: Record<string, ChatMessageType[] | 'links'> = {
      photos: [ChatMessageType.IMAGE],
      videos: [ChatMessageType.VIDEO],
      notes: [ChatMessageType.VIDEO_NOTE],
      files: [ChatMessageType.FILE],
      voice: [ChatMessageType.VOICE],
      media: [ChatMessageType.IMAGE, ChatMessageType.VIDEO, ChatMessageType.VIDEO_NOTE],
      links: 'links',
    };
    const mapped = typeMap[kind] ?? typeMap.media;
    const hidden = audit
      ? []
      : (
          await this.prisma.chatMessageHide.findMany({
            where: { userId: viewerUserId, message: { threadId } },
            select: { messageId: true },
          })
        ).map((h) => h.messageId);
    const where: Prisma.ChatMessageWhereInput = {
      threadId,
      id: hidden.length ? { notIn: hidden } : undefined,
      deletedForEveryone: audit ? undefined : false,
      ...(mapped === 'links'
        ? { messageType: ChatMessageType.TEXT, text: { contains: 'http' } }
        : { messageType: { in: mapped } }),
    };
    const items = await this.prisma.chatMessage.findMany({
      where,
      include: { reactions: true, replyTo: true, forwardedFrom: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const counts = await this.mediaCounts(threadId, hidden, audit);
    return {
      counts,
      items: items.map((item) => this.presentMessage(item, viewerUserId, audit)),
    };
  }

  async sendFromDevice(
    organizationId: string,
    deviceId: string,
    threadId: string,
    text: string,
    extras?: { replyToId?: string; clientId?: string; forwardedFromId?: string },
  ) {
    const thread = await this.assertDeviceThread(organizationId, deviceId, threadId);
    const peer = await this.deviceUser(organizationId, deviceId);
    return this.appendText({
      thread,
      senderUserId: peer.id,
      receiverUserId: this.otherUserId(thread, peer.id),
      text,
      replyToId: extras?.replyToId,
      clientId: extras?.clientId,
      forwardedFromId: extras?.forwardedFromId,
    });
  }

  async sendFromAdmin(
    organizationId: string,
    userId: string,
    role: string,
    threadId: string,
    text: string,
    extras?: { replyToId?: string; clientId?: string; forwardedFromId?: string },
  ) {
    if (role === UserRole.VIEWER) {
      throw new ForbiddenException('Viewer cannot send chat messages');
    }
    const thread = await this.assertThread(organizationId, threadId);
    return this.appendText({
      thread,
      senderUserId: userId,
      receiverUserId: thread.peerUserId,
      text,
      replyToId: extras?.replyToId,
      clientId: extras?.clientId,
      forwardedFromId: extras?.forwardedFromId,
    });
  }

  async initUploadFromDevice(
    organizationId: string,
    deviceId: string,
    threadId: string,
    dto: InitUploadDto,
  ) {
    const thread = await this.assertDeviceThread(organizationId, deviceId, threadId);
    const sender = await this.deviceUser(organizationId, deviceId);
    return this.initUpload(thread, sender.id, this.otherUserId(thread, sender.id), dto);
  }

  async initUploadFromAdmin(
    organizationId: string,
    userId: string,
    role: string,
    threadId: string,
    dto: InitUploadDto,
  ) {
    if (role === UserRole.VIEWER) {
      throw new ForbiddenException('Viewer cannot send chat messages');
    }
    const thread = await this.assertThread(organizationId, threadId);
    return this.initUpload(thread, userId, thread.peerUserId, dto);
  }

  async putChunk(
    organizationId: string,
    uploadId: string,
    index: number,
    req: Request,
    threadId: string,
    actorUserId: string,
  ) {
    await this.assertUploadSession(organizationId, uploadId, threadId, actorUserId);
    return this.storage.writeChunk(uploadId, index, req);
  }

  async completeUpload(
    organizationId: string,
    actorUserId: string,
    uploadId: string,
    threadId: string,
  ) {
    const session = await this.assertUploadSession(
      organizationId,
      uploadId,
      threadId,
      actorUserId,
    );
    await this.storage.markCompleting(uploadId);
    if (session.replyToId) {
      const original = await this.prisma.chatMessage.findFirst({
        where: { id: session.replyToId, threadId: session.threadId },
        select: { id: true },
      });
      if (!original) session.replyToId = undefined;
    }
    const messageId = randomUUID();
    const storageKey = this.storage.storageKey(
      session.organizationId,
      session.threadId,
      messageId,
      session.fileName,
    );
    const fileSize = await this.storage.assemble(uploadId, storageKey);
    const preview = this.previewFor(session.messageType, session.fileName, session.text);
    const message = await this.prisma.chatMessage.create({
      data: {
        id: messageId,
        threadId: session.threadId,
        senderUserId: session.senderUserId,
        receiverUserId: session.receiverUserId,
        messageType: session.messageType,
        text: session.text?.trim() || null,
        deliveredAt: new Date(),
        replyToId: session.replyToId,
        clientId: session.clientId,
        albumId: session.albumId,
        fileName: session.fileName,
        fileSize,
        mimeType: session.mimeType,
        durationMs: session.durationMs,
        width: session.width,
        height: session.height,
        storageKey,
        waveformJson: session.waveformJson,
      },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
    });
    await this.prisma.chatThread.update({
      where: { id: session.threadId },
      data: { lastMessageAt: message.createdAt, lastMessagePreview: preview },
    });
    await this.storage.removeSession(uploadId);
    const presented = this.presentMessage(message, actorUserId, false);
    this.chatGateway.emitToOrg(organizationId, 'chat.message', {
      threadId: session.threadId,
      message: presented,
    });
    return presented;
  }

  async cancelUpload(
    organizationId: string,
    uploadId: string,
    threadId: string,
    actorUserId: string,
  ) {
    await this.assertUploadSession(organizationId, uploadId, threadId, actorUserId);
    await this.storage.removeSession(uploadId);
    return { ok: true };
  }

  async saveThumbnail(
    organizationId: string,
    threadId: string,
    messageId: string,
    req: Request,
    actorUserId: string,
    deviceId?: string,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderUserId !== actorUserId) {
      throw new ForbiddenException('Only the sender can attach a thumbnail');
    }
    const key = this.storage.thumbnailKey(organizationId, threadId, messageId);
    await this.storage.writeThumbnail(key, req);
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { thumbnailKey: key },
    });
    return { ok: true };
  }

  async streamAttachment(
    req: Request,
    res: Response,
    organizationId: string,
    threadId: string,
    messageId: string,
    kind: 'file' | 'thumb',
    download: boolean,
    deviceId?: string,
    audit = false,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new NotFoundException('File not found');
    if (!audit && message.deletedForEveryone) {
      throw new NotFoundException('File not found');
    }
    if (!audit) {
      const viewerId = deviceId
        ? (await this.deviceUser(organizationId, deviceId)).id
        : null;
      if (viewerId) {
        const hidden = await this.prisma.chatMessageHide.findUnique({
          where: { messageId_userId: { messageId, userId: viewerId } },
        });
        if (hidden) throw new NotFoundException('File not found');
      }
    }
    const key = kind === 'thumb' ? message.thumbnailKey : message.storageKey;
    if (!key) throw new NotFoundException('File not found');
    await this.storage.streamFile(
      req,
      res,
      key,
      kind === 'thumb' ? 'image/jpeg' : message.mimeType || 'application/octet-stream',
      kind === 'thumb' ? 'thumb.jpg' : message.fileName || 'file',
      download,
    );
  }

  async editMessage(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    messageId: string,
    text: string,
    deviceId?: string,
  ) {
    const message = await this.loadOwnedMessage(
      organizationId,
      viewerUserId,
      threadId,
      messageId,
      deviceId,
    );
    if (message.messageType !== ChatMessageType.TEXT) {
      throw new BadRequestException('Only text messages can be edited');
    }
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('Message text is required');
    const updated = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: { text: trimmed, editedAt: new Date() },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
    });
    const presented = this.presentMessage(updated, viewerUserId, false);
    this.chatGateway.emitToOrg(organizationId, 'chat.message.updated', {
      threadId,
      message: presented,
    });
    return presented;
  }

  async deleteMessage(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    messageId: string,
    forEveryone: boolean,
    deviceId?: string,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (forEveryone) {
      if (message.senderUserId !== viewerUserId) {
        throw new ForbiddenException('Only the sender can delete for everyone');
      }
      const updated = await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), deletedForEveryone: true },
        include: { reactions: true, replyTo: true, forwardedFrom: true },
      });
      this.chatGateway.emitToOrg(organizationId, 'chat.message.deleted', {
        threadId,
        messageId,
        forEveryone: true,
        message: this.presentMessage(updated, viewerUserId, false),
      });
      return { ok: true };
    }
    await this.prisma.chatMessageHide.upsert({
      where: { messageId_userId: { messageId, userId: viewerUserId } },
      update: {},
      create: { messageId, userId: viewerUserId },
    });
    this.chatGateway.emitToOrg(organizationId, 'chat.message.deleted', {
      threadId,
      messageId,
      forEveryone: false,
      userId: viewerUserId,
    });
    return { ok: true };
  }

  async react(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    messageId: string,
    emoji: string,
    deviceId?: string,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    if (!ALLOWED_REACTIONS.includes(emoji)) {
      throw new BadRequestException('Unsupported reaction');
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new NotFoundException('Message not found');
    const existing = await this.prisma.chatReaction.findUnique({
      where: { messageId_userId: { messageId, userId: viewerUserId } },
    });
    if (existing?.emoji === emoji) {
      await this.prisma.chatReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.chatReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
    } else {
      await this.prisma.chatReaction.create({
        data: { messageId, userId: viewerUserId, emoji },
      });
    }
    const fresh = await this.prisma.chatMessage.findFirstOrThrow({
      where: { id: messageId },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
    });
    const presented = this.presentMessage(fresh, viewerUserId, false);
    this.chatGateway.emitToOrg(organizationId, 'chat.message.updated', {
      threadId,
      message: presented,
    });
    return presented;
  }

  async markRead(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    deviceId?: string,
    role?: string,
  ) {
    if (role === UserRole.VIEWER) {
      return { ok: true };
    }
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const updated = await this.prisma.chatMessage.updateMany({
      where: {
        threadId,
        readAt: null,
        senderUserId: { not: viewerUserId },
      },
      data: { readAt: new Date() },
    });
    await this.prisma.user.updateMany({
      where: { id: viewerUserId },
      data: { lastSeenAt: new Date() },
    });
    if (updated.count > 0) {
      this.chatGateway.emitToOrg(organizationId, 'chat.read', {
        threadId,
        userId: viewerUserId,
      });
    }
    return { ok: true };
  }

  async markReadDevice(organizationId: string, deviceId: string, threadId: string) {
    const viewer = await this.deviceUser(organizationId, deviceId);
    return this.markRead(organizationId, viewer.id, threadId, deviceId);
  }

  private async initUpload(
    thread: ThreadRow,
    senderUserId: string,
    receiverUserId: string,
    dto: InitUploadDto,
  ) {
    if (dto.replyToId) {
      await this.assertReply(thread.id, dto.replyToId);
    }
    const session = await this.storage.createSession({
      organizationId: thread.organizationId,
      threadId: thread.id,
      senderUserId,
      receiverUserId,
      messageType: dto.messageType,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      durationMs: dto.durationMs,
      width: dto.width,
      height: dto.height,
      replyToId: dto.replyToId,
      clientId: dto.clientId,
      albumId: dto.albumId,
      waveformJson: dto.waveformJson,
      text: dto.text,
    });
    return {
      uploadId: session.uploadId,
      chunkSize: session.chunkSize,
      receivedChunks: 0,
    };
  }

  private async appendText(params: {
    thread: ThreadRow;
    senderUserId: string;
    receiverUserId: string;
    text: string;
    replyToId?: string;
    clientId?: string;
    forwardedFromId?: string;
  }) {
    const trimmed = (params.text ?? '').trim();
    if (!trimmed && !params.forwardedFromId) {
      throw new BadRequestException('Message text is required');
    }
    if (params.replyToId) {
      await this.assertReply(params.thread.id, params.replyToId);
    }
    let forwarded: {
      messageType: ChatMessageType;
      text: string | null;
      fileName: string | null;
      fileSize: number | null;
      mimeType: string | null;
      durationMs: number | null;
      width: number | null;
      height: number | null;
      storageKey: string | null;
      thumbnailKey: string | null;
      waveformJson: string | null;
    } | null = null;
    if (params.forwardedFromId) {
      forwarded = await this.prisma.chatMessage.findFirst({
        where: { id: params.forwardedFromId, threadId: params.thread.id },
        select: {
          messageType: true,
          text: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          durationMs: true,
          width: true,
          height: true,
          storageKey: true,
          thumbnailKey: true,
          waveformJson: true,
        },
      });
      if (!forwarded) throw new NotFoundException('Original message not found');
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        threadId: params.thread.id,
        senderUserId: params.senderUserId,
        receiverUserId: params.receiverUserId,
        messageType: forwarded?.messageType ?? ChatMessageType.TEXT,
        text: trimmed || forwarded?.text,
        deliveredAt: new Date(),
        replyToId: params.replyToId,
        clientId: params.clientId,
        forwardedFromId: params.forwardedFromId,
        fileName: forwarded?.fileName,
        fileSize: forwarded?.fileSize,
        mimeType: forwarded?.mimeType,
        durationMs: forwarded?.durationMs,
        width: forwarded?.width,
        height: forwarded?.height,
        storageKey: forwarded?.storageKey,
        thumbnailKey: forwarded?.thumbnailKey,
        waveformJson: forwarded?.waveformJson,
      },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
    });
    await this.prisma.chatThread.update({
      where: { id: params.thread.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: (trimmed || forwarded?.fileName || 'Forwarded').slice(0, 140),
      },
    });
    const presented = this.presentMessage(message, params.senderUserId, false);
    this.chatGateway.emitToOrg(params.thread.organizationId, 'chat.message', {
      threadId: params.thread.id,
      message: presented,
    });
    return presented;
  }

  private async pageMessages(
    threadId: string,
    viewerUserId: string,
    cursor: string | undefined,
    take: number,
    opts: { audit: boolean },
  ) {
    const hidden = opts.audit
      ? []
      : (
          await this.prisma.chatMessageHide.findMany({
            where: { userId: viewerUserId, message: { threadId } },
            select: { messageId: true },
          })
        ).map((h) => h.messageId);
    const limited = Math.min(Math.max(take, 1), 80);
    const items = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        id: hidden.length ? { notIn: hidden } : undefined,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
      orderBy: { createdAt: 'desc' },
      take: limited,
    });
    const chronological = items.slice().reverse();
    return {
      items: chronological.map((item) =>
        this.presentMessage(item, viewerUserId, opts.audit),
      ),
      nextCursor:
        items.length === limited
          ? chronological[0]?.createdAt.toISOString() ?? null
          : null,
    };
  }

  private presentMessage(item: MessageInclude, viewerUserId: string, audit: boolean) {
    const deleted = item.deletedForEveryone && !audit;
    return {
      id: item.id,
      threadId: item.threadId,
      senderUserId: item.senderUserId,
      receiverUserId: item.receiverUserId,
      messageType: deleted ? ChatMessageType.TEXT : item.messageType,
      text: deleted ? null : item.text,
      createdAt: item.createdAt,
      deliveredAt: item.deliveredAt,
      readAt: item.readAt,
      editedAt: deleted ? null : item.editedAt,
      deletedAt: item.deletedAt,
      deletedForEveryone: item.deletedForEveryone,
      clientId: item.clientId,
      albumId: deleted ? null : item.albumId,
      fileName: deleted ? null : item.fileName,
      fileSize: deleted ? null : item.fileSize,
      mimeType: deleted ? null : item.mimeType,
      durationMs: deleted ? null : item.durationMs,
      width: deleted ? null : item.width,
      height: deleted ? null : item.height,
      waveform: deleted ? null : this.parseWaveform(item.waveformJson),
      hasFile: Boolean(!deleted && item.storageKey),
      hasThumbnail: Boolean(!deleted && item.thumbnailKey),
      forwarded: Boolean(item.forwardedFromId),
      replyTo: item.replyTo
        ? {
            id: item.replyTo.id,
            text: item.replyTo.deletedForEveryone ? null : item.replyTo.text,
            messageType: item.replyTo.messageType,
            senderUserId: item.replyTo.senderUserId,
            fileName: item.replyTo.fileName,
            deletedForEveryone: item.replyTo.deletedForEveryone,
          }
        : null,
      reactions: this.groupReactions(item.reactions, viewerUserId),
      mine: item.senderUserId === viewerUserId,
      system: item.senderUserId == null,
    };
  }

  private presentChatUser(user: {
    id: string;
    name: string;
    role?: string;
    lastSeenAt?: Date | null;
    email?: string | null;
    deviceId?: string | null;
    avatarKey?: string | null;
    avatarUpdatedAt?: Date | null;
    phone?: string | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      lastSeenAt: user.lastSeenAt ?? null,
      email: user.email,
      deviceId: user.deviceId,
      phone: user.phone ?? null,
      hasAvatar: Boolean(user.avatarKey),
      avatarUpdatedAt: user.avatarUpdatedAt ?? null,
    };
  }

  private presentThread(
    thread: {
      id: string;
      kind?: ChatThreadKind;
      lastMessageAt: Date | null;
      lastMessagePreview: string | null;
      owner: {
        id: string;
        name: string;
        role?: string;
        lastSeenAt?: Date | null;
        email?: string | null;
        avatarKey?: string | null;
        avatarUpdatedAt?: Date | null;
        phone?: string | null;
      };
      peer: {
        id: string;
        name: string;
        role?: string;
        lastSeenAt?: Date | null;
        email?: string | null;
        deviceId?: string | null;
        avatarKey?: string | null;
        avatarUpdatedAt?: Date | null;
        phone?: string | null;
      };
      device: { id: string; name: string; status: string; lastSeen: Date | null } | null;
    },
    viewerUserId: string,
    unreadCount: number,
    audit: boolean,
  ) {
    let counterpart =
      thread.owner.id === viewerUserId ? thread.peer : thread.owner;
    if (thread.kind === ChatThreadKind.SUPPORT && audit) {
      counterpart = thread.peer;
    }
    const deviceOnline =
      thread.device?.status === 'ONLINE' || thread.device?.status === 'STREAMING';
    const socketOnline = this.chatGateway.isUserOnline(counterpart.id);
    const seenAt = counterpart.lastSeenAt ?? thread.device?.lastSeen ?? null;
    const recentlySeen =
      seenAt != null && Date.now() - new Date(seenAt).getTime() < 2 * 60 * 1000;
    const peerDeviceLive = counterpart.id === thread.peer.id && deviceOnline;
    const online = socketOnline || recentlySeen || peerDeviceLive;
    return {
      id: thread.id,
      kind: thread.kind ?? ChatThreadKind.PEER,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt,
      owner: this.presentChatUser(thread.owner),
      peer: this.presentChatUser(thread.peer),
      device: thread.device,
      viewerUserId,
      unreadCount,
      counterpartName:
        thread.kind === ChatThreadKind.SUPPORT && !audit
          ? CALL_CENTER_NAME
          : counterpart.name,
      counterpartUserId: counterpart.id,
      counterpartPhone: counterpart.phone ?? null,
      counterpartHasAvatar: Boolean(counterpart.avatarKey),
      counterpartAvatarUpdatedAt: counterpart.avatarUpdatedAt ?? null,
      online,
      lastSeenAt: counterpart.lastSeenAt ?? thread.device?.lastSeen ?? null,
      audit,
    };
  }

  private groupReactions(
    reactions: { emoji: string; userId: string }[],
    viewerUserId: string,
  ) {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const reaction of reactions) {
      const current = map.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        mine: false,
      };
      current.count += 1;
      if (reaction.userId === viewerUserId) current.mine = true;
      map.set(reaction.emoji, current);
    }
    return [...map.values()];
  }

  private parseWaveform(raw: string | null) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.slice(0, 64) : null;
    } catch {
      return null;
    }
  }

  private previewFor(type: ChatMessageType, fileName?: string, text?: string) {
    if (text?.trim()) return text.trim().slice(0, 140);
    switch (type) {
      case ChatMessageType.IMAGE:
        return 'Photo';
      case ChatMessageType.VIDEO:
        return 'Video';
      case ChatMessageType.VIDEO_NOTE:
        return 'Video note';
      case ChatMessageType.VOICE:
        return 'Voice message';
      default:
        return fileName || 'File';
    }
  }

  private async mediaCounts(threadId: string, hidden: string[], audit: boolean) {
    const base: Prisma.ChatMessageWhereInput = {
      threadId,
      id: hidden.length ? { notIn: hidden } : undefined,
      deletedForEveryone: audit ? undefined : false,
    };
    const [photos, videos, notes, files, voice, texts] = await Promise.all([
      this.prisma.chatMessage.count({
        where: { ...base, messageType: ChatMessageType.IMAGE },
      }),
      this.prisma.chatMessage.count({
        where: { ...base, messageType: ChatMessageType.VIDEO },
      }),
      this.prisma.chatMessage.count({
        where: { ...base, messageType: ChatMessageType.VIDEO_NOTE },
      }),
      this.prisma.chatMessage.count({
        where: { ...base, messageType: ChatMessageType.FILE },
      }),
      this.prisma.chatMessage.count({
        where: { ...base, messageType: ChatMessageType.VOICE },
      }),
      this.prisma.chatMessage.findMany({
        where: { ...base, messageType: ChatMessageType.TEXT, text: { not: null } },
        select: { text: true },
        take: 400,
      }),
    ]);
    const links = texts.filter((row) => row.text && URL_RE.test(row.text)).length;
    return { photos, videos, notes, files, voice, links };
  }

  private async unreadMap(threadIds: string[], viewerUserId: string) {
    if (!threadIds.length) return new Map<string, number>();
    const grouped = await this.prisma.chatMessage.groupBy({
      by: ['threadId'],
      where: {
        threadId: { in: threadIds },
        readAt: null,
        OR: [
          { senderUserId: null },
          { senderUserId: { not: viewerUserId } },
        ],
        deletedForEveryone: false,
        hiddenFor: { none: { userId: viewerUserId } },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.threadId, row._count._all]));
  }

  private async loadOwnedMessage(
    organizationId: string,
    viewerUserId: string,
    threadId: string,
    messageId: string,
    deviceId?: string,
  ) {
    if (deviceId) {
      await this.assertDeviceThread(organizationId, deviceId, threadId);
    } else {
      await this.assertThread(organizationId, threadId);
    }
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderUserId !== viewerUserId) {
      throw new ForbiddenException('You can only edit your messages');
    }
    return message;
  }

  private async assertUploadSession(
    organizationId: string,
    uploadId: string,
    threadId: string,
    actorUserId: string,
  ) {
    const session = await this.storage.loadSession(uploadId);
    if (
      session.organizationId !== organizationId ||
      session.threadId !== threadId ||
      session.senderUserId !== actorUserId
    ) {
      throw new ForbiddenException('Upload not found');
    }
    return session;
  }

  private async assertReply(threadId: string, replyToId: string) {
    const original = await this.prisma.chatMessage.findFirst({
      where: { id: replyToId, threadId },
    });
    if (!original) throw new NotFoundException('Reply target not found');
  }

  private async deviceUser(organizationId: string, deviceId: string) {
    const peer = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    if (!peer) throw new ForbiddenException('No user account for this device');
    return peer;
  }

  private async assertThread(organizationId: string, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id: threadId }
        : { id: threadId, organizationId },
    });
    if (!thread) throw new NotFoundException('Chat not found');
    return thread;
  }

  private otherUserId(thread: ThreadRow, senderUserId: string) {
    return senderUserId === thread.ownerUserId ? thread.peerUserId : thread.ownerUserId;
  }

  private deviceThreadWhere(
    organizationId: string,
    deviceId: string,
    viewerUserId: string,
    threadId: string,
  ) {
    return {
      id: threadId,
      organizationId,
      OR: [
        { deviceId },
        { ownerUserId: viewerUserId },
        { peerUserId: viewerUserId },
      ],
    };
  }

  private async assertDeviceThread(
    organizationId: string,
    deviceId: string,
    threadId: string,
  ) {
    const viewer = await this.deviceUser(organizationId, deviceId);
    const thread = await this.prisma.chatThread.findFirst({
      where: this.deviceThreadWhere(organizationId, deviceId, viewer.id, threadId),
    });
    if (!thread) throw new ForbiddenException('Chat not found');
    return thread;
  }

  private callCenterEmail(organizationId: string) {
    return `callcenter+${organizationId}@support.internal`;
  }

  private async ensureCallCenterUser(organizationId: string) {
    const email = this.callCenterEmail(organizationId);
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email },
    });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        organizationId,
        email,
        name: CALL_CENTER_NAME,
        role: UserRole.USER,
        passwordHash: await bcrypt.hash(randomUUID(), 10),
      },
    });
  }

  private async ensureSupportThread(
    organizationId: string,
    customerUserId: string,
    deviceId: string,
  ) {
    const callCenter = await this.ensureCallCenterUser(organizationId);
    return this.prisma.chatThread.upsert({
      where: {
        organizationId_ownerUserId_peerUserId: {
          organizationId,
          ownerUserId: callCenter.id,
          peerUserId: customerUserId,
        },
      },
      update: { deviceId, kind: ChatThreadKind.SUPPORT },
      create: {
        organizationId,
        ownerUserId: callCenter.id,
        peerUserId: customerUserId,
        deviceId,
        kind: ChatThreadKind.SUPPORT,
      },
      include: threadInclude,
    });
  }

  private async appendSystemMessage(
    thread: ThreadRow,
    text: string,
    receiverUserId: string,
  ) {
    const message = await this.prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: null,
        receiverUserId,
        messageType: ChatMessageType.TEXT,
        text,
        deliveredAt: new Date(),
      },
      include: { reactions: true, replyTo: true, forwardedFrom: true },
    });
    await this.prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: text.slice(0, 140),
      },
    });
    const presented = this.presentMessage(message, receiverUserId, false);
    this.chatGateway.emitToOrg(thread.organizationId, 'chat.message', {
      threadId: thread.id,
      message: presented,
    });
    return presented;
  }

}
