import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { ReportService } from './report.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /** GET /reports/murabbi */
  @Get('murabbi')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getMurabbiReport(@CurrentUser() user: UserDocument) {
    return this.reportService.getMurabbiReport(user._id.toString());
  }

  /** GET /reports/admin */
  @Get('admin')
  @Roles(UserRole.ADMIN)
  getAdminReport() {
    return this.reportService.getAdminReport();
  }

  /** GET /reports/attendance-circles */
  @Get('attendance-circles')
  @Roles(UserRole.ADMIN)
  getAttendanceTrendPerCircle() {
    return this.reportService.getAttendanceTrendPerCircle();
  }

  /** GET /reports/circle/:id/detail */
  @Get('circle/:id/detail')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getCircleDetail(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.reportService.getCircleDetail(id, user._id.toString(), user.role);
  }

  /** GET /reports/attendance-trend?circleId=xxx */
  @Get('attendance-trend')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getAttendanceTrend(
    @CurrentUser() user: UserDocument,
    @Query('circleId') circleId?: string,
  ) {
    if (user.role === UserRole.MURABBI) {
      return this.reportService.getAttendanceTrend(circleId, user._id.toString());
    }
    return this.reportService.getAttendanceTrend(circleId);
  }
}
