import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { safeTrim } from '../common/utils/transform.util';
import { currentMonth, MONTH_RE } from '../common/utils/month.util';
import { EngagementService } from './engagement.service';

class AdjustRatingDto {
  @IsInt() @Min(-20, { message: 'Adjustment must be between −20 and +20.' }) @Max(20, { message: 'Adjustment must be between −20 and +20.' })
  adjustment: number;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  note?: string;
}

function monthParam(m?: string) {
  if (!m) return currentMonth();
  if (!MONTH_RE.test(m)) throw new BadRequestException('Month must be YYYY-MM.');
  return m;
}

@Controller('engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EngagementController {
  constructor(private readonly service: EngagementService) {}

  /** GET /engagement/ratings?month=YYYY-MM — all murabbis, ranked (admin) */
  @Get('ratings')
  @Roles(UserRole.ADMIN)
  ratings(@Query('month') month?: string) {
    return this.service.ratingsForMonth(monthParam(month));
  }

  /** PATCH /engagement/ratings/:murabbiId?month= — admin adjustment */
  @Patch('ratings/:murabbiId')
  @Roles(UserRole.ADMIN)
  adjust(
    @CurrentUser() user: UserDocument, @Param('murabbiId') murabbiId: string,
    @Body() dto: AdjustRatingDto, @Query('month') month?: string,
  ) {
    if (!/^[a-f\d]{24}$/i.test(murabbiId)) throw new BadRequestException('Invalid murabbi id.');
    return this.service.adjust(murabbiId, monthParam(month), dto.adjustment, dto.note ?? '', user._id.toString());
  }

  /** GET /engagement/my?month= — a murabbi's own rating + breakdown */
  @Get('my')
  @Roles(UserRole.MURABBI)
  my(@CurrentUser() user: UserDocument, @Query('month') month?: string) {
    return this.service.myRating(user._id.toString(), monthParam(month));
  }
}
