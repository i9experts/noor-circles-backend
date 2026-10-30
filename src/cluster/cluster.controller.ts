import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { AssignCircleDto, CreateCircleDto, EnrollStudentDto, UpdateCircleDto, UpdateStudentDto } from '../admin/admin.dto';
import { ConvertInterestDto } from '../account/account.dto';
import { UpdateInterestDto } from '../interest/interest.dto';
import { CreateEventDto, UpdateEventDto } from '../syllabus/syllabus.dto';
import { ClusterService } from './cluster.service';
import {
  ClusterAudienceDto, ClusterMessageDto, CreateClusterDto, CreateSupervisorDto, CreateVisitDto, FollowUpDto, StudentActiveDto, UpdateClusterDto,
} from './cluster.dto';
import { VISIT_CHECKLIST } from './visit-checklist';

/** Admin: clusters, supervisor accounts and every cluster's dashboard and visits. */
@Controller('clusters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ClusterAdminController {
  constructor(private readonly clusters: ClusterService) {}

  /** GET /clusters — clusters with numbers, unassigned neighbourhoods and supervisors. */
  @Get()
  list() {
    return this.clusters.listClusters();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateClusterDto, @CurrentUser() admin: UserDocument) {
    return this.clusters.createCluster(dto, admin._id.toString());
  }

  /** POST /clusters/supervisors — a supervisor account (password shown once). */
  @Post('supervisors')
  @HttpCode(HttpStatus.CREATED)
  createSupervisor(@Body() dto: CreateSupervisorDto, @CurrentUser() admin: UserDocument) {
    return this.clusters.createSupervisor(dto, admin._id.toString());
  }

  /** GET /clusters/visits?clusterId=&circleId= — visit reports across clusters. */
  @Get('visits')
  async visits(@CurrentUser() admin: UserDocument, @Query('clusterId') clusterId?: string, @Query('circleId') circleId?: string) {
    return this.clusters.listVisits(await this.clusters.scopeFor(admin, clusterId), { circleId });
  }

  @Patch('visits/:id/follow-ups/:fid')
  async followUp(@CurrentUser() admin: UserDocument, @Param('id') id: string, @Param('fid') fid: string, @Body() dto: FollowUpDto) {
    return this.clusters.setFollowUp(await this.clusters.scopeFor(admin), id, fid, dto.done);
  }

  @Delete('visits/:id')
  async deleteVisit(@CurrentUser() admin: UserDocument, @Param('id') id: string) {
    return this.clusters.deleteVisit(admin, await this.clusters.scopeFor(admin), id);
  }

  /** GET /clusters/:id/dashboard */
  @Get(':id/dashboard')
  async dashboard(@CurrentUser() admin: UserDocument, @Param('id') id: string) {
    return this.clusters.dashboard(await this.clusters.scopeFor(admin, id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClusterDto, @CurrentUser() admin: UserDocument) {
    return this.clusters.updateCluster(id, dto, admin._id.toString());
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clusters.deleteCluster(id);
  }
}

/** Cluster supervisors: everything is limited to their own clusters. */
@Controller('supervisor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR)
export class SupervisorController {
  constructor(private readonly clusters: ClusterService) {}

  private scope(user: UserDocument, clusterId?: string) {
    return this.clusters.scopeFor(user, clusterId);
  }

  @Get('clusters')
  myClusters(@CurrentUser() user: UserDocument) {
    return this.clusters.myClusters(user);
  }

  /** GET /supervisor/dashboard?clusterId= — all my clusters, or one. */
  @Get('dashboard')
  async dashboard(@CurrentUser() user: UserDocument, @Query('clusterId') clusterId?: string) {
    return this.clusters.dashboard(await this.scope(user, clusterId));
  }

  @Get('checklist')
  checklist() {
    return { checklist: VISIT_CHECKLIST };
  }

  // ── Visits ──────────────────────────────────────────────────────────────────

  @Get('visits')
  async visits(@CurrentUser() user: UserDocument, @Query('clusterId') clusterId?: string, @Query('circleId') circleId?: string) {
    return this.clusters.listVisits(await this.scope(user, clusterId), { circleId });
  }

  @Post('visits')
  @HttpCode(HttpStatus.CREATED)
  async createVisit(@CurrentUser() user: UserDocument, @Body() dto: CreateVisitDto) {
    return this.clusters.createVisit(user, await this.scope(user), dto);
  }

  @Patch('visits/:id/follow-ups/:fid')
  async followUp(@CurrentUser() user: UserDocument, @Param('id') id: string, @Param('fid') fid: string, @Body() dto: FollowUpDto) {
    return this.clusters.setFollowUp(await this.scope(user), id, fid, dto.done);
  }

  @Delete('visits/:id')
  async deleteVisit(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.clusters.deleteVisit(user, await this.scope(user), id);
  }

  // ── Circles ─────────────────────────────────────────────────────────────────

  @Get('circle-options')
  async circleOptions(@CurrentUser() user: UserDocument) {
    return this.clusters.circleOptions(await this.scope(user));
  }

  @Post('circles')
  @HttpCode(HttpStatus.CREATED)
  async createCircle(@CurrentUser() user: UserDocument, @Body() dto: CreateCircleDto) {
    return this.clusters.createCircle(user, await this.scope(user), dto);
  }

  @Patch('circles/:id')
  async updateCircle(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateCircleDto) {
    return this.clusters.updateCircle(user, await this.scope(user), id, dto);
  }

  // ── Murabbis and children ───────────────────────────────────────────────────

  @Get('murabbis')
  async murabbis(@CurrentUser() user: UserDocument) {
    return this.clusters.murabbis(await this.scope(user));
  }

  @Get('students')
  async students(@CurrentUser() user: UserDocument, @Query('circleId') circleId?: string) {
    return this.clusters.students(await this.scope(user), circleId);
  }

  @Post('students')
  @HttpCode(HttpStatus.CREATED)
  async enrol(@CurrentUser() user: UserDocument, @Body() dto: EnrollStudentDto) {
    return this.clusters.enrolStudent(user, await this.scope(user), dto);
  }

  @Patch('students/:id')
  async updateStudent(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.clusters.updateStudent(await this.scope(user), id, dto);
  }

  @Patch('students/:id/circle')
  async moveStudent(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: AssignCircleDto) {
    return this.clusters.moveStudent(user, await this.scope(user), id, dto);
  }

  @Patch('students/:id/active')
  async studentActive(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: StudentActiveDto) {
    return this.clusters.setStudentActive(await this.scope(user), id, dto.active);
  }

  // ── Interest from the website ───────────────────────────────────────────────

  @Get('interest')
  async interest(@CurrentUser() user: UserDocument) {
    return this.clusters.interest(await this.scope(user));
  }

  @Patch('interest/:id')
  async updateInterest(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateInterestDto) {
    return this.clusters.updateInterest(await this.scope(user), id, dto);
  }

  @Post('interest/:id/account')
  async convert(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: ConvertInterestDto) {
    return this.clusters.convertInterest(user, await this.scope(user), id, dto);
  }

  // ── Calendar ────────────────────────────────────────────────────────────────

  @Get('calendar')
  async calendar(@CurrentUser() user: UserDocument, @Query('from') from?: string, @Query('to') to?: string) {
    return this.clusters.calendar(await this.scope(user), from, to);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@CurrentUser() user: UserDocument, @Body() dto: CreateEventDto) {
    return this.clusters.createEvent(await this.scope(user), dto);
  }

  @Patch('events/:id')
  async updateEvent(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.clusters.updateEvent(await this.scope(user), id, dto);
  }

  @Delete('events/:id')
  async deleteEvent(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.clusters.deleteEvent(await this.scope(user), id);
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  @Post('messages/audience')
  @HttpCode(HttpStatus.OK)
  async audience(@CurrentUser() user: UserDocument, @Body() dto: ClusterAudienceDto) {
    return this.clusters.messageAudience(await this.scope(user), dto);
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async send(@CurrentUser() user: UserDocument, @Body() dto: ClusterMessageDto) {
    return this.clusters.sendMessage(user, await this.scope(user), dto);
  }

  @Get('messages')
  sent(@CurrentUser() user: UserDocument) {
    return this.clusters.sentMessages(user);
  }
}
