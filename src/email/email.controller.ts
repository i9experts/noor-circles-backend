import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { EmailService } from './email.service';
import { AudienceDto, CampaignDto, EmailPreviewDto, PreferencesDto, UnsubscribeDto } from './email.dto';

@Controller('email')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  // ── Anyone signed in: their own preferences ──────────────────────────────

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  prefs(@CurrentUser() user: UserDocument) { return this.email.preferences(user.email); }

  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  setPrefs(@CurrentUser() user: UserDocument, @Body() dto: PreferencesDto) { return this.email.setPreferences(user.email, dto.on); }

  /** POST /email/unsubscribe — from the link in an email (no sign-in). */
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  unsubscribe(@Body() dto: UnsubscribeDto) { return this.email.unsubscribe(dto.token, !!dto.subscribe); }

  // ── Admin ────────────────────────────────────────────────────────────────

  @Get('samples')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  samples() { return this.email.samples(); }

  @Post('audience')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  audience(@Body() dto: AudienceDto) { return this.email.audiencePreview(dto); }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  preview(@Body() dto: EmailPreviewDto, @CurrentUser() user: UserDocument) { return this.email.preview(dto, user.fullName); }

  @Post('campaigns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  send(@Body() dto: CampaignDto, @CurrentUser() user: UserDocument) { return this.email.createCampaign(dto, user); }

  @Get('campaigns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  campaigns() { return this.email.campaigns(); }

  @Post('campaigns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) { return this.email.cancelCampaign(id); }

  @Get('logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  logs(@Query('status') status?: string, @Query('kind') kind?: string, @Query('search') search?: string,
    @Query('campaign') campaign?: string, @Query('page') page?: string) {
    return this.email.logs({ status, kind, search, campaign, page: Number(page) || 1 });
  }

  @Get('logs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  log(@Param('id') id: string) { return this.email.logHtml(id); }

  @Post('logs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  retry(@Param('id') id: string) { return this.email.retry(id); }
}
