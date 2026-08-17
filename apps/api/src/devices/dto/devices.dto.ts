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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePairingCodeDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceNameHint?: string;
}

export class PairDeviceDto {
  @ApiProperty({ example: 'AB12CD' })
  @IsString()
  code!: string;

  @ApiProperty({ example: '1-qavat kirish' })
  @IsString()
  name!: string;

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
