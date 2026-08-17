import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentUser } from '../auth/decorators';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  me(@CurrentUser() user: { organizationId: string }) {
    return this.organizationsService.getOrganization(user.organizationId);
  }

  @Get('me/branches')
  branches(@CurrentUser() user: { organizationId: string }) {
    return this.organizationsService.listBranches(user.organizationId);
  }
}
