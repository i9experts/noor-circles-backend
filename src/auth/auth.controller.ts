import {
  Body, Controller, Get, Headers,
  HttpCode, HttpStatus, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupRequestOtpDto, SignupVerifyOtpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { ForgotPasswordDto, VerifyOtpDto, ResetPasswordDto, ResendOtpDto } from './dto/other.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserDocument } from '../user/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Signup: 2-step ──────────────────────────────────────────────────────────

  /** Step 1: fullName + email + password bhejo → OTP aata hai */
  @Post('signup/request-otp')
  @HttpCode(HttpStatus.OK)
  signupRequestOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  /** Step 2: email + otp bhejo → account banta hai + tokens milte hain */
  @Post('signup/verify-otp')
  @HttpCode(HttpStatus.CREATED)
  signupVerifyOtp(@Body() dto: SignupVerifyOtpDto) {
    return this.authService.signupVerifyOtp(dto);
  }

  // ── Signin ──────────────────────────────────────────────────────────────────

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: SignInDto) {
    return this.authService.signin(dto);
  }

  // ── Forgot Password ─────────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

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

  // ── Resend OTP ──────────────────────────────────────────────────────────────
  /** 
   * type query param: 'signup' ya 'reset'
   * e.g. POST /auth/resend-otp?type=signup
   */
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('type') type: 'signup' | 'reset' = 'reset',
  ) {
    return this.authService.resendOtp(dto.email, type);
  }

  // ── Protected ───────────────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  refresh(@Request() req) {
    return this.authService.refreshTokens(req.user.userId, req.user.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserDocument) {
    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  logout(@Request() req) {
    return this.authService.logout(req.user.userId, req.user.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: UserDocument) {
    return this.authService.logoutAll(user._id.toString());
  }
}