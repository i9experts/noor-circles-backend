// auth.secvice.ts


import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from '../user/user.schema';
import { SignUpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import { AuthTokens, AuthUser } from './interface/auth.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) { }

  // ─────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────

  /**
   * Register a new user account.
   */
  async signup(dto: SignUpDto): Promise<{ message: string; user: AuthUser }> {
    const exists = await this.userModel.findOne({
      email: dto.email.toLowerCase().trim(),
    });

    if (exists) {
      throw new ConflictException('This email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = await this.userModel.create({
      fullName: dto.fullName.trim(),
      email: dto.email.toLowerCase().trim(),
      password: hashedPassword,
    });

    this.logger.log(`New user registered: ${user.email}`);

    return {
      message: 'Account created successfully!',
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Sign in an existing user and issue access + refresh tokens.
   */
  async signin(
    dto: SignInDto,
  ): Promise<{ message: string; accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase().trim(),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.storeRefreshToken(user._id.toString(), tokens.refreshToken);

    this.logger.log(`User signed in: ${user.email}`);

    return {
      message: 'Login successful!',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refreshTokens(
    userId: string,
    incomingRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.refreshTokens?.length) {
      throw new UnauthorizedException('Access denied. Please sign in again.');
    }

    // Find a matching hashed refresh token
    const matchIndex = await this.findMatchingTokenIndex(
      incomingRefreshToken,
      user.refreshTokens,
    );

    if (matchIndex === -1) {
      // Potential token reuse — revoke all sessions (security measure)
      await this.userModel.findByIdAndUpdate(userId, { refreshTokens: [] });
      this.logger.warn(`Refresh token reuse detected for user: ${user.email}`);
      throw new UnauthorizedException(
        'Suspicious activity detected. All sessions have been revoked.',
      );
    }

    // Rotate: remove old token, issue new pair
    user.refreshTokens.splice(matchIndex, 1);
    const tokens = await this.generateTokens(user._id.toString(), user.email);
    const hashedNew = await bcrypt.hash(tokens.refreshToken, this.BCRYPT_ROUNDS);
    user.refreshTokens.push(hashedNew);
    await user.save();

    return tokens;
  }

  /**
   * Revoke the provided refresh token (logout from current device).
   */
  async logout(userId: string, refreshToken: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const matchIndex = await this.findMatchingTokenIndex(
      refreshToken,
      user.refreshTokens,
    );

    if (matchIndex !== -1) {
      user.refreshTokens.splice(matchIndex, 1);
      await user.save();
    }

    this.logger.log(`User logged out: ${user.email}`);
    return { message: 'Logged out successfully.' };
  }

  /**
   * Logout from all devices by revoking all refresh tokens.
   */
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokens: [] });
    this.logger.log(`All sessions revoked for userId: ${userId}`);
    return { message: 'Logged out from all devices.' };
  }

  /**
   * Send a 6-digit OTP to the user's email if the account exists.
   * Always returns the same message to prevent email enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase().trim()
    });

    const genericMessage = 'Agar yeh email registered hai to OTP bhej diya.';
    if (!user) return { message: genericMessage };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresMinutes = this.config.get<number>('OTP_EXPIRES_MINUTES') || 10;
    const otpExpiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const hashedOtp = await bcrypt.hash(otp, 12);
    await this.userModel.findByIdAndUpdate(user._id, {
      otpCode: hashedOtp,
      otpExpiresAt,
    });

    await this.mailService.sendOtp(user.email, otp);

    // ✅ Development mein OTP response mein bhi do
    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      message: genericMessage,
      ...(isDev && { otp }),  // production mein yeh nahi aayega
    };
  }

  /**
   * Verify OTP and return a short-lived reset token.
   * Email is passed via a custom header (x-reset-email) — not in the body.
   */
  // ✅ UPDATED - email alag parameter nahi, dto se lo
  async verifyOtp(dto: VerifyOtpDto) {
    console.log('=== VERIFY OTP DEBUG ===');

    // 🧼 Step 1: Validate input
    const email = dto.email?.toLowerCase().trim();
    const otp = dto.otp?.trim();

    console.log('Email received:', email);
    console.log('OTP received:', otp);

    if (!email || !otp) {
      throw new BadRequestException('Email aur OTP dono required hain');
    }

    // 🔍 Step 2: Find user
    const user = await this.userModel.findOne({ email });

    console.log('User found:', user ? 'YES' : 'NO');

    if (!user) {
      throw new BadRequestException('User nahi mila');
    }

    // 📦 Step 3: Check OTP existence
    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('OTP invalid hai ya request nahi kiya gaya');
    }

    console.log('OTP in DB:', user.otpCode);
    console.log('OTP expiry:', user.otpExpiresAt);
    console.log('Current time:', new Date());

    // ⏰ Step 4: Check expiry
    if (new Date() > user.otpExpiresAt) {
      console.log('OTP EXPIRED ❌');

      await this.userModel.findByIdAndUpdate(user._id, {
        otpCode: null,
        otpExpiresAt: null,
      });

      throw new BadRequestException('OTP expire ho gaya — dobara request karo');
    }

    // 🔐 Step 5: Compare OTP
    console.log('Comparing OTP...');
    const isMatch = await bcrypt.compare(otp, user.otpCode);

    console.log('OTP match:', isMatch ? 'YES ✅' : 'NO ❌');

    if (!isMatch) {
      throw new BadRequestException('Galat OTP hai');
    }

    // 🧹 Step 6: Clear OTP after success
    await this.userModel.findByIdAndUpdate(user._id, {
      otpCode: null,
      otpExpiresAt: null,
    });

    // 🎟️ Step 7: Generate reset token
    const resetToken = this.jwtService.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        purpose: 'reset',
      },
      {
        secret: this.config.get<string>('JWT_RESET_SECRET')!,
        expiresIn: (this.config.get('JWT_RESET_EXPIRES_IN') || '10m') as any, // ✅
      },
    );
    console.log('Reset token created ✅');
    console.log('=== END DEBUG ===');

    return {
      message: 'OTP verify ho gaya!',
      resetToken,
    };
  }
  /**
   * Reset user password using a valid reset token.
   * Reset token is passed via Authorization header as: Bearer <token>
   */
  async resetPassword(
    resetToken: string,
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    if (!resetToken) {
      throw new BadRequestException('Reset token is missing.');
    }

    let payload: { sub: string; purpose: string; email: string };

    try {
      payload = this.jwtService.verify(resetToken, {
        secret: this.config.get<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException('Reset token is invalid or has expired.');
    }

    if (payload.purpose !== 'reset') {
      throw new BadRequestException('Invalid token type.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.BCRYPT_ROUNDS);

    await this.userModel.findByIdAndUpdate(payload.sub, {
      password: hashedPassword,
      refreshTokens: [], // Revoke all active sessions on password change
    });

    this.logger.log(`Password reset successful for: ${payload.email}`);
    return {
      message: 'Password updated successfully. Please sign in with your new password.',
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const payload = { sub: userId, email };

    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    const refreshExpiresIn = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const hashed = await bcrypt.hash(refreshToken, this.BCRYPT_ROUNDS);
    await this.userModel.findByIdAndUpdate(userId, {
      $push: { refreshTokens: hashed },
    });
  }

  /**
   * Returns the index of the matching hashed refresh token, or -1.
   */
  private async findMatchingTokenIndex(
    plainToken: string,
    hashedTokens: string[],
  ): Promise<number> {
    const results = await Promise.all(
      hashedTokens.map((hash) => bcrypt.compare(plainToken, hash)),
    );
    return results.findIndex((match) => match === true);
  }

  private async clearOtp(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpiresAt: null,
    });
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private sanitizeUser(user: UserDocument): AuthUser {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
    };
  }

  // ── RESEND OTP ─────────────────────────────────────────────────
  async resendOtp(email: string) {
    const user = await this.userModel.findOne({
      email: email.toLowerCase().trim()
    });

    // Same generic message — security ke liye
    const genericMessage = 'OTP dobara bhej diya.';
    if (!user) return { message: genericMessage };

    // Naya OTP banao
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresMinutes = this.config.get<number>('OTP_EXPIRES_MINUTES') || 10;
    const otpExpiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Hash karke save karo
    const hashedOtp = await bcrypt.hash(otp, 12);
    await this.userModel.findByIdAndUpdate(user._id, {
      otpCode: hashedOtp,
      otpExpiresAt,
    });

    // Email bhejo
    await this.mailService.sendOtp(user.email, otp);

    return { message: genericMessage };
  }
}