import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from '../user/user.schema';
import { UsersService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import {
  SignupRequestOtpDto,
  SignupVerifyOtpDto,
  SignInDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { AuthTokens, AuthUser } from './interface/auth.interface';

const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // SIGNUP  (2 steps)
  // ═══════════════════════════════════════════════════════════════

  async signupRequestOtp(dto: SignupRequestOtpDto) {
    const verified = await this.userModel.findOne({
      email: dto.email,
      isEmailVerified: true,
    });
    if (verified) {
      throw new ConflictException('This email is already registered.');
    }

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const hashedPwd = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.userModel.findOneAndUpdate(
      { email: dto.email, isEmailVerified: false },
      {
        fullName       : dto.fullName,
        email          : dto.email,
        password       : hashedPwd,
        isEmailVerified: false,
        otpCode        : otp,
        otpExpiresAt,
        pendingSignup  : { fullName: dto.fullName, password: hashedPwd },
      },
      { upsert: true, new: true },
    );

    await this.mailService.sendOtp(dto.email, otp, 'signup');
    this.logger.log(`Signup OTP sent → ${dto.email}`);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      message: 'OTP sent to your email. It is valid for 2 minutes.',
      ...(isDev && { otp }),
    };
  }

  async signupVerifyOtp(dto: SignupVerifyOtpDto) {
    const user = await this.userModel
      .findOne({ email: dto.email, isEmailVerified: false })
      .select('+otpCode +otpExpiresAt +password');

    if (!user) {
      throw new BadRequestException(
        'No pending signup found for this email. Please start over.',
      );
    }
    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('OTP not found. Please request a new one.');
    }
    if (new Date() > user.otpExpiresAt) {
      await this.usersService.clearOtp(user._id.toString());
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }
    if (dto.otp !== user.otpCode) {
      throw new BadRequestException('Incorrect OTP. Please try again.');
    }

    user.isEmailVerified = true;
    user.otpCode         = null;
    user.otpExpiresAt    = null;
    user.pendingSignup   = null;
    await user.save();

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.usersService.addRefreshToken(
      user._id.toString(),
      await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS),
    );

    this.logger.log(`Account created → ${user.email}`);
    return {
      message: 'Account created successfully!',
      accessToken : tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitize(user),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SIGN IN
  // ═══════════════════════════════════════════════════════════════

  async signin(dto: SignInDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+password +refreshTokens');

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please complete the OTP verification step.',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact the admin.',
      );
    }

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.usersService.addRefreshToken(
      user._id.toString(),
      await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS),
    );

    this.logger.log(`Signed in → ${user.email} [${user.role}]`);
    return {
      message     : 'Signed in successfully!',
      accessToken : tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user        : this.sanitize(user),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ═══════════════════════════════════════════════════════════════

  async forgotPassword(dto: ForgotPasswordDto) {
    const GENERIC = 'If this email is registered, an OTP has been sent.';

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isEmailVerified) return { message: GENERIC };

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.usersService.setOtp(user._id.toString(), otp, otpExpiresAt);
    await this.mailService.sendOtp(user.email, otp, 'reset');

    this.logger.log(`Reset OTP sent → ${user.email}`);
    const isDev = this.config.get('NODE_ENV') !== 'production';
    return { message: GENERIC, ...(isDev && { otp }) };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+otpCode +otpExpiresAt');

    if (!user?.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }
    if (new Date() > user.otpExpiresAt) {
      await this.usersService.clearOtp(user._id.toString());
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }
    if (dto.otp !== user.otpCode) {
      throw new BadRequestException('Incorrect OTP. Please try again.');
    }

    await this.usersService.clearOtp(user._id.toString());

    const resetToken = this.jwtService.sign(
      { sub: user._id.toString(), email: user.email, purpose: 'reset' },
      {
        secret    : this.config.getOrThrow<string>('JWT_RESET_SECRET'),
        expiresIn : this.config.get('JWT_RESET_EXPIRES_IN') || '10m',
      },
    );

    return { message: 'OTP verified successfully!', resetToken };
  }

  async resetPassword(resetToken: string, dto: ResetPasswordDto) {
    if (!resetToken) throw new BadRequestException('Reset token is missing.');

    let payload: { sub: string; purpose: string; email: string };
    try {
      payload = this.jwtService.verify(resetToken, {
        secret: this.config.getOrThrow<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException('Reset token is invalid or has expired.');
    }

    if (payload.purpose !== 'reset') {
      throw new BadRequestException('Invalid token type.');
    }

    await this.usersService.updatePassword(
      payload.sub,
      await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
    );

    this.logger.log(`Password reset → ${payload.email}`);
    return {
      message: 'Password updated successfully. Please sign in with your new password.',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RESEND OTP
  // ═══════════════════════════════════════════════════════════════

  async resendOtp(email: string, type: 'signup' | 'reset') {
    const GENERIC = 'A new OTP has been sent if the email is valid.';

    let user: UserDocument | null;
    if (type === 'signup') {
      user = await this.userModel.findOne({ email, isEmailVerified: false });
    } else {
      user = await this.usersService.findByEmail(email);
    }
    if (!user) return { message: GENERIC };

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.usersService.setOtp(user._id.toString(), otp, otpExpiresAt);
    await this.mailService.sendOtp(user.email, otp, type);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return { message: GENERIC, ...(isDev && { otp }) };
  }

  // ═══════════════════════════════════════════════════════════════
  // TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async refreshTokens(userId: string, incomingRefreshToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokens');

    if (!user?.refreshTokens?.length) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const idx = await this.findTokenIndex(incomingRefreshToken, user.refreshTokens);
    if (idx === -1) {
      await this.usersService.clearAllRefreshTokens(userId);
      this.logger.warn(`Token reuse detected → ${user.email}`);
      throw new UnauthorizedException(
        'Suspicious activity detected. All sessions have been revoked. Please sign in again.',
      );
    }

    user.refreshTokens.splice(idx, 1);
    const tokens = await this.generateTokens(userId, user.email);
    user.refreshTokens.push(await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS));
    await user.save();

    return {
      message     : 'Tokens refreshed successfully.',
      accessToken : tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokens');
    if (!user) throw new UnauthorizedException('User not found.');

    const idx = await this.findTokenIndex(refreshToken, user.refreshTokens);
    if (idx !== -1) {
      user.refreshTokens.splice(idx, 1);
      await user.save();
    }

    return { message: 'Logged out successfully.' };
  }

  async logoutAll(userId: string) {
    await this.usersService.clearAllRefreshTokens(userId);
    return { message: 'Logged out from all devices successfully.' };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret   : this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret   : this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private async findTokenIndex(plain: string, hashed: string[]): Promise<number> {
    const results = await Promise.all(hashed.map((h) => bcrypt.compare(plain, h)));
    return results.findIndex(Boolean);
  }

  private makeOtp(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }

  private sanitize(user: UserDocument): AuthUser {
    return {
      id      : user._id.toString(),
      fullName: user.fullName,
      email   : user.email,
      role    : user.role,
    };
  }
}
