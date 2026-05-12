import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { RolesGuard }     from '../auth/guards/roles.guard';
import { Roles }          from '../auth/decorators/roles.decorator';
import { CurrentUser }    from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { AttendanceService } from './attendance.service';
import { IsArray, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class AttendanceRecordDto {
  @IsMongoId() student: string;
  @IsIn(['present', 'absent', 'excused']) status: string;
  @IsOptional() @IsString() note?: string;
}

class SubmitAttendanceDto {
  @IsMongoId()     circle:        string;
  @IsNumber() @Min(1) sessionNumber: number;
  @IsDateString()  sessionDate:   string;
  @IsOptional() @IsString() @Transform(({ value }) => value?.trim()) topic?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AttendanceRecordDto) records: AttendanceRecordDto[];
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /** POST /attendance — Murabbi submits attendance */
  @Post()
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  submit(@CurrentUser() user: UserDocument, @Body() dto: SubmitAttendanceDto) {
    return this.attendanceService.submit(user._id.toString(), dto);
  }

  /** GET /attendance — Admin views all records */
  @Get()
  @Roles(UserRole.ADMIN)
  getAll() {
    return this.attendanceService.getAll();
  }

  /** GET /attendance/circle/:id — Murabbi views their circle's records */
  @Get('circle/:id')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getByCircle(@Param('id') id: string) {
    return this.attendanceService.getByCircle(id);
  }

  /** GET /attendance/student/:id/rate */
  @Get('student/:id/rate')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getStudentRate(@Param('id') id: string) {
    return this.attendanceService.getStudentRate(id);
  }
}
