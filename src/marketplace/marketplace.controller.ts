import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { MarketplaceService } from './marketplace.service';
import { ApproveRequestDto, DeclineRequestDto, TierUpgradeDto, TrainingRequestDto } from './marketplace.dto';

@Controller('trainings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(private readonly market: MarketplaceService) {}

  // ── Admin ──────────────────────────────────────────────────────────────────

  @Get('admin/catalogue')
  @Roles(UserRole.ADMIN)
  catalogue() { return this.market.catalogue(); }

  /** GET /trainings/admin/requests?status=pending|approved|declined|all */
  @Get('admin/requests')
  @Roles(UserRole.ADMIN)
  requests(@Query('status') status?: string) { return this.market.requests(status || 'pending'); }

  @Post('admin/requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() admin: UserDocument, @Body() dto: ApproveRequestDto) {
    return this.market.approve(id, admin._id.toString(), dto);
  }

  @Post('admin/requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  decline(@Param('id') id: string, @CurrentUser() admin: UserDocument, @Body() dto: DeclineRequestDto) {
    return this.market.decline(id, admin._id.toString(), dto.reason);
  }

  @Get('admin/tier-upgrades')
  @Roles(UserRole.ADMIN)
  tierUpgrades() { return this.market.tierUpgrades(); }

  @Post('admin/tier-upgrades/:userId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  approveTier(@Param('userId') userId: string, @Body() dto: TierUpgradeDto, @CurrentUser() admin: UserDocument) {
    return this.market.approveTier(userId, dto.tier, admin._id.toString());
  }

  // ── Murabbis and parents ───────────────────────────────────────────────────

  /** GET /trainings — my trainings and the marketplace. */
  @Get()
  @Roles(UserRole.MURABBI, UserRole.PARENT)
  mine(@CurrentUser() user: UserDocument) { return this.market.forUser(user); }

  @Post(':key/request')
  @Roles(UserRole.MURABBI, UserRole.PARENT)
  request(@Param('key') key: string, @CurrentUser() user: UserDocument, @Body() dto: TrainingRequestDto) {
    return this.market.request(user, key, dto.note);
  }

  @Delete(':key/request')
  @Roles(UserRole.MURABBI, UserRole.PARENT)
  cancel(@Param('key') key: string, @CurrentUser() user: UserDocument) { return this.market.cancel(user, key); }
}
