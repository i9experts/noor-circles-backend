import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { IncentiveService, AwardPointsDto } from './incentive.service';

@Controller('incentives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncentiveController {
  constructor(private readonly incentiveService: IncentiveService) {}

  /** POST /incentives — award points (admin or murabbi) */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  award(@CurrentUser() user: UserDocument, @Body() dto: AwardPointsDto) {
    return this.incentiveService.award(user._id.toString(), dto, user.role);
  }

  /** GET /incentives — all incentive records (admin only) */
  @Get()
  @Roles(UserRole.ADMIN)
  getAll() {
    return this.incentiveService.getAll();
  }

  /** GET /incentives/page-data — full page: leaderboard + murabbi of month + breakdown */
  @Get('page-data')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getPageData() {
    return this.incentiveService.getPageData();
  }

  /** GET /incentives/leaderboard */
  @Get('leaderboard')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getLeaderboard() {
    return this.incentiveService.getLeaderboard();
  }

  /** GET /incentives/student/:id */
  @Get('student/:id')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getByStudent(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.incentiveService.getByStudent(id, user._id.toString(), user.role);
  }
}
