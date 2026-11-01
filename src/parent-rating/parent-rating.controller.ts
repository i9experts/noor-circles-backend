import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { currentMonth, MONTH_RE } from '../common/utils/month.util';
import { ParentRatingService } from './parent-rating.service';
import { AdjustParentRatingDto } from './parent-rating.dto';

function monthParam(m?: string) {
  if (!m) return currentMonth();
  if (!MONTH_RE.test(m)) throw new BadRequestException('Month must be YYYY-MM.');
  return m;
}

@Controller('parent-ratings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentRatingController {
  constructor(private readonly service: ParentRatingService) {}

  /** GET /parent-ratings?month=YYYY-MM — every parent, ranked (admin). */
  @Get()
  @Roles(UserRole.ADMIN)
  ratings(@Query('month') month?: string) { return this.service.ratingsForMonth(monthParam(month)); }

  /** GET /parent-ratings/me?month= — a parent's own rating and its parts. */
  @Get('me')
  @Roles(UserRole.PARENT)
  mine(@CurrentUser() user: UserDocument, @Query('month') month?: string) {
    return this.service.myRating(user._id.toString(), monthParam(month));
  }

  /** PATCH /parent-ratings/:userId?month= — admin adjustment. */
  @Patch(':userId')
  @Roles(UserRole.ADMIN)
  adjust(@CurrentUser() user: UserDocument, @Param('userId') userId: string, @Body() dto: AdjustParentRatingDto, @Query('month') month?: string) {
    return this.service.adjust(userId, monthParam(month), dto.adjustment, dto.note ?? '', user._id.toString());
  }
}
