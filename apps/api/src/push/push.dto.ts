import { IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '../generated/prisma';

export class RegisterPushTokenDto {
  @ApiProperty({ example: 'fcm-registration-token' })
  @IsString()
  @MinLength(10)
  token!: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform)
  platform!: PushPlatform;
}

export class UnregisterPushTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  token!: string;
}
