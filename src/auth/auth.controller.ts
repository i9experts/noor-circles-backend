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

  // ─── SIGNUP (2-step OTP flow) ─────────────────────────────────────────────

  /** POST /api/v1/auth/signup/request-otp */
  @Post('signup/request-otp')
  @HttpCode(HttpStatus.OK)
  signupRequestOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  /** POST /api/v1/auth/signup/verify-otp */
  @Post('signup/verify-otp')
  @HttpCode(HttpStatus.CREATED)
  signupVerifyOtp(@Body() dto: SignupVerifyOtpDto) {
    return this.authService.signupVerifyOtp(dto);
  }

  // ─── SIGNIN ───────────────────────────────────────────────────────────────

  /** POST /api/v1/auth/signin */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: SignInDto) {
    return this.authService.signin(dto);
  }

  // ─── FORGOT PASSWORD ──────────────────────────────────────────────────────

  /** POST /api/v1/auth/forgot-password */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /** POST /api/v1/auth/verify-otp  (password-reset OTP check → returns resetToken) */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  /** POST /api/v1/auth/reset-password  (Authorization: Bearer <resetToken>) */
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

  // ─── RESEND OTP ───────────────────────────────────────────────────────────

  /**
   * POST /api/v1/auth/resend-otp?type=signup
   * POST /api/v1/auth/resend-otp?type=reset
   */
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('type') type: 'signup' | 'reset' = 'reset',
  ) {
    return this.authService.resendOtp(dto.email, type);
  }

  // ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────

  /**
   * POST /api/v1/auth/refresh
   * Authorization: Bearer <refreshToken>
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

  // ─── PROTECTED ────────────────────────────────────────────────────────────

  /** GET /api/v1/auth/me  (Authorization: Bearer <accessToken>) */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserDocument) {
    return {
      message: 'User fetched successfully.',
      user: {
        id      : user._id,
        fullName: user.fullName,
        email   : user.email,
        role    : user.role,
        isActive: user.isActive,
        image   : user.image ?? null,
      },
    };
  }

  /** POST /api/v1/auth/logout  (Authorization: Bearer <refreshToken>) */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  logout(@Request() req) {
    return this.authService.logout(req.user.userId, req.user.refreshToken);
  }

  /** POST /api/v1/auth/logout-all  (Authorization: Bearer <accessToken>) */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: UserDocument) {
    return this.authService.logoutAll(user._id.toString());
  }
}
