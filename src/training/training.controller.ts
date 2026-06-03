import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { RolesGuard }     from '../auth/guards/roles.guard';
import { Roles }          from '../auth/decorators/roles.decorator';
import { CurrentUser }    from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import {
  TrainingService,
  CreateBatchDto,
  UpdateBatchDto,
  AddCandidatesDto,
} from './training.service';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

class UpdateProgressDto {
  @IsNumber() @Min(0) @Max(100) progressPercent: number;
}

class CreateModuleDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() totalLessons?: number;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsNumber() daySlot?: number;
  @IsOptional() @IsString() timeSlot?: string;
}

@Controller('training')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  // ── Page data ────────────────────────────────────────────────────────────────

  /** GET /training/page-data — admin full view */
  @Get('page-data')
  @Roles(UserRole.ADMIN)
  getPageData() { return this.trainingService.getPageData(); }

  /** GET /training/active-batch — murabbi & admin: active batch schedule */
  @Get('active-batch')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getActiveBatch() { return this.trainingService.getActiveBatch(); }

  // ── Modules ──────────────────────────────────────────────────────────────────

  /** GET /training/modules */
  @Get('modules')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getModules(@CurrentUser() user: UserDocument) {
    return this.trainingService.getModules(user._id.toString());
  }

  /** GET /training/progress/summary */
  @Get('progress/summary')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getProgressSummary(@CurrentUser() user: UserDocument) {
    return this.trainingService.getProgressSummary(user._id.toString());
  }

  /** PATCH /training/progress/:moduleId */
  @Patch('progress/:moduleId')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  updateProgress(@CurrentUser() user: UserDocument, @Param('moduleId') moduleId: string, @Body() dto: UpdateProgressDto) {
    return this.trainingService.updateProgress(user._id.toString(), moduleId, dto.progressPercent);
  }

  /** POST /training/modules */
  @Post('modules')
  @Roles(UserRole.ADMIN)
  createModule(@Body() dto: CreateModuleDto) { return this.trainingService.createModule(dto); }

  /** PATCH /training/modules/:id */
  @Patch('modules/:id')
  @Roles(UserRole.ADMIN)
  updateModule(@Param('id') id: string, @Body() dto: Partial<CreateModuleDto>) {
    return this.trainingService.updateModule(id, dto);
  }

  /** DELETE /training/modules/:id */
  @Delete('modules/:id')
  @Roles(UserRole.ADMIN)
  deleteModule(@Param('id') id: string) { return this.trainingService.deleteModule(id); }

  // ── Batches ──────────────────────────────────────────────────────────────────

  /** GET /training/batches */
  @Get('batches')
  @Roles(UserRole.ADMIN)
  getAllBatches() { return this.trainingService.getAllBatches(); }

  /** POST /training/batches */
  @Post('batches')
  @Roles(UserRole.ADMIN)
  createBatch(@Body() dto: CreateBatchDto) { return this.trainingService.createBatch(dto); }

  /** PATCH /training/batches/:id */
  @Patch('batches/:id')
  @Roles(UserRole.ADMIN)
  updateBatch(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.trainingService.updateBatch(id, dto);
  }

  /** POST /training/batches/:id/candidates */
  @Post('batches/:id/candidates')
  @Roles(UserRole.ADMIN)
  addCandidates(@Param('id') id: string, @Body() dto: AddCandidatesDto) {
    return this.trainingService.addCandidates(id, dto);
  }

  /** DELETE /training/batches/:id/candidates/:userId */
  @Delete('batches/:id/candidates/:userId')
  @Roles(UserRole.ADMIN)
  removeCandidate(@Param('id') id: string, @Param('userId') userId: string) {
    return this.trainingService.removeCandidate(id, userId);
  }
}
