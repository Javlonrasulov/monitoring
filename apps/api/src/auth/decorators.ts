import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export type CurrentAdminUser = {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
};

export type CurrentDeviceUser = {
  deviceId: string;
  organizationId: string;
  branchId: string;
};

type AuthenticatedRequest<T> = Request & { user: T };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<AuthenticatedRequest<CurrentAdminUser>>();
    return req.user;
  },
);

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<AuthenticatedRequest<CurrentDeviceUser>>();
    return req.user;
  },
);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
