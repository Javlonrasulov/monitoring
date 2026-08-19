import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { platformOrgId } from '../auth/platform-org';

/**
 * Chat realtime lives on /chat so it never shares rooms or events with
 * the existing /realtime device + live-stream gateway.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private readonly socketsByUser = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ??
          undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const adminSecret = this.config.getOrThrow<string>('JWT_SECRET');
      const deviceSecret = this.config.getOrThrow<string>('DEVICE_JWT_SECRET');

      let organizationId: string | undefined;
      let userId: string | undefined;
      let platformAdmin = false;
      try {
        const payload = await this.jwt.verifyAsync<{
          organizationId: string;
          sub: string;
          typ?: string;
        }>(token, { secret: adminSecret });
        organizationId = payload.organizationId;
        userId = payload.sub;
        platformAdmin = organizationId === platformOrgId();
      } catch {
        const payload = await this.jwt.verifyAsync<{
          organizationId: string;
          sub: string;
          typ?: string;
        }>(token, { secret: deviceSecret });
        organizationId = payload.organizationId;
        if (payload.typ === 'device') {
          const user = await this.prisma.user.findFirst({
            where: { deviceId: payload.sub, organizationId },
            select: { id: true },
          });
          userId = user?.id;
        }
      }

      if (!organizationId) {
        client.disconnect(true);
        return;
      }

      await client.join(`org:${organizationId}`);
      if (platformAdmin) {
        await client.join('org:platform');
      }
      client.data.organizationId = organizationId;
      client.data.userId = userId;
      if (userId) {
        const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
        sockets.add(client.id);
        this.socketsByUser.set(userId, sockets);
        await this.prisma.user.updateMany({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        });
        this.server.to(`org:${organizationId}`).emit('chat.presence', {
          userId,
          online: true,
        });
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const organizationId = client.data?.organizationId as string | undefined;
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    const sockets = this.socketsByUser.get(userId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) {
      this.socketsByUser.delete(userId);
      await this.prisma.user.updateMany({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
      if (organizationId) {
        this.server.to(`org:${organizationId}`).emit('chat.presence', {
          userId,
          online: false,
          lastSeenAt: new Date().toISOString(),
        });
      }
    }
  }

  @SubscribeMessage('chat.typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { threadId?: string; typing?: boolean },
  ) {
    const organizationId = client.data?.organizationId as string | undefined;
    const userId = client.data?.userId as string | undefined;
    if (!organizationId || !payload?.threadId) return { ok: false };
    this.server.to(`org:${organizationId}`).emit('chat.typing', {
      threadId: payload.threadId,
      userId,
      typing: payload.typing === true,
    });
    this.server.to('org:platform').emit('chat.typing', {
      threadId: payload.threadId,
      userId,
      typing: payload.typing === true,
    });
    return { ok: true };
  }

  isUserOnline(userId: string) {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
    this.server.to('org:platform').emit(event, payload);
  }
}
