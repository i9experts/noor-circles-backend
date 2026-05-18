import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { UserRole }     from '../user/user.schema';
import {
  ParentService,
  RegisterParentDto,
  UpdateParentDto,
  AddFeedbackDto,
} from './parent.service';

@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MURABBI)
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  /** GET /parents/stats */
  @Get('stats')
  getStats() {
    return this.parentService.getStats();
  }

  /** GET /parents */
  @Get()
  getAll() {
    return this.parentService.getAll();
  }

  /** GET /parents/:id */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.parentService.getOne(id);
  }

  /** POST /parents */
  @Post()
  register(@Body() dto: RegisterParentDto) {
    return this.parentService.register(dto);
  }

  /** PATCH /parents/:id */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.parentService.update(id, dto);
  }

  /** DELETE /parents/:id */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.parentService.remove(id);
  }

  /** POST /parents/:id/feedback */
  @Post(':id/feedback')
  addFeedback(@Param('id') id: string, @Body() dto: AddFeedbackDto) {
    return this.parentService.addFeedback(id, dto);
  }
}
