import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { UserDocument, UserRole } from '../user/user.schema';
import { AccountService } from './account.service';
import { AccountAccessDto, ConvertInterestDto, CreateParentAccountDto } from './account.dto';

/** Admin-created portal accounts. Every response with a password shows it once. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  /** POST /interest/:id/account — a murabbi (mentor) or parent account from an interest request. */
  @Post('interest/:id/account')
  convert(@Param('id') id: string, @CurrentUser() admin: UserDocument, @Body() dto: ConvertInterestDto) {
    return this.accounts.convertInterest(id, admin._id.toString(), dto);
  }

  /** POST /parents/:id/account — a sign-in for a parent already on file. */
  @Post('parents/:id/account')
  createForParent(@Param('id') id: string, @Body() dto: CreateParentAccountDto) {
    return this.accounts.createParentAccount(id, dto);
  }

  /** POST /accounts/:userId/reset-password — new temporary password (murabbi or parent). */
  @Post('accounts/:userId/reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Param('userId') userId: string) {
    return this.accounts.resetPassword(userId);
  }

  /** PATCH /accounts/:userId/access — allow or block sign-in. */
  @Patch('accounts/:userId/access')
  access(@Param('userId') userId: string, @Body() dto: AccountAccessDto) {
    return this.accounts.setAccess(userId, dto.active);
  }
}
