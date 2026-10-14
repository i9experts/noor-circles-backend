import {
  BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query,
  RawBodyRequest, Req, UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { ContributionService } from './contribution.service';
import { StripeService } from './stripe.service';
import {
  CreateContributorDto, PublicCheckoutDto, RecordPaymentDto, UpdateContributorDto, UpdatePaymentDto,
} from './contribution.dto';
import { currentMonth, MONTH_RE } from '../common/utils/month.util';

function monthParam(m?: string) {
  if (!m) return currentMonth();
  if (!MONTH_RE.test(m)) throw new BadRequestException('Month must be YYYY-MM.');
  return m;
}

@Controller('contributions')
export class ContributionController {
  constructor(
    private readonly service: ContributionService,
    private readonly stripe : StripeService,
  ) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  /** POST /contributions/public/checkout — landing page "Support Noor Circles". */
  @Post('public/checkout')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(@Body() dto: PublicCheckoutDto, @Headers('origin') origin?: string) {
    return this.service.publicCheckout(dto, origin);
  }

  /** POST /contributions/stripe/webhook — signed by Stripe; needs the raw body. */
  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!this.stripe.isConfigured) throw new BadRequestException('Stripe is not configured.');
    if (!signature || !req.rawBody) throw new BadRequestException('Missing Stripe signature.');
    let event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe signature.');
    }
    const result = await this.service.handleStripeEvent(event);
    return { message: 'received', type: event.type, ...result };
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  summary(@Query('month') month?: string) {
    return this.service.summary(monthParam(month));
  }

  @Get('contributors')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  listContributors(@Query('type') type?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.service.listContributors({ type, status, search });
  }

  @Post('contributors')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  createContributor(@Body() dto: CreateContributorDto) {
    return this.service.createContributor(dto);
  }

  @Get('contributors/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  getContributor(@Param('id') id: string) {
    return this.service.getContributor(id);
  }

  @Patch('contributors/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  updateContributor(@Param('id') id: string, @Body() dto: UpdateContributorDto) {
    return this.service.updateContributor(id, dto);
  }

  @Delete('contributors/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  deleteContributor(@Param('id') id: string) {
    return this.service.deleteContributor(id);
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  listPayments(
    @Query('month') month?: string, @Query('method') method?: string,
    @Query('status') status?: string, @Query('contributorId') contributorId?: string,
  ) {
    if (month) monthParam(month);
    if (contributorId && !/^[a-f\d]{24}$/i.test(contributorId)) throw new BadRequestException('Invalid contributor id.');
    return this.service.listPayments({ month, method, status, contributorId });
  }

  @Post('payments')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  recordPayment(@CurrentUser() user: UserDocument, @Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto, user._id.toString());
  }

  @Patch('payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  updatePayment(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.service.updatePayment(id, dto);
  }
}
