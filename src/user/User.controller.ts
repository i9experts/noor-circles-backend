import { Controller, Get, Patch, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from './user.schema';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Apna Profile dekho (admin + murabbi dono) ──────────────────────────────
  @Get('profile')
  getProfile(@CurrentUser() user: UserDocument) {
    return this.usersService.getProfile(user._id.toString());
  }

  // ── Apna Profile update karo ───────────────────────────────────────────────
  @Patch('profile')
  updateProfile(@CurrentUser() user: UserDocument, @Body() body: any) {
    // Sirf fullName update allow karo — email/role nahi
    const { fullName } = body;
    return this.usersService.updateUserData(user._id.toString(), { fullName });
  }

  // ── Admin Only: Sab users dekho ───────────────────────────────────────────
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  // ── Admin Only: Kisi ko deactivate karo ───────────────────────────────────
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivateUser(id);
  }
}