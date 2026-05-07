import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UsersService } from '../user/user.service';
import { UserDocument, UserRole } from '../user/user.schema';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => value?.trim())
  fullName?: string;
}

/**
 * Routes available to Murabbi (and also Admin if needed).
 * All routes require valid JWT.
 */
@Controller('murabbi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MURABBI, UserRole.ADMIN)
export class MurabbiController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /murabbi/profile
   * → Returns own profile
   */
  @Get('profile')
  getProfile(@CurrentUser() user: UserDocument) {
    return this.usersService.getProfile(user._id.toString());
  }

  /**
   * PATCH /murabbi/profile
   * Body: { fullName }
   * → Updates own profile (only fullName allowed)
   */
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user._id.toString(), dto);
  }
}