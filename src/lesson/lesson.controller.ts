import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { PartialType }  from '@nestjs/mapped-types';
import { LessonService } from './lesson.service';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

class CreateLessonDto {
  @IsString() @Transform(safeTrim) @IsNotEmpty({ message: 'Title is required.' }) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsIn(['Available', 'Upcoming', 'Draft'], { message: 'Status must be Available, Upcoming or Draft.' }) status?: string;
  @IsOptional() @IsString() pdfUrl?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) order?: number;
  @IsOptional() @IsNumber() @Type(() => Number) sessionNumber?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) objectives?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) keyTopics?: string[];
}

/** A real class (not `Partial<...>`, which erases to Object) so updates are validated (BUG-26). */
class UpdateLessonDto extends PartialType(CreateLessonDto) {}

@Controller('lessons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  /** GET /lessons — all roles */
  @Get()
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getAll(@CurrentUser() user: UserDocument) { return this.lessonService.getAll(user.role === UserRole.ADMIN); }

  /** GET /lessons/:id */
  @Get(':id')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.lessonService.getOne(id, user.role === UserRole.ADMIN);
  }

  /** POST /lessons — Admin only */
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateLessonDto) { return this.lessonService.create(dto); }

  /** PATCH /lessons/:id — Admin only */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.lessonService.update(id, dto);
  }

  /** DELETE /lessons/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.lessonService.remove(id); }
}
