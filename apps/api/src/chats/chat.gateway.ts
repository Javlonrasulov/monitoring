import {
  ConnectedSocket,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

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
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
      try {
        const payload = await this.jwt.verifyAsync<{
          organizationId: string;
          typ?: string;
        }>(token, { secret: adminSecret });
        organizationId = payload.organizationId;
      } catch {
        const payload = await this.jwt.verifyAsync<{
          organizationId: string;
          typ?: string;
        }>(token, { secret: deviceSecret });
        organizationId = payload.organizationId;
      }

      if (!organizationId) {
        client.disconnect(true);
        return;
      }

      await client.join(`org:${organizationId}`);
      (client.data as { organizationId?: string }).organizationId =
        organizationId;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('chat.typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    payload: { threadId?: string },
  ) {
    const organizationId = (client.data as { organizationId?: string })
      .organizationId;
    if (!organizationId || !payload?.threadId) return { ok: false };
    this.server.to(`org:${organizationId}`).emit('chat.typing', {
      threadId: payload.threadId,
    });
    return { ok: true };
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }
}
