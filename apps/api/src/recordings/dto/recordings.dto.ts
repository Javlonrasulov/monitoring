import {
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StartRecordingDto {
  @ApiProperty()
  @IsString()
  deviceId!: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  quality?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class StopRecordingDto {
  @ApiProperty()
  @IsString()
  deviceId!: string;
}

export class DeleteRecordingsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class RangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ enum: ['FRONT', 'BACK'] })
  @IsOptional()
  @IsIn(['FRONT', 'BACK'])
  camera?: 'FRONT' | 'BACK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}

export class DeleteRangeDto extends RangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  all?: boolean;
}

export class ExportRecordingsDto extends RangeQueryDto {}

export class UpdateRecordingSettingsDto {
  @ApiPropertyOptional({ enum: [3, 7, 14, 30, 60] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoCleanup?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  segmentSeconds?: number;
}

export class ListRecordingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ enum: ['FRONT', 'BACK'] })
  @IsOptional()
  @IsIn(['FRONT', 'BACK'])
  camera?: 'FRONT' | 'BACK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
