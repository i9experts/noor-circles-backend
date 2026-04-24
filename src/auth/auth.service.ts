import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import { SignupRequestOtpDto, SignupVerifyOtpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { ForgotPasswordDto, VerifyOtpDto, ResetPasswordDto } from './dto/other.dto';
import { AuthTokens, AuthUser } from './interface/auth.interface';
import { UserDocument } from '../user/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../user/user.schema';
import { Model } from 'mongoose';

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

  // ── SIGNUP: Step 1 — OTP Request ────────────────────────────────────────────

  async signupRequestOtp(dto: SignupRequestOtpDto) {
    // Check: kya email pehle se registered hai?
    const existingVerified = await this.userModel.findOne({
      email: dto.email,
      isEmailVerified: true,
    });
    if (existingVerified) {
      throw new ConflictException('This email is already registered.');
    }

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Agar pehle se pending record hai to update karo, warna naya banao
    await this.userModel.findOneAndUpdate(
      { email: dto.email, isEmailVerified: false },
      {
        email: dto.email,
        fullName: dto.fullName,
        // Placeholder password (asli pendingSignup mein store hai)
        password: hashedPassword,
        isEmailVerified: false,
        otpCode: hashedOtp,
        otpExpiresAt,
        pendingSignup: {
          fullName: dto.fullName,
          password: hashedPassword,
        },
      },
      { upsert: true, new: true },
    );

    await this.mailService.sendOtp(dto.email, otp, 'signup');

    this.logger.log(`Signup OTP sent: ${dto.email}`);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      message: 'OTP sent to your email. Valid for 2 minutes.',
      ...(isDev && { otp }), // Postman testing ke liye
    };
  }

  // ── SIGNUP: Step 2 — OTP Verify → Account Create ────────────────────────────

  async signupVerifyOtp(dto: SignupVerifyOtpDto) {
    const user = await this.userModel
      .findOne({ email: dto.email, isEmailVerified: false })
      .select('+otpCode +otpExpiresAt +pendingSignup +password');

    if (!user) {
      throw new BadRequestException('No pending signup found. Please start over.');
    }

    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('OTP not found. Please request a new one.');
    }

    if (new Date() > user.otpExpiresAt) {
      await this.usersService.clearOtp(user._id.toString());
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    if (!(await bcrypt.compare(dto.otp, user.otpCode))) {
      throw new BadRequestException('Incorrect OTP.');
    }

    // ✅ OTP sahi hai — account activate karo
    user.isEmailVerified = true;
    user.otpCode = null;
    user.otpExpiresAt = null;
    user.pendingSignup = null;
    await user.save();

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    const hashed = await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS);
    await this.usersService.addRefreshToken(user._id.toString(), hashed);

    this.logger.log(`New account verified & created: ${user.email}`);

    return {
      message: 'Account created successfully!',
      ...tokens,
      user: this.sanitize(user),
    };
  }

  // ── SIGNIN ───────────────────────────────────────────────────────────────────

  async signin(dto: SignInDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+password +refreshTokens');

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before signing in.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated.');
    }

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    const hashed = await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS);
    await this.usersService.addRefreshToken(user._id.toString(), hashed);

    this.logger.log(`User signed in: ${user.email}`);

    return {
      message: 'Login successful!',
      ...tokens,
      user: this.sanitize(user),
    };
  }

  // ── FORGOT PASSWORD: OTP Request ─────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    // Always same message — email enumeration se bachao
    const genericMsg = 'If this email is registered, an OTP has been sent.';

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isEmailVerified) return { message: genericMsg };

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.usersService.setOtp(
      user._id.toString(),
      await bcrypt.hash(otp, BCRYPT_ROUNDS),
      otpExpiresAt,
    );

    await this.mailService.sendOtp(user.email, otp, 'reset');

    this.logger.log(`Password reset OTP sent: ${user.email}`);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      message: genericMsg,
      ...(isDev && { otp }), // Postman testing ke liye
    };
  }

  // ── FORGOT PASSWORD: OTP Verify → Reset Token ────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+otpCode +otpExpiresAt');

    if (!user?.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No OTP found. Please request again.');
    }

    if (new Date() > user.otpExpiresAt) {
      await this.usersService.clearOtp(user._id.toString());
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    if (!(await bcrypt.compare(dto.otp, user.otpCode))) {
      throw new BadRequestException('Incorrect OTP.');
    }

    await this.usersService.clearOtp(user._id.toString());

    const resetToken = this.jwtService.sign(
      { sub: user._id.toString(), email: user.email, purpose: 'reset' },
      {
        secret: this.config.getOrThrow<string>('JWT_RESET_SECRET'),
        expiresIn: (this.config.get('JWT_RESET_EXPIRES_IN') || '10m') as any,
      },
    );

    return { message: 'OTP verified!', resetToken };
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────────

  async resetPassword(resetToken: string, dto: ResetPasswordDto) {
    if (!resetToken) throw new BadRequestException('Reset token missing.');

    let payload: { sub: string; purpose: string; email: string };
    try {
      payload = this.jwtService.verify(resetToken, {
        secret: this.config.getOrThrow<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException('Reset token is invalid or expired.');
    }

    if (payload.purpose !== 'reset') throw new BadRequestException('Invalid token type.');

    await this.usersService.updatePassword(
      payload.sub,
      await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
    );

    this.logger.log(`Password reset: ${payload.email}`);
    return { message: 'Password updated. Please sign in.' };
  }

  // ── RESEND OTP ────────────────────────────────────────────────────────────────

  async resendOtp(email: string, type: 'signup' | 'reset') {
    const genericMsg = 'OTP resent if email is valid.';

    let user: UserDocument | null;

    if (type === 'signup') {
      user = await this.userModel
        .findOne({ email, isEmailVerified: false })
        .select('+otpCode +otpExpiresAt');
    } else {
      user = await this.usersService.findByEmail(email);
    }

    if (!user) return { message: genericMsg };

    const otp = this.makeOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.usersService.setOtp(
      user._id.toString(),
      await bcrypt.hash(otp, BCRYPT_ROUNDS),
      otpExpiresAt,
    );

    await this.mailService.sendOtp(user.email, otp, type);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      message: genericMsg,
      ...(isDev && { otp }), // Postman testing ke liye
    };
  }

  // ── REFRESH TOKENS ────────────────────────────────────────────────────────────

  async refreshTokens(userId: string, incomingToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokens');

    if (!user?.refreshTokens?.length) {
      throw new UnauthorizedException('Please sign in again.');
    }

    const idx = await this.findTokenIndex(incomingToken, user.refreshTokens);

    if (idx === -1) {
      await this.usersService.clearAllRefreshTokens(userId);
      this.logger.warn(`Token reuse detected: ${user.email}`);
      throw new UnauthorizedException('Suspicious activity. All sessions revoked.');
    }

    user.refreshTokens.splice(idx, 1);
    const tokens = await this.generateTokens(userId, user.email);
    user.refreshTokens.push(await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS));
    await user.save();

    return tokens;
  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────────

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
    return { message: 'Logged out from all devices.' };
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────────

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
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
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }
}