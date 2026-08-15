import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';
import { LessonService } from './lesson.service';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

class CreateLessonDto {
  @IsString() @Transform(safeTrim) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() pdfUrl?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) order?: number;
  @IsOptional() @IsNumber() @Type(() => Number) sessionNumber?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) objectives?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) keyTopics?: string[];
}

@Controller('lessons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  /** GET /lessons — all roles */
  @Get()
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getAll() { return this.lessonService.getAll(); }

  /** GET /lessons/:id */
  @Get(':id')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getOne(@Param('id') id: string) { return this.lessonService.getOne(id); }

  /** POST /lessons — Admin only */
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateLessonDto) { return this.lessonService.create(dto); }

  /** PATCH /lessons/:id — Admin only */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<CreateLessonDto>) {
    return this.lessonService.update(id, dto);
  }

  /** DELETE /lessons/:id — Admin only */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.lessonService.remove(id); }
}
