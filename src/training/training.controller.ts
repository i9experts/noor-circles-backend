import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
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
  UpsertExamDto,
  SubmitExamDto,
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
  /** Minimum murabbi tier (1-3) required to view this module. Defaults to 1 (everyone). */
  @IsOptional() @IsNumber() @Min(1) @Max(3) minTier?: number;
  /** Participant-facing study content (Markdown). */
  @IsOptional() @IsString() content?: string;
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

  /** GET /training/active-batch — returns batch only if caller is a candidate */
  @Get('active-batch')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getActiveBatch(@CurrentUser() user: UserDocument) {
    return this.trainingService.getActiveBatch(user._id.toString());
  }

  // ── Modules ──────────────────────────────────────────────────────────────────

  /** GET /training/modules — includes each module's `content` field for in-app reading */
  @Get('modules')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getModules(@CurrentUser() user: UserDocument) {
    return this.trainingService.getModules(user._id.toString(), user.role === UserRole.ADMIN);
  }

  /** GET /training/progress/summary */
  @Get('progress/summary')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getProgressSummary(@CurrentUser() user: UserDocument) {
    return this.trainingService.getProgressSummary(user._id.toString(), user.role === UserRole.ADMIN);
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

  // ── Exams (admin) ────────────────────────────────────────────────────────────

  /** POST /training/exams — create or replace the final assessment for a tier */
  @Post('exams')
  @Roles(UserRole.ADMIN)
  upsertExam(@Body() dto: UpsertExamDto) {
    return this.trainingService.upsertExam(dto);
  }

  /** GET /training/exams/:tier — full exam including correct answers (admin only) */
  @Get('exams/:tier')
  @Roles(UserRole.ADMIN)
  getExamAdmin(@Param('tier') tier: string) {
    return this.trainingService.getExamAdmin(Number(tier));
  }

  /** GET /training/certificates — every certificate issued, across all murabbis */
  @Get('certificates')
  @Roles(UserRole.ADMIN)
  getAllCertificates() {
    return this.trainingService.getAllCertificates();
  }

  // ── Exam (murabbi) ───────────────────────────────────────────────────────────

  /**
   * GET /training/exam?tier=1 — defaults to the murabbi's own tier.
   * Locked (403) until every module for that tier is at 100%.
   * Never includes correct answers.
   */
  @Get('exam')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getExam(@CurrentUser() user: UserDocument, @Query('tier') tier?: string) {
    const t = tier ? Number(tier) : (user as any).tier ?? 1;
    return this.trainingService.getExamForMurabbi(user._id.toString(), t);
  }

  /** POST /training/exam/submit?tier=1 — auto-graded; issues a certificate on first pass. */
  @Post('exam/submit')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  submitExam(@CurrentUser() user: UserDocument, @Body() dto: SubmitExamDto, @Query('tier') tier?: string) {
    const t = tier ? Number(tier) : (user as any).tier ?? 1;
    return this.trainingService.submitExam(user._id.toString(), t, dto);
  }

  // ── Certificates (murabbi) ───────────────────────────────────────────────────

  /** GET /training/my-certificates */
  @Get('my-certificates')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getMyCertificates(@CurrentUser() user: UserDocument) {
    return this.trainingService.getMyCertificates(user._id.toString());
  }

  /** GET /training/certificate/:tier/download — streams the PDF */
  @Get('certificate/:tier/download')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  async downloadCertificate(
    @CurrentUser() user: UserDocument,
    @Param('tier') tier: string,
    @Res() res: Response,
  ) {
    const pdf = await this.trainingService.generateCertificatePdf(user._id.toString(), Number(tier));
    res.set({
      'Content-Type'       : 'application/pdf',
      'Content-Disposition': `attachment; filename="noor-circles-tier-${tier}-certificate.pdf"`,
      'Content-Length'     : pdf.length,
    });
    res.send(pdf);
  }
}
