import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SnapshotsService } from './snapshots.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentUser } from '../auth/decorators';

class CreateSnapshotDto {
  @ApiProperty()
  @IsString()
  imageBase64!: string;
}

@ApiTags('snapshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller()
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @Post('devices/:id/snapshot')
  create(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.snapshotsService.createFromBase64(
      user.organizationId,
      user.userId,
      id,
      dto.imageBase64,
    );
  }

  @Get('snapshots')
  list(
    @CurrentUser() user: { organizationId: string },
    @Query('deviceId') deviceId?: string,
  ) {
    return this.snapshotsService.list(user.organizationId, deviceId);
  }
}
