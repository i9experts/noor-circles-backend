import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { MurabbiProfileService } from './murabbi-profile.service';
import { MurabbiProfileDto } from './murabbi-profile.options';

const list = (v?: string | string[]) => (Array.isArray(v) ? v : v ? v.split(',') : []).filter(Boolean);

/** The murabbi introduction. Murabbis see their own; admins see everyone's. Supervisors never. */
@Controller('murabbi-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MurabbiProfileController {
  constructor(private readonly profiles: MurabbiProfileService) {}

  @Get('me')
  @Roles(UserRole.MURABBI)
  mine(@CurrentUser() user: UserDocument) { return this.profiles.get(user._id.toString()); }

  @Put('me')
  @Roles(UserRole.MURABBI)
  saveMine(@CurrentUser() user: UserDocument, @Body() dto: MurabbiProfileDto) {
    return this.profiles.save(user._id.toString(), dto, user._id.toString());
  }

  /** GET /murabbi-profile?status=&quran=&languages=&skill=&minLevel=&search= */
  @Get()
  @Roles(UserRole.ADMIN)
  all(@Query() q: Record<string, string | string[]>) {
    return this.profiles.list({
      status: list(q.status), quran: list(q.quran), languages: list(q.languages),
      skill: typeof q.skill === 'string' ? q.skill : undefined, minLevel: typeof q.minLevel === 'string' ? q.minLevel : undefined,
      search: typeof q.search === 'string' ? q.search : undefined,
    });
  }

  @Get(':userId')
  @Roles(UserRole.ADMIN)
  one(@Param('userId') userId: string) { return this.profiles.get(userId); }

  /** An admin fills it in or corrects it (e.g. over the phone). */
  @Put(':userId')
  @Roles(UserRole.ADMIN)
  saveFor(@Param('userId') userId: string, @Body() dto: MurabbiProfileDto, @CurrentUser() admin: UserDocument) {
    return this.profiles.save(userId, dto, admin._id.toString());
  }
}
