import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UsersService } from '../user/user.service';
import { MurabbiService, MurabbiEnrollStudentDto, MurabbiUpdateStudentDto } from './murabbi.service';
import { UserDocument, UserRole } from '../user/user.schema';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => value?.trim())
  fullName?: string;
}

@Controller('murabbi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MURABBI, UserRole.ADMIN)
export class MurabbiController {
  constructor(
    private readonly usersService:   UsersService,
    private readonly murabbiService: MurabbiService,
  ) {}

  /** GET /murabbi/profile */
  @Get('profile')
  getProfile(@CurrentUser() user: UserDocument) {
    return this.usersService.getProfile(user._id.toString());
  }

  /** PATCH /murabbi/profile */
  @Patch('profile')
  updateProfile(@CurrentUser() user: UserDocument, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user._id.toString(), dto);
  }

  /**
   * GET /murabbi/dashboard
   * → Stats + circles + top students for this murabbi
   */
  @Get('dashboard')
  getDashboard(@CurrentUser() user: UserDocument) {
    return this.murabbiService.getDashboard(user._id.toString());
  }

  /**
   * GET /murabbi/my-circles
   * → All circles where this murabbi is assigned
   */
  @Get('my-circles')
  getMyCircles(@CurrentUser() user: UserDocument) {
    return this.murabbiService.getMyCircles(user._id.toString());
  }

  /**
   * GET /murabbi/my-students
   * → All students assigned to this murabbi
   */
  @Get('my-students')
  getMyStudents(@CurrentUser() user: UserDocument) {
    return this.murabbiService.getMyStudents(user._id.toString());
  }

  /**
   * POST /murabbi/enroll-student
   * → Murabbi enrolls a student into one of their own circles
   */
  @Post('enroll-student')
  enrollStudent(@CurrentUser() user: UserDocument, @Body() dto: MurabbiEnrollStudentDto) {
    return this.murabbiService.enrollStudent(user._id.toString(), dto);
  }

  /**
   * PATCH /murabbi/students/:id
   * → Murabbi updates basic info of a student in their circles
   */
  @Patch('students/:id')
  updateStudent(
    @CurrentUser() user: UserDocument,
    @Param('id') studentId: string,
    @Body() dto: MurabbiUpdateStudentDto,
  ) {
    return this.murabbiService.updateStudent(user._id.toString(), studentId, dto);
  }
}
