import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsObject,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePairingCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value == null || value === '' ? undefined : value))
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value == null || value === '' ? undefined : value))
  deviceNameHint?: string;
}

export class LinkDeviceDto {
  @ApiProperty({ example: 'A1B2C3' })
  @IsString()
  code!: string;
}

export class PairDeviceDto {
  @ApiPropertyOptional({ example: 'AB12CD' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: '1-qavat kirish' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  androidVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceModel?: string;
}

export class DeviceStatusDto {
  @ApiPropertyOptional({
    enum: ['ONLINE', 'OFFLINE', 'CONNECTING', 'STREAMING', 'ERROR'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  charging?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  batterySaver?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thermalState?: string;

  @ApiPropertyOptional({ enum: ['WIFI', 'MOBILE', 'UNKNOWN'] })
  @IsOptional()
  @IsString()
  networkType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  networkQuality?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  androidVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;
}

export class SetCameraFacingDto {
  @ApiProperty({ enum: ['FRONT', 'BACK'] })
  @IsIn(['FRONT', 'BACK'])
  facing!: 'FRONT' | 'BACK';
}
