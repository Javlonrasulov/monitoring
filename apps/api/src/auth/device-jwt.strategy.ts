import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('DEVICE_JWT_SECRET'),
    });
  }

  validate(payload: DeviceJwtPayload) {
    if (payload.typ !== 'device') {
      return null;
    }
    return {
      deviceId: payload.sub,
      organizationId: payload.organizationId,
      branchId: payload.branchId,
    };
  }
}
