import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  AssignCircleDto,
  CreateCircleDto,
  CreateMurabbiDto,
  CreateNeighbourhoodDto,
  EnrollStudentDto,
  UpdateCircleDto,
  UpdateMurabbiDto,
  UpdateNeighbourhoodDto,
  UpdateStudentDto,
} from './admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  /** GET /admin/stats */
  @Get('stats')
  getStats() {
    return this.adminService.getDashboardStats();
  }

  /** GET /admin/dashboard/extended */
  @Get('dashboard/extended')
  getDashboardExtended() {
    return this.adminService.getDashboardExtended();
  }

  // ── Users / Murabbis ──────────────────────────────────────────────────────────

  /** GET /admin/users */
  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  /** GET /admin/murabbis */
  @Get('murabbis')
  getAllMurabbis() {
    return this.adminService.getAllMurabbis();
  }

  /** POST /admin/murabbis */
  @Post('murabbis')
  @HttpCode(HttpStatus.CREATED)
  createMurabbi(@Body() dto: CreateMurabbiDto) {
    return this.adminService.createMurabbi(dto);
  }

  /** PATCH /admin/murabbis/:id/deactivate */
  @Patch('murabbis/:id/deactivate')
  deactivateMurabbi(@Param('id') id: string) {
    return this.adminService.deactivateMurabbi(id);
  }

  /** PATCH /admin/murabbis/:id/activate */
  @Patch('murabbis/:id/activate')
  activateMurabbi(@Param('id') id: string) {
    return this.adminService.activateMurabbi(id);
  }

  /** PATCH /admin/murabbis/:id */
  @Patch('murabbis/:id')
  updateMurabbi(@Param('id') id: string, @Body() dto: UpdateMurabbiDto) {
    return this.adminService.updateMurabbi(id, dto);
  }

  /** DELETE /admin/murabbis/:id */
  @Delete('murabbis/:id')
  deleteMurabbi(@Param('id') id: string) {
    return this.adminService.deleteMurabbi(id);
  }

  // ── Neighbourhoods ────────────────────────────────────────────────────────────

  /** GET /admin/neighbourhoods */
  @Get('neighbourhoods')
  getAllNeighbourhoods() {
    return this.adminService.getAllNeighbourhoods();
  }

  /** GET /admin/neighbourhoods/:id */
  @Get('neighbourhoods/:id')
  getOneNeighbourhood(@Param('id') id: string) {
    return this.adminService.getOneNeighbourhood(id);
  }

  /** POST /admin/neighbourhoods */
  @Post('neighbourhoods')
  @HttpCode(HttpStatus.CREATED)
  createNeighbourhood(@Body() dto: CreateNeighbourhoodDto) {
    return this.adminService.createNeighbourhood(dto);
  }

  /** PATCH /admin/neighbourhoods/:id */
  @Patch('neighbourhoods/:id')
  updateNeighbourhood(@Param('id') id: string, @Body() dto: UpdateNeighbourhoodDto) {
    return this.adminService.updateNeighbourhood(id, dto);
  }

  /** DELETE /admin/neighbourhoods/:id */
  @Delete('neighbourhoods/:id')
  deleteNeighbourhood(@Param('id') id: string) {
    return this.adminService.deleteNeighbourhood(id);
  }

  // ── Circles ───────────────────────────────────────────────────────────────────

  /** GET /admin/circles */
  @Get('circles')
  getAllCircles() {
    return this.adminService.getAllCircles();
  }

  /** GET /admin/circles/:id */
  @Get('circles/:id')
  getCircleById(@Param('id') id: string) {
    return this.adminService.getCircleById(id);
  }

  /** POST /admin/circles */
  @Post('circles')
  @HttpCode(HttpStatus.CREATED)
  createCircle(@CurrentUser() user: UserDocument, @Body() dto: CreateCircleDto) {
    return this.adminService.createCircle(dto, user._id.toString());
  }

  /** PATCH /admin/circles/:id */
  @Patch('circles/:id')
  updateCircle(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: UpdateCircleDto) {
    return this.adminService.updateCircle(id, dto, user._id.toString());
  }

  /** DELETE /admin/circles/:id */
  @Delete('circles/:id')
  deleteCircle(@Param('id') id: string) {
    return this.adminService.deleteCircle(id);
  }

  // ── Students ──────────────────────────────────────────────────────────────────

  /** GET /admin/students?murabbiId=... */
  @Get('students')
  getAllStudents(@Query('murabbiId') murabbiId?: string) {
    return this.adminService.getAllStudents(murabbiId);
  }

  /** GET /admin/students/:id */
  @Get('students/:id')
  getStudentById(@Param('id') id: string) {
    return this.adminService.getStudentById(id);
  }

  /** POST /admin/students/enroll */
  @Post('students/enroll')
  @HttpCode(HttpStatus.CREATED)
  enrollStudent(@CurrentUser() user: UserDocument, @Body() dto: EnrollStudentDto) {
    return this.adminService.enrollStudent(dto, user._id.toString());
  }

  /** PATCH /admin/students/:id */
  @Patch('students/:id')
  updateStudent(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.adminService.updateStudent(id, dto);
  }

  /** PATCH /admin/students/:id/circle */
  @Patch('students/:id/circle')
  assignStudentCircle(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: AssignCircleDto) {
    return this.adminService.assignStudentCircle(id, dto, user._id.toString());
  }

  /** PATCH /admin/students/:id/deactivate */
  @Patch('students/:id/deactivate')
  deactivateStudent(@Param('id') id: string) {
    return this.adminService.deactivateStudent(id);
  }

  /** PATCH /admin/students/:id/activate */
  @Patch('students/:id/activate')
  activateStudent(@Param('id') id: string) {
    return this.adminService.activateStudent(id);
  }

  /** DELETE /admin/students/:id */
  @Delete('students/:id')
  deleteStudent(@Param('id') id: string) {
    return this.adminService.deleteStudent(id);
  }
}
