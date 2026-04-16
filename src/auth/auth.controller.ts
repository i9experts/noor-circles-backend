import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  RefreshTokenDto,
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserDocument } from '../users/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/signup
  // Page: SignUpPage.tsx
  // Body: { fullName, email, password }
  // ──────────────────────────────────────────────────────────────────────────
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 signups per minute per IP
  signup(@Body() dto: SignUpDto) {
    return this.authService.signup(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/signin
  // Page: SignInPage.tsx
  // Body: { email, password }
  // Response: { accessToken, refreshToken, user }
  // ──────────────────────────────────────────────────────────────────────────
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 attempts per minute
  signin(@Body() dto: SignInDto) {
    return this.authService.signin(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/forgot-password
  // Page: ForgotPasswordPage.tsx
  // Body: { email }
  // Response: { message }   (generic – no email enumeration)
  // ──────────────────────────────────────────────────────────────────────────
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 3 OTPs per minute per IP
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/verify-otp
  // Page: VerifyOtpPage.tsx
  // Body: { email, otp }
  // Response: { resetToken }
  // ──────────────────────────────────────────────────────────────────────────
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 attempts per minute
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/reset-password
  // Page: ResetPasswordPage.tsx
  // Body: { resetToken, newPassword }
  // Response: { message }
  // ──────────────────────────────────────────────────────────────────────────
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/refresh
  // Body: { refreshToken }
  // Response: { accessToken, refreshToken }  (rotated)
  // ──────────────────────────────────────────────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/auth/signout
  // Body: { refreshToken }
  // Response: { message }
  // ──────────────────────────────────────────────────────────────────────────
  @Post('signout')
  @HttpCode(HttpStatus.OK)
  signout(@Body() dto: RefreshTokenDto) {
    return this.authService.signout(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/auth/me
  // Header: Authorization: Bearer <accessToken>
  // Response: { id, fullName, email }
  // Protected route example – use JwtAuthGuard on any future routes
  // ──────────────────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserDocument) {
    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
    };
  }
}