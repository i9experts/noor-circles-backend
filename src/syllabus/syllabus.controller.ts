import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { SyllabusService } from './syllabus.service';
import { FamilyService } from './family.service';
import {
  CreateEventDto, CreateSessionDto, CreateTrackDto, RecordCoverageDto, StudentNoteDto, UpdateEventDto,
  UpdateSessionDto, UpdateTrackDto,
} from './syllabus.dto';

const who = (u: UserDocument) => ({ id: u._id.toString(), role: u.role });

@Controller('syllabus')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyllabusController {
  constructor(private readonly service: SyllabusService) {}

  // ── Tracks & sessions ──────────────────────────────────────────────────────

  @Get('tracks')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  tracks() { return this.service.listTracks(); }

  @Post('tracks')
  @Roles(UserRole.ADMIN)
  createTrack(@Body() dto: CreateTrackDto) { return this.service.createTrack(dto); }

  /** POST /syllabus/tracks/defaults — create the three age-group tracks with a 40-session outline. */
  @Post('tracks/defaults')
  @Roles(UserRole.ADMIN)
  defaults() { return this.service.setupDefaults(); }

  @Patch('tracks/:id')
  @Roles(UserRole.ADMIN)
  updateTrack(@Param('id') id: string, @Body() dto: UpdateTrackDto) { return this.service.updateTrack(id, dto); }

  @Delete('tracks/:id')
  @Roles(UserRole.ADMIN)
  deleteTrack(@Param('id') id: string) { return this.service.deleteTrack(id); }

  @Get('tracks/:id/sessions')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  sessions(@Param('id') id: string) { return this.service.listSessions(id); }

  @Post('tracks/:id/sessions')
  @Roles(UserRole.ADMIN)
  createSession(@Param('id') id: string, @Body() dto: CreateSessionDto) { return this.service.createSession(id, dto); }

  @Get('sessions/:id')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  session(@Param('id') id: string) { return this.service.getSession(id); }

  @Patch('sessions/:id')
  @Roles(UserRole.ADMIN)
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) { return this.service.updateSession(id, dto); }

  @Delete('sessions/:id')
  @Roles(UserRole.ADMIN)
  deleteSession(@Param('id') id: string) { return this.service.deleteSession(id); }

  // ── Progress ───────────────────────────────────────────────────────────────

  /** GET /syllabus/progress — every circle's covered vs remaining (admin). */
  @Get('progress')
  @Roles(UserRole.ADMIN)
  progress() { return this.service.progressOverview(); }

  /** GET /syllabus/progress/:circleId — session-by-session detail (admin, or the circle's murabbi). */
  @Get('progress/:circleId')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  circleProgress(@CurrentUser() u: UserDocument, @Param('circleId') id: string) {
    return this.service.circleDetail(who(u), id);
  }

  // ── Murabbi weekly agenda ──────────────────────────────────────────────────

  @Get('my-agenda')
  @Roles(UserRole.MURABBI)
  agenda(@CurrentUser() u: UserDocument) { return this.service.myAgenda(u._id.toString()); }

  @Post('coverage')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  cover(@CurrentUser() u: UserDocument, @Body() dto: RecordCoverageDto) { return this.service.recordCoverage(who(u), dto); }

  @Delete('coverage/:id')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  uncover(@CurrentUser() u: UserDocument, @Param('id') id: string) { return this.service.deleteCoverage(who(u), id); }

  // ── Notes to families ──────────────────────────────────────────────────────

  @Post('notes')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  addNote(@CurrentUser() u: UserDocument, @Body() dto: StudentNoteDto) { return this.service.addNote(who(u), dto); }

  @Get('notes/student/:studentId')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  notes(@CurrentUser() u: UserDocument, @Param('studentId') id: string) { return this.service.listNotes(who(u), id); }

  @Delete('notes/:id')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  deleteNote(@CurrentUser() u: UserDocument, @Param('id') id: string) { return this.service.deleteNote(who(u), id); }

  // ── Calendar ───────────────────────────────────────────────────────────────

  /** GET /syllabus/calendar?from&to&circleId — meetings (with their session) and events. */
  @Get('calendar')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  calendar(@CurrentUser() u: UserDocument, @Query('from') from?: string, @Query('to') to?: string, @Query('circleId') circleId?: string) {
    const date = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    return this.service.calendarForRequester(who(u), date(from), date(to), circleId);
  }

  @Get('events')
  @Roles(UserRole.ADMIN)
  events(@Query('from') from?: string, @Query('to') to?: string) { return this.service.listEvents(from, to); }

  @Post('events')
  @Roles(UserRole.ADMIN)
  createEvent(@Body() dto: CreateEventDto) { return this.service.createEvent(dto); }

  @Patch('events/:id')
  @Roles(UserRole.ADMIN)
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) { return this.service.updateEvent(id, dto); }

  @Delete('events/:id')
  @Roles(UserRole.ADMIN)
  deleteEvent(@Param('id') id: string) { return this.service.deleteEvent(id); }
}

@Controller()
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  /** GET /parents/:id/family-link — the family's private page link (admin). */
  @Get('parents/:id/family-link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  link(@Param('id') id: string) { return this.family.getLink(id); }

  /** POST /parents/:id/family-link/rotate — new link; the old one stops working. */
  @Post('parents/:id/family-link/rotate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  rotate(@Param('id') id: string) { return this.family.rotateLink(id); }

  /** GET /family/:token — public, password-free family page data. */
  @Get('family/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  view(@Param('token') token: string) { return this.family.view(token); }
}
