import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { MONTH_RE } from '../common/utils/month.util';
import { RewardsService } from './rewards.service';
import { AddAllocationDto, CreatePoolDto, PayAllocationDto, UpdateAllocationDto, UpdatePoolDto } from './rewards.dto';

const month = (m: string) => { if (!MONTH_RE.test(m)) throw new BadRequestException('Month must be YYYY-MM.'); return m; };
const oid   = (id: string) => { if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid id format.'); return id; };

@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RewardsController {
  constructor(private readonly service: RewardsService) {}

  /** GET /rewards/my — a murabbi's own approved/paid rewards */
  @Get('my')
  @Roles(UserRole.MURABBI, UserRole.PARENT)
  my(@CurrentUser() user: UserDocument) { return this.service.myRewards(user._id.toString(), user.role); }

  @Get('pools')
  @Roles(UserRole.ADMIN)
  list() { return this.service.listPools(); }

  @Post('pools')
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() user: UserDocument, @Body() dto: CreatePoolDto) {
    return this.service.createPool(dto, user._id.toString());
  }

  @Get('pools/:month')
  @Roles(UserRole.ADMIN)
  get(@Param('month') m: string) { return this.service.getPool(month(m)); }

  @Patch('pools/:month')
  @Roles(UserRole.ADMIN)
  update(@Param('month') m: string, @Body() dto: UpdatePoolDto) { return this.service.updatePool(month(m), dto); }

  @Post('pools/:month/regenerate')
  @Roles(UserRole.ADMIN)
  regenerate(@Param('month') m: string) { return this.service.regenerate(month(m)); }

  @Post('pools/:month/approve')
  @Roles(UserRole.ADMIN)
  approve(@CurrentUser() user: UserDocument, @Param('month') m: string) {
    return this.service.approve(month(m), user._id.toString());
  }

  @Delete('pools/:month')
  @Roles(UserRole.ADMIN)
  remove(@Param('month') m: string) { return this.service.deletePool(month(m)); }

  @Post('pools/:month/allocations')
  @Roles(UserRole.ADMIN)
  add(@Param('month') m: string, @Body() dto: AddAllocationDto) { return this.service.addAllocation(month(m), dto); }

  @Patch('allocations/:id')
  @Roles(UserRole.ADMIN)
  updateAllocation(@Param('id') id: string, @Body() dto: UpdateAllocationDto) {
    return this.service.updateAllocation(oid(id), dto);
  }

  @Post('allocations/:id/pay')
  @Roles(UserRole.ADMIN)
  pay(@CurrentUser() user: UserDocument, @Param('id') id: string, @Body() dto: PayAllocationDto) {
    return this.service.pay(oid(id), dto, user._id.toString());
  }
}
