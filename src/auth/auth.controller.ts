import { Body, Controller, Post, Get, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';  // ✅ NAYA
import { VerifyOtpDto } from './dto/verify-otp.dto';            // ✅ NAYA
import { ResetPasswordDto } from './dto/reset-password.dto';    // ✅ NAYA

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /api/v1/auth/signup
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignUpDto) {
    return this.authService.signup(dto);
  }

  // ✅ NAYA — POST /api/v1/auth/signin
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: SignInDto) {
    return this.authService.signin(dto);
  }

  // ✅ NAYA — GET /api/v1/auth/me (protected route example)
  @Get('me')
  @UseGuards(JwtAuthGuard) // ← token nahi hoga to 401 aayega
  getMe(@Request() req) {
    // req.user mein pura user object hoga (strategy ne diya)
    return {
      id: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
    };
  }

    // ✅ NAYA — POST /api/v1/auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ✅ NAYA — POST /api/v1/auth/verify-otp
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ✅ NAYA — POST /api/v1/auth/reset-password
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}