import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';
import { InsightFilters, InsightsService } from './insights.service';
import { FamilyProfileDto } from './family-profile';

const LIST_FILTERS = [
  'status', 'source', 'city', 'neighbourhood', 'relationship', 'livesWith', 'household', 'work', 'days', 'times', 'transport',
  'ageBand', 'gender', 'school', 'quran', 'language', 'needs', 'involvement', 'heardFrom', 'answered',
] as const;

/** Parent Insights: family situation and needs. Admins only (never murabbis). */
@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** GET /insights/parents?livesWith=mother-only,father-only&days=saturday&from=2026-01-01 */
  @Get('parents')
  parents(@Query() q: Record<string, string | undefined>) {
    const filters: InsightFilters = { from: q.from, to: q.to, search: q.search };
    for (const k of LIST_FILTERS) {
      const v = q[k];
      if (v) filters[k] = String(v).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    }
    return this.insights.parents(filters);
  }

  /** PUT /insights/families/:id/profile — id is "p:<parentId>" or "i:<interestId>". */
  @Put('families/:id/profile')
  saveProfile(@Param('id') id: string, @Body() dto: FamilyProfileDto) {
    return this.insights.saveProfile(id, dto);
  }
}
