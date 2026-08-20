import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PushPlatform } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private ready = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    try {
      if (admin.apps.length > 0) {
        this.ready = true;
        return;
      }
      const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (raw?.trim()) {
        const json = raw.trim().startsWith('{')
          ? raw
          : Buffer.from(raw, 'base64').toString('utf8');
        const cred = JSON.parse(json) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(cred) });
        this.ready = true;
        this.logger.log('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
        return;
      }
      if (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')) {
        admin.initializeApp();
        this.ready = true;
        this.logger.log('Firebase Admin initialized from GOOGLE_APPLICATION_CREDENTIALS');
        return;
      }
      this.logger.warn('Firebase not configured; chat push notifications disabled');
    } catch (err) {
      this.logger.warn(
        `Firebase Admin init failed; chat push disabled: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.ready = false;
    }
  }

  async registerToken(userId: string, token: string, platform: PushPlatform) {
    const trimmed = token.trim();
    return this.prisma.pushToken.upsert({
      where: { token: trimmed },
      create: { userId, token: trimmed, platform },
      update: { userId, platform, updatedAt: new Date() },
      select: { id: true, platform: true, updatedAt: true },
    });
  }

  async unregisterToken(token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token: token.trim() } });
    return { ok: true };
  }

  async notifyChatMessage(params: {
    receiverUserId: string | null | undefined;
    threadId: string;
    messageId: string;
    title: string;
    body: string;
  }) {
    if (!params.receiverUserId) return;
    if (!this.ready) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: params.receiverUserId },
      select: { id: true, token: true },
    });
    if (!tokens.length) return;

    const title = (params.title || 'Chat').slice(0, 80);
    const body = (params.body || 'New message').slice(0, 180);
    const data = {
      type: 'chat.message',
      threadId: params.threadId,
      messageId: params.messageId,
    };

    await Promise.all(
      tokens.map(async (row) => {
        try {
          await admin.messaging().send({
            token: row.token,
            notification: { title, body },
            data,
            android: {
              priority: 'high',
              notification: {
                channelId: 'chat_messages',
                tag: params.threadId,
              },
            },
            webpush: {
              fcmOptions: {
                link: `/chats/${params.threadId}`,
              },
              notification: {
                title,
                body,
                tag: params.threadId,
              },
            },
          });
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code: unknown }).code)
              : '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            await this.prisma.pushToken.deleteMany({ where: { id: row.id } });
            this.logger.log(`Removed invalid push token ${row.id}`);
            return;
          }
          this.logger.warn(
            `FCM send failed for token ${row.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }),
    );
  }
}
