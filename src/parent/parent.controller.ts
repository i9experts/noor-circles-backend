import {
  Body, Controller, Delete, Get, MessageEvent,
  Param, Patch, Post, Query, Req, Sse,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request }       from 'express';
import { Observable }    from 'rxjs';
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

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getStats() { return this.parentService.getStats(); }

  @Get('page-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getPageData() { return this.parentService.getPageData(); }

  // ── Engagement config ────────────────────────────────────────────────────────

  @Get('engagement')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getEngagement() { return this.parentService.getEngagementConfig(); }

  @Patch('engagement/weekly-card')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleWeeklyCard(@Body('active') active: boolean) {
    return this.parentService.toggleWeeklyCard(active);
  }

  @Patch('engagement/whatsapp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleWhatsapp(@Body('enabled') enabled: boolean) {
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

  /**
   * SSE — NO class-level guard here.
   * Auth via ?token= query param because EventSource cannot set headers.
   */
  @Sse('engagement/whatsapp-stream')
  sendWhatsappStream(
    @Query('message') message: string,
    @Query('token')   token: string,
    @Req() _req: Request,
  ): Observable<MessageEvent> {
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
    return this.parentService.sendWhatsappSse(payload.sub, message);
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
  getAll() { return this.parentService.getAll(); }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getOne(@Param('id') id: string) { return this.parentService.getOne(id); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  register(@Body() dto: RegisterParentDto) { return this.parentService.register(dto); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  update(@Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.parentService.remove(id); }

  @Post(':id/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  addFeedback(@Param('id') id: string, @Body() dto: AddFeedbackDto) {
    return this.parentService.addFeedback(id, dto);
  }
}
