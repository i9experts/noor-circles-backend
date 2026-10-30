import {
  BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, Res,
  UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { CourseService } from './course.service';
import {
  AssignCourseDto, FlipChartViewDto, HeartbeatDto, PracticalDto, ReflectionDto, ReviewReflectionDto, SetQuestionsDto, SubmitAnswersDto,
  UpdateCourseSettingsDto,
} from './course.dto';

const who = (u: UserDocument) => ({ id: u._id.toString(), role: u.role });
const objectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
  return id;
};
const apiBase = (req: Request) => `${req.protocol}://${req.get('host')}/api/v1`;

@Controller('course')
export class CourseController {
  constructor(private readonly service: CourseService) {}

  // ── Murabbi ────────────────────────────────────────────────────────────────

  /** GET /course/my — trainings assigned to me. */
  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  my(@CurrentUser() user: UserDocument) { return this.service.myCourses(user._id.toString()); }

  /** GET /course/badges — certified badges (all murabbis for admins, just mine otherwise). */
  @Get('badges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  badges(@CurrentUser() user: UserDocument) {
    return this.service.badges(user.role === UserRole.ADMIN ? undefined : [user._id]);
  }

  @Get('lessons/:id/play')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  play(@Param('id') id: string, @CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.service.play(objectId(id), who(user), apiBase(req));
  }

  /** POST /course/lessons/:id/heartbeat — what was played since the last report. */
  @Post('lessons/:id/heartbeat')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  heartbeat(@Param('id') id: string, @CurrentUser() user: UserDocument, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat(objectId(id), who(user), dto);
  }

  /**
   * GET /course/lessons/:id/audio?token=… — streams the MP3. An <audio> tag
   * can't send the login header, so access is by the short-lived signed link
   * that /play hands out.
   */
  @Get('lessons/:id/audio')
  @SkipThrottle()
  async audio(@Param('id') id: string, @Query('token') token: string, @Headers('range') range: string | undefined, @Res() res: Response) {
    const a = await this.service.audioFor(id, token, range);
    res.status(a.partial ? 206 : 200);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(a.end - a.start + 1),
      'Cache-Control': 'private, max-age=3600',
      // The portal is on another origin; helmet's default would block playback.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(a.partial && { 'Content-Range': `bytes ${a.start}-${a.end}/${a.size}` }),
    });
    a.stream.on('error', () => res.destroy());
    a.stream.pipe(res);
  }

  @Get(':key/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  myCourse(@Param('key') key: string, @CurrentUser() user: UserDocument) { return this.service.myCourse(key, who(user)); }

  /** POST /course/:key/flip-charts/:chart/view — how long a flip chart was on screen. */
  @Post(':key/flip-charts/:chart/view')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  flipChart(@Param('key') key: string, @Param('chart') chart: string, @CurrentUser() user: UserDocument, @Body() dto: FlipChartViewDto) {
    return this.service.viewFlipChart(key, chart, who(user), dto);
  }

  @Get(':key/assessment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  assessment(@Param('key') key: string, @CurrentUser() user: UserDocument) { return this.service.assessment(key, who(user)); }

  @Post(':key/assessment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI)
  submit(@Param('key') key: string, @CurrentUser() user: UserDocument, @Body() dto: SubmitAnswersDto) {
    return this.service.submitAssessment(key, who(user), dto);
  }

  @Post(':key/reflection')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MURABBI)
  reflect(@Param('key') key: string, @CurrentUser() user: UserDocument, @Body() dto: ReflectionDto) {
    return this.service.submitReflection(key, who(user), dto);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  /** GET /course/:key — sections, lessons, audio status, settings and questions. */
  @Get(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  outline(@Param('key') key: string) { return this.service.outline(key); }

  @Patch(':key/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  settings(@Param('key') key: string, @Body() dto: UpdateCourseSettingsDto) { return this.service.updateSettings(key, dto); }

  @Put(':key/questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  questions(@Param('key') key: string, @Body() dto: SetQuestionsDto) { return this.service.setQuestions(key, dto); }

  /** POST /course/:key/audio — bulk upload; files are matched to lessons by name (m4-01.mp3). */
  @Post(':key/audio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('files', 130, { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(@Param('key') key: string, @UploadedFiles() files: Express.Multer.File[]) { return this.service.uploadAudio(key, files); }

  @Post(':key/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assign(@Param('key') key: string, @CurrentUser() user: UserDocument, @Body() dto: AssignCourseDto) {
    return this.service.assign(key, user._id.toString(), dto);
  }

  @Delete(':key/assign/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  unassign(@Param('key') key: string, @Param('userId') userId: string) { return this.service.unassign(key, objectId(userId)); }

  @Get(':key/progress')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  progress(@Param('key') key: string) { return this.service.progressReport(key); }

  @Get(':key/progress/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  detail(@Param('key') key: string, @Param('userId') userId: string) { return this.service.userDetail(key, objectId(userId)); }

  @Get(':key/reflections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reflections(@Param('key') key: string, @Query('status') status?: string) { return this.service.listReflections(key, status); }

  @Patch('reflections/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  review(@Param('id') id: string, @CurrentUser() user: UserDocument, @Body() dto: ReviewReflectionDto) {
    return this.service.reviewReflection(objectId(id), user._id.toString(), dto);
  }

  @Put(':key/practical/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  practical(@Param('key') key: string, @Param('userId') userId: string, @CurrentUser() user: UserDocument, @Body() dto: PracticalDto) {
    return this.service.setPractical(key, objectId(userId), user._id.toString(), dto);
  }
}
