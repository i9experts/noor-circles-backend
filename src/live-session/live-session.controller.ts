import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { LiveSessionService } from './live-session.service';

@Controller('live-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LiveSessionController {
  constructor(private readonly service: LiveSessionService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() user: UserDocument, @Body() body: any) {
    return this.service.create(body, user._id.toString());
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getAll() {
    return this.service.getAll();
  }

  @Get('upcoming')
  @Roles(UserRole.ADMIN, UserRole.MURABBI)
  getUpcoming() {
    return this.service.getUpcoming();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}