import {
  Body, Controller, Delete, Get, Param,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { PerformanceService, SubmitReviewDto } from './performance.service';

@Controller('performance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /** POST /performance/reviews */
  @Post('reviews')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  submitReview(@CurrentUser() user: UserDocument, @Body() dto: SubmitReviewDto) {
    const murabbiId =
      user.role === UserRole.ADMIN && dto.murabbiId
        ? dto.murabbiId
        : user._id.toString();
    return this.performanceService.submitReview(murabbiId, dto, user._id.toString());
  }

  /** GET /performance/my-reviews — murabbi's own reviews */
  @Get('my-reviews')
  @Roles(UserRole.MURABBI)
  getMyReviews(@CurrentUser() user: UserDocument) {
    return this.performanceService.getMyReviews(user._id.toString());
  }

  /** GET /performance/reviews?circleId=&murabbiId= */
  @Get('reviews')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getReviews(
    @CurrentUser() user: UserDocument,
    @Query('circleId')  circleId?:  string,
    @Query('murabbiId') murabbiId?: string,
  ) {
    if (user.role === UserRole.MURABBI) {
      return this.performanceService.getReviews({ murabbiId: user._id.toString() });
    }
    return this.performanceService.getReviews({ circleId, murabbiId });
  }

  /** GET /performance/indicators */
  @Get('indicators')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getIndicators() {
    return this.performanceService.getIndicators();
  }

  /** GET /performance/summary — admin only */
  @Get('summary')
  @Roles(UserRole.ADMIN)
  getSummary() {
    return this.performanceService.getSummary();
  }

  /** DELETE /performance/reviews/:id — admin only */
  @Delete('reviews/:id')
  @Roles(UserRole.ADMIN)
  deleteReview(@Param('id') id: string) {
    return this.performanceService.deleteReview(id);
  }

  /** PATCH /performance/reviews/:id/resolve — admin only */
  @Patch('reviews/:id/resolve')
  @Roles(UserRole.ADMIN)
  resolveFollowUp(@Param('id') id: string) {
    return this.performanceService.resolveFollowUp(id);
  }
}
