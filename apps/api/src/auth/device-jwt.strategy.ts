import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type DeviceJwtPayload = {
  sub: string;
  organizationId: string;
  branchId: string;
  typ: 'device';
};

@Injectable()
export class DeviceJwtStrategy extends PassportStrategy(
  Strategy,
  'device-jwt',
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('DEVICE_JWT_SECRET'),
    });
  }

  async validate(payload: DeviceJwtPayload) {
    if (payload.typ !== 'device' || !payload.sub) {
      return null;
    }
    const device = await this.prisma.device.findFirst({
      where: { id: payload.sub, disabled: false },
      select: { id: true, organizationId: true, branchId: true },
    });
    if (!device) {
      return null;
    }
    return {
      deviceId: device.id,
      organizationId: device.organizationId,
      branchId: device.branchId,
    };
  }
}
