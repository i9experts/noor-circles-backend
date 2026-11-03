import {
  Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { HostService } from './host.service';
import { AdminSpaceDto, CreateSpaceDto, HostCheckDto, HostSpaceDto, UnavailableDto, VenueDto, VisitDto } from './host.dto';

@Controller('host')
export class HostController {
  constructor(private readonly hosts: HostService) {}

  /** GET /host/training/audio/:id?token=… — streams a module's MP3 (signed link, no login header). */
  @Get('training/audio/:id')
  @SkipThrottle()
  async audio(@Param('id') id: string, @Query('token') token: string, @Headers('range') range: string | undefined, @Res() res: Response) {
    const a = await this.hosts.audioFor(id, token, range);
    res.status(a.partial ? 206 : 200);
    res.set({
      'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': String(a.end - a.start + 1),
      'Cache-Control': 'private, max-age=3600', 'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(a.partial && { 'Content-Range': `bytes ${a.start}-${a.end}/${a.size}` }),
    });
    a.stream.on('error', () => res.destroy());
    a.stream.pipe(res);
  }

  @Get('options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST, UserRole.ADMIN, UserRole.SUPERVISOR)
  options() { return this.hosts.options(); }

  // ── The host ───────────────────────────────────────────────────────────────

  /** GET /host/me — my spaces, the circles meeting there, unavailable dates, training progress. */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  me(@CurrentUser() user: UserDocument) { return this.hosts.me(user._id.toString()); }

  @Put('spaces/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  updateMine(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: HostSpaceDto) {
    return this.hosts.updateMySpace(user._id.toString(), id, dto);
  }

  @Post('spaces/:id/unavailable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  unavailable(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UnavailableDto) {
    return this.hosts.addUnavailable(user._id.toString(), id, dto);
  }

  @Delete('unavailable/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  removeUnavailable(@CurrentUser() user: UserDocument, @Param('id') id: string) { return this.hosts.removeUnavailable(user._id.toString(), id); }

  @Get('training')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  training(@CurrentUser() user: UserDocument) { return this.hosts.training(user._id.toString()); }

  @Post('training/:key/check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  check(@CurrentUser() user: UserDocument, @Param('key') key: string, @Body() dto: HostCheckDto) {
    return this.hosts.check(user._id.toString(), key, dto.answers);
  }

  // ── Admins and supervisors ─────────────────────────────────────────────────

  /** GET /host/admin/spaces?status= — spaces in my scope (supervisors: their clusters). */
  @Get('admin/spaces')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  spaces(@CurrentUser() user: UserDocument, @Query('status') status?: string) { return this.hosts.listSpaces(user, status); }

  @Get('admin/spaces/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  space(@CurrentUser() user: UserDocument, @Param('id') id: string) { return this.hosts.getSpace(user, id); }

  /** POST /host/admin/spaces/:id/visits — the visit checklist (admins and the cluster's supervisors). */
  @Post('admin/spaces/:id/visits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  visit(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: VisitDto) { return this.hosts.addVisit(user, id, dto); }

  @Post('admin/spaces')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSpaceDto) { return this.hosts.createSpace(dto); }

  /** PATCH /host/admin/spaces/:id — details, neighbourhood, status (approve), admin notes. */
  @Patch('admin/spaces/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: AdminSpaceDto) { return this.hosts.updateSpace(id, dto); }

  @Get('admin/circles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  circles() { return this.hosts.circlesForVenue(); }

  /** PUT /host/admin/circles/:id/venue — place a circle in an approved space (or clear it). */
  @Put('admin/circles/:id/venue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  venue(@Param('id') id: string, @Body() dto: VenueDto) { return this.hosts.setVenue(id, dto.spaceId ?? null); }

  @Get('admin/training')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  trainingOverview() { return this.hosts.trainingOverview(); }

  @Post('admin/training/:key/audio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(@Param('key') key: string, @UploadedFile() file: Express.Multer.File) { return this.hosts.uploadAudio(key, file); }

  @Delete('admin/training/:key/audio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeAudio(@Param('key') key: string) { return this.hosts.removeAudio(key); }
}
