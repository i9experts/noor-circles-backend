import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import {
  ForgotPasswordDto,
  RefreshTokenDto,
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async hashValue(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  private async compareValue(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  private generateOtp(): string {
    // 6-digit numeric OTP
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    return { accessToken, refreshToken };
  }

  // ── 1. SIGN UP ─────────────────────────────────────────────────────────────
  // Page: SignUpPage.tsx
  // POST /api/v1/auth/signup
  async signup(dto: SignUpDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await this.hashValue(dto.password);

    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email,
      password: hashedPassword,
    });

    return {
      message: 'Account created successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  // ── 2. SIGN IN ─────────────────────────────────────────────────────────────
  // Page: SignInPage.tsx
  // POST /api/v1/auth/signin
  async signin(dto: SignInDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatch = await this.compareValue(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { accessToken, refreshToken } = this.generateTokens(
      (user._id as string).toString(),
      user.email,
    );

    // Store hashed refresh token
    const hashedRefreshToken = await this.hashValue(refreshToken);
    await this.usersService.addRefreshToken(
      (user._id as string).toString(),
      hashedRefreshToken,
    );

    return {
      message: 'Signed in successfully',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  // ── 3. FORGOT PASSWORD ─────────────────────────────────────────────────────
  // Page: ForgotPasswordPage.tsx
  // POST /api/v1/auth/forgot-password
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Always return the same message to prevent email enumeration
    const genericMessage =
      'If that email is registered, an OTP has been sent.';

    if (!user) return { message: genericMessage };

    const otp = this.generateOtp();
    const expiresMinutes =
      this.config.get<number>('OTP_EXPIRES_MINUTES') || 10;
    const otpExpiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Store hashed OTP
    const hashedOtp = await this.hashValue(otp);
    await this.usersService.setOtp(
      (user._id as string).toString(),
      hashedOtp,
      otpExpiresAt,
    );

    await this.mailService.sendOtp(user.email, otp);

    return { message: genericMessage };
  }

  // ── 4. VERIFY OTP ──────────────────────────────────────────────────────────
  // Page: VerifyOtpPage.tsx
  // POST /api/v1/auth/verify-otp
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Check expiry
    if (new Date() > user.otpExpiresAt) {
      await this.usersService.clearOtp((user._id as string).toString());
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Check OTP match
    const otpMatch = await this.compareValue(dto.otp, user.otpCode);
    if (!otpMatch) {
      throw new BadRequestException('Invalid OTP');
    }

    // OTP valid → clear it and issue a short-lived reset token
    await this.usersService.clearOtp((user._id as string).toString());

    const resetToken = this.jwtService.sign(
      { sub: (user._id as string).toString(), email: user.email, purpose: 'reset' },
      {
        secret: this.config.get<string>('JWT_RESET_SECRET'),
        expiresIn: this.config.get<string>('JWT_RESET_EXPIRES_IN') || '10m',
      },
    );

    return {
      message: 'OTP verified successfully',
      resetToken,
    };
  }

  // ── 5. RESET PASSWORD ──────────────────────────────────────────────────────
  // Page: ResetPasswordPage.tsx
  // POST /api/v1/auth/reset-password
  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; purpose: string };

    try {
      payload = this.jwtService.verify(dto.resetToken, {
        secret: this.config.get<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    if (payload.purpose !== 'reset') {
      throw new BadRequestException('Invalid reset token');
    }

    const hashedPassword = await this.hashValue(dto.newPassword);
    await this.usersService.updatePassword(payload.sub, hashedPassword);

    // Invalidate all refresh tokens (force re-login everywhere)
    await this.usersService.clearAllRefreshTokens(payload.sub);

    return { message: 'Password updated successfully' };
  }

  // ── 6. REFRESH TOKEN ───────────────────────────────────────────────────────
  // POST /api/v1/auth/refresh
  async refreshTokens(dto: RefreshTokenDto) {
    let payload: { sub: string; email: string };

    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshTokens?.length) {
      throw new UnauthorizedException('Access denied');
    }

    // Find the matching hashed token
    let matchedHash: string | null = null;
    for (const hashed of user.refreshTokens) {
      const match = await this.compareValue(dto.refreshToken, hashed);
      if (match) {
        matchedHash = hashed;
        break;
      }
    }

    if (!matchedHash) {
      // Token reuse detected → nuke all tokens (security)
      await this.usersService.clearAllRefreshTokens(payload.sub);
      throw new UnauthorizedException('Refresh token reuse detected. Please sign in again.');
    }

    // Rotate refresh token
    await this.usersService.removeRefreshToken(payload.sub, matchedHash);

    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(
      payload.sub,
      payload.email,
    );

    const newHashedRefresh = await this.hashValue(newRefreshToken);
    await this.usersService.addRefreshToken(payload.sub, newHashedRefresh);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ── 7. SIGN OUT ────────────────────────────────────────────────────────────
  // POST /api/v1/auth/signout
  async signout(dto: RefreshTokenDto) {
    let payload: { sub: string };

    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // Even if token invalid, treat as signed out
      return { message: 'Signed out' };
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) return { message: 'Signed out' };

    for (const hashed of user.refreshTokens) {
      const match = await this.compareValue(dto.refreshToken, hashed);
      if (match) {
        await this.usersService.removeRefreshToken(payload.sub, hashed);
        break;
      }
    }

    return { message: 'Signed out successfully' };
  }
}