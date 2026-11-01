import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { FounderService } from './founder.service';
import { UpdateFounderDto } from './founder.dto';

/** "Meet the Founder": public to read (portals and website); admins edit it. */
@Controller('founder')
export class FounderController {
  constructor(private readonly founder: FounderService) {}

  @Get()
  get() { return this.founder.get(); }

  /** GET /founder/posts — the newest posts from the founder's blog. */
  @Get('posts')
  posts() { return this.founder.latestPosts(); }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Body() dto: UpdateFounderDto, @CurrentUser() admin: UserDocument) { return this.founder.update(dto, admin._id.toString()); }

  @Post('reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reset(@CurrentUser() admin: UserDocument) { return this.founder.reset(admin._id.toString()); }
}
