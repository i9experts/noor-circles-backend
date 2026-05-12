import { Controller, Get, UseGuards } from '@nestjs/common';
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

  /** GET /reports/attendance-trend */
  @Get('attendance-trend')
  @Roles(UserRole.MURABBI, UserRole.ADMIN)
  getAttendanceTrend(@CurrentUser() user: UserDocument) {
    return this.reportService.getAttendanceTrend(
      user.role === UserRole.MURABBI ? user._id.toString() : undefined,
    );
  }
}
