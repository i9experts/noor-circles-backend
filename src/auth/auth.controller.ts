import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SignupRequestOtpDto,
  SignupVerifyOtpDto,
  SignInDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  ResendOtpDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserDocument } from '../user/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── PUBLIC ──────────────────────────────────────────────────────────────────

  /**
   * POST /auth/signup/request-otp
   * Body: { fullName, email, password }
   * → Sends OTP to email (2 min expiry)
   */
  @Post('signup/request-otp')
  @HttpCode(HttpStatus.OK)
  signupRequestOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  /**
   * POST /auth/signup/verify-otp
   * Body: { email, otp }
   * → Verifies OTP, creates account, returns tokens + user
   */
  @Post('signup/verify-otp')
  @HttpCode(HttpStatus.CREATED)
  signupVerifyOtp(@Body() dto: SignupVerifyOtpDto) {
    return this.authService.signupVerifyOtp(dto);
  }

  /**
   * POST /auth/signin
   * Body: { email, password }
   * → Returns accessToken + refreshToken + user (with role)
   */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: SignInDto) {
    return this.authService.signin(dto);
  }

  /**
   * POST /auth/forgot-password
   * Body: { email }
   * → Sends password-reset OTP (2 min expiry)
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /auth/verify-otp
   * Body: { email, otp }
   * → Returns short-lived resetToken (10 min)
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  /**
   * POST /auth/reset-password
   * Header: Authorization: Bearer <resetToken>
   * Body:   { newPassword }
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Headers('authorization') authHeader: string,
    @Body() dto: ResetPasswordDto,
  ) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : '';
    return this.authService.resetPassword(token, dto);
  }

  /**
   * POST /auth/resend-otp?type=signup   ← signup flow
   * POST /auth/resend-otp?type=reset    ← forgot-password flow
   * Body: { email }
   */
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('type') type: 'signup' | 'reset' = 'reset',
  ) {
    return this.authService.resendOtp(dto.email, type);
  }

  // ─── PROTECTED ───────────────────────────────────────────────────────────────

  /**
   * POST /auth/refresh
   * Header: Authorization: Bearer <refreshToken>
   * → Returns new accessToken + refreshToken (rotation)
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  refresh(@Request() req) {
    return this.authService.refreshTokens(
      req.user.userId,
      req.user.refreshToken,
    );
  }

  /**
   * GET /auth/me
   * Header: Authorization: Bearer <accessToken>
   * → Returns current user info (id, fullName, email, role)
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserDocument) {
    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }

  /**
   * POST /auth/logout
   * Header: Authorization: Bearer <refreshToken>
   * → Revokes current device session
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  logout(@Request() req) {
    return this.authService.logout(req.user.userId, req.user.refreshToken);
  }

  /**
   * POST /auth/logout-all
   * Header: Authorization: Bearer <accessToken>
   * → Revokes all sessions (all devices)
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: UserDocument) {
    return this.authService.logoutAll(user._id.toString());
  }
}
