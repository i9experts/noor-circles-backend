import {
  Body, Controller, Delete, Get, MessageEvent,
  Param, Patch, Post, Query, Req, Sse,
  BadRequestException, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request }       from 'express';
import { Observable, defer, mergeMap } from 'rxjs';
import { JwtAuthGuard }  from '../auth/guards/jwt-auth.guard';
import { RolesGuard }    from '../auth/guards/roles.guard';
import { Roles }         from '../auth/decorators/roles.decorator';
import { CurrentUser }   from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import {
  ParentService,
  RegisterParentDto,
  UpdateParentDto,
  AddFeedbackDto,
  SendWhatsappDto,
  ScheduleEveningDto,
} from './parent.service';

@Controller('parents')
export class ParentController {
  constructor(
    private readonly parentService: ParentService,
    private readonly jwtService:    JwtService,
    private readonly config:        ConfigService,
  ) {}

  // ── Stats & page data ────────────────────────────────────────────────────────

  // Admin-only: both return system-wide data (page-data includes every
  // parent's name, phone/WhatsApp number, email and children). They were open
  // to murabbis, bypassing the per-murabbi scoping on GET /parents.
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats() { return this.parentService.getStats(); }

  @Get('page-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getPageData() { return this.parentService.getPageData(); }

  // ── Engagement config ────────────────────────────────────────────────────────

  @Get('engagement')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getEngagement() { return this.parentService.getEngagementConfig(); }

  @Patch('engagement/weekly-card')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleWeeklyCard(@Body('active') active: unknown) {
    if (typeof active !== 'boolean') throw new BadRequestException('"active" must be true or false.'); // BUG-33
    return this.parentService.toggleWeeklyCard(active);
  }

  @Patch('engagement/whatsapp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleWhatsapp(@Body('enabled') enabled: unknown) {
    if (typeof enabled !== 'boolean') throw new BadRequestException('"enabled" must be true or false.'); // BUG-33
    return this.parentService.toggleWhatsapp(enabled);
  }

  @Post('engagement/schedule-evening')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  scheduleEvening(@Body() dto: ScheduleEveningDto) {
    return this.parentService.scheduleEvening(dto);
  }

  @Post('engagement/record-evening')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  recordEveningHeld(@CurrentUser() user: UserDocument) {
    return this.parentService.recordEveningHeld(user._id.toString());
  }

  @Post('engagement/send-whatsapp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  sendWhatsapp(@CurrentUser() user: UserDocument, @Body() dto: SendWhatsappDto) {
    return this.parentService.sendWhatsapp(user._id.toString(), dto);
  }

  /** POST /parents/engagement/whatsapp-ticket — one-time, 60-second ticket for the SSE stream. */
  @Post('engagement/whatsapp-ticket')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  whatsappTicket(@CurrentUser() user: UserDocument, @Body() dto: SendWhatsappDto) {
    return this.parentService.createStreamTicket(user._id.toString(), dto.message);
  }

  /**
   * SSE — NO class-level guard here, because EventSource cannot set headers.
   * Auth via ?ticket= (from whatsapp-ticket). ?token= is still accepted for
   * older portal builds; either way the admin is re-checked in the database.
   */
  @Sse('engagement/whatsapp-stream')
  sendWhatsappStream(
    @Query('message') message: string,
    @Query('token')   token: string,
    @Query('ticket')  ticket: string,
    @Req() _req: Request,
  ): Observable<MessageEvent> {
    return defer(async () => {
      let adminId: string;
      let body = message;
      if (ticket) {
        const t = this.parentService.redeemStreamTicket(ticket);
        adminId = t.adminId;
        body = t.message;
      } else {
        if (!token) throw new UnauthorizedException('Token required.');
        let payload: { sub: string; role: string };
        try {
          payload = this.jwtService.verify(token, {
            secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          });
        } catch {
          throw new UnauthorizedException('Invalid or expired token.');
        }
        if (payload.role !== 'admin') throw new UnauthorizedException('Admin only.');
        adminId = payload.sub;
      }
      await this.parentService.assertActiveAdmin(adminId);
      return { adminId, body };
    }).pipe(mergeMap(({ adminId, body }) => this.parentService.sendWhatsappSse(adminId, body)));
  }

  @Get('engagement/test-whatsapp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  testWhatsapp(@Query('number') number?: string) {
    return this.parentService.testWhatsapp(number);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getAll(@CurrentUser() user: UserDocument) {
    return this.parentService.getAll(user._id.toString(), user.role);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.parentService.getOne(id, user._id.toString(), user.role);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  register(@CurrentUser() user: UserDocument, @Body() dto: RegisterParentDto) {
    return this.parentService.register(dto, user._id.toString(), user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  update(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentService.update(id, dto, user._id.toString(), user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.parentService.remove(id); }

  @Post(':id/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  addFeedback(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: AddFeedbackDto) {
    return this.parentService.addFeedback(id, dto, user._id.toString(), user.role);
  }
}
