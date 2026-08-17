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

type AuthenticatedSocketData = {
  organizationId?: string;
  userId?: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
  namespace: '/realtime',
})
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

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

      const payload = await this.jwt.verifyAsync<{
        sub: string;
        organizationId: string;
        role?: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      const room = `org:${payload.organizationId}`;
      await client.join(room);
      const data = client.data as AuthenticatedSocketData;
      data.organizationId = payload.organizationId;
      data.userId = payload.sub;
      this.logger.debug(`Client joined ${room}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe.org')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    const data = client.data as AuthenticatedSocketData;
    const orgId = data.organizationId;
    if (!orgId) {
      return { ok: false };
    }
    return { ok: true, room: `org:${orgId}` };
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }
}
