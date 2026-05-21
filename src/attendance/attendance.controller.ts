import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { RolesGuard }     from '../auth/guards/roles.guard';
import { Roles }          from '../auth/decorators/roles.decorator';
import { CurrentUser }    from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { AttendanceService } from './attendance.service';
import {
  IsArray, IsDateString, IsIn, IsMongoId, IsNumber,
  IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class AttendanceRecordDto {
  @IsMongoId()
  student: string;

  @IsIn(['present', 'absent', 'excused'])
  status: string;

  @IsOptional() @IsString()
  note?: string;
}

class SubmitAttendanceDto {
  @IsMongoId()
  circle: string;

  @IsNumber() @Min(1)
  sessionNumber: number;

  @IsDateString()
  sessionDate: string;

  @IsOptional() @IsString()
  @Transform(({ value }) => value?.trim())
  topic?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

class UpdateRecordDto {
  @IsMongoId()
  student: string;

  @IsIn(['present', 'absent', 'excused'])
  status: string;

  @IsOptional() @IsString()
  note?: string;
}

class UpdateAttendanceDto {
  @IsOptional() @IsNumber() @Min(1)
  sessionNumber?: number;

  @IsOptional() @IsDateString()
  sessionDate?: string;

  @IsOptional() @IsString()
  @Transform(({ value }) => value?.trim())
  topic?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecordDto)
  records?: UpdateRecordDto[];
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /** POST /attendance — Murabbi or admin submits attendance */
  @Post()
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  submit(
    @CurrentUser() user: UserDocument,
    @Body() dto: SubmitAttendanceDto,
  ) {
    return this.attendanceService.submit(user._id.toString(), dto);
  }

  /** GET /attendance — Admin views all sessions */
  @Get()
  @Roles(UserRole.ADMIN)
  getAll() {
    return this.attendanceService.getAll();
  }

  /** GET /attendance/by-murabbi/:id — Sessions submitted by a specific murabbi */
  @Get('by-murabbi/:id')
  @Roles(UserRole.ADMIN)
  getByMurabbi(@Param('id') id: string) {
    return this.attendanceService.getByMurabbi(id);
  }

  /** GET /attendance/by-student/:id — Attendance history of a specific student */
  @Get('by-student/:id')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getByStudent(@Param('id') id: string) {
    return this.attendanceService.getByStudent(id);
  }

  /** GET /attendance/circle/:id — Sessions for a specific circle */
  @Get('circle/:id')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getByCircle(@Param('id') id: string) {
    return this.attendanceService.getByCircle(id);
  }

  /** GET /attendance/student/:id/rate — Student attendance rate */
  @Get('student/:id/rate')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getStudentRate(@Param('id') id: string) {
    return this.attendanceService.getStudentRate(id);
  }

  /** GET /attendance/:id — Single session detail */
  @Get(':id')
  @Roles(UserRole.ADMIN)
  getById(@Param('id') id: string) {
    return this.attendanceService.getById(id);
  }

  /** PATCH /attendance/:id — Admin edits a session */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, dto);
  }

  /** DELETE /attendance/:id — Admin deletes a session */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.attendanceService.remove(id);
  }
}