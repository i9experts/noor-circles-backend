import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { ParentCourseService } from './parent-course.service';
import { AssignParentsDto, ParentAccessDto, QuizAnswersDto, SelfCheckDto, TargetLighterDto, TargetTickDto } from './parent-course.dto';
import { PARENT_QUIZZES, ParentQuizKey } from './parent-course.schema';

const quiz = (k: string) => {
  if (!(PARENT_QUIZZES as readonly string[]).includes(k)) throw new BadRequestException('Unknown knowledge check.');
  return k as ParentQuizKey;
};
const moduleNo = (m: string) => {
  const n = Number(m);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new BadRequestException('Unknown module.');
  return n;
};
const userId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
  return id;
};

/**
 * Asaas for Parents. Parents see only their own course; progress is for
 * admins only (never murabbis). Clips, audio and flip-chart time use the
 * shared /course endpoints.
 */
@Controller('parent-course')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentCourseController {
  constructor(private readonly service: ParentCourseService) {}

  // ── Parent ────────────────────────────────────────────────────────────────

  @Get('me')
  @Roles(UserRole.PARENT)
  me(@CurrentUser() u: UserDocument) { return this.service.me(u._id.toString()); }

  @Get('quiz/:key')
  @Roles(UserRole.PARENT)
  quiz(@CurrentUser() u: UserDocument, @Param('key') key: string) { return this.service.quiz(u._id.toString(), quiz(key)); }

  @Post('quiz/:key')
  @Roles(UserRole.PARENT)
  submit(@CurrentUser() u: UserDocument, @Param('key') key: string, @Body() dto: QuizAnswersDto) {
    return this.service.submitQuiz(u._id.toString(), quiz(key), dto.answers);
  }

  @Post('self-check/:stage')
  @Roles(UserRole.PARENT)
  selfCheck(@CurrentUser() u: UserDocument, @Param('stage') stage: string, @Body() dto: SelfCheckDto) {
    if (stage !== 'start' && stage !== 'end') throw new BadRequestException('Unknown self-check.');
    return this.service.submitSelfCheck(u._id.toString(), stage, dto.answers);
  }

  @Put('targets/:module')
  @SkipThrottle()
  @Roles(UserRole.PARENT)
  tick(@CurrentUser() u: UserDocument, @Param('module') m: string, @Body() dto: TargetTickDto) {
    return this.service.tick(u._id.toString(), moduleNo(m), dto.slot, dto.on);
  }

  @Patch('targets/:module/lighter')
  @Roles(UserRole.PARENT)
  lighter(@CurrentUser() u: UserDocument, @Param('module') m: string, @Body() dto: TargetLighterDto) {
    return this.service.setLighter(u._id.toString(), moduleNo(m), dto.lighter);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/progress')
  @Roles(UserRole.ADMIN)
  progress() { return this.service.progress(); }

  @Get('admin/parents/:id')
  @Roles(UserRole.ADMIN)
  detail(@Param('id') id: string) { return this.service.detail(userId(id)); }

  @Post('admin/assign')
  @Roles(UserRole.ADMIN)
  assign(@CurrentUser() u: UserDocument, @Body() dto: AssignParentsDto) { return this.service.assign(u._id.toString(), dto); }

  @Patch('admin/parents/:id')
  @Roles(UserRole.ADMIN)
  access(@Param('id') id: string, @Body() dto: ParentAccessDto) { return this.service.setAccess(userId(id), dto.allOpen); }

  @Delete('admin/parents/:id')
  @Roles(UserRole.ADMIN)
  unassign(@Param('id') id: string) { return this.service.unassign(userId(id)); }
}
