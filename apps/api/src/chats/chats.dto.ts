import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ChatMessageType } from '../generated/prisma';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  forwardedFromId?: string;
}

export class EditMessageDto {
  @IsString()
  @MaxLength(8000)
  text!: string;
}

export class DeleteMessageDto {
  @IsOptional()
  @IsBoolean()
  forEveryone?: boolean;
}

export class ReactMessageDto {
  @IsString()
  @MaxLength(16)
  emoji!: string;
}

export class InitUploadDto {
  @IsString()
  @MaxLength(240)
  fileName!: string;

  @IsString()
  @MaxLength(180)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  fileSize!: number;

  @IsEnum(ChatMessageType)
  messageType!: ChatMessageType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  albumId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  waveformJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string;
}

export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🤝', '😢', '🎉'];

export class OpenSupportDto {
  @ApiProperty()
  @IsString()
  peerUserId!: string;
}
