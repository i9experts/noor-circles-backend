import {
  BadRequestException,
  ConflictException,
  Injectable,
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

import { MailService } from '../mail/mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private mailService: MailService,
  ) {}

  // ── Signup ─────────────────────────────────────
  async signup(dto: SignUpDto) {
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email,
      password: hashedPassword,
    });

    return {
      message: 'Account created!',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  // ── Signin ─────────────────────────────────────
  async signin(dto: SignInDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user)
      throw new UnauthorizedException('Email ya password galat hai');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new UnauthorizedException('Email ya password galat hai');

    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
    );

    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 12);

    await this.userModel.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: hashedRefresh },
    });

    return {
      message: 'Login successful!',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  // ── Generate Tokens ────────────────────────────
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    });

    return { accessToken, refreshToken };
  }

  // ── Forgot Password ────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({ email: dto.email });

    const message =
      'Agar email registered hai to OTP bhej diya gaya hai';

    if (!user) return { message };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresMinutes =
      this.config.get<number>('OTP_EXPIRES_MINUTES') || 10;

    const otpExpiresAt = new Date(
      Date.now() + expiresMinutes * 60 * 1000,
    );

    const hashedOtp = await bcrypt.hash(otp, 12);

    await this.userModel.findByIdAndUpdate(user._id, {
      otpCode: hashedOtp,
      otpExpiresAt,
    });

    await this.mailService.sendOtp(user.email, otp);

    return { message };
  }

  // ── Verify OTP ────────────────────────────────
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userModel.findOne({ email: dto.email });

    if (!user || !user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('OTP invalid ya expire ho gaya');
    }

    if (new Date() > user.otpExpiresAt) {
      await this.userModel.findByIdAndUpdate(user._id, {
        otpCode: null,
        otpExpiresAt: null,
      });
      throw new BadRequestException('OTP expire ho gaya');
    }

    const isValid = await bcrypt.compare(dto.otp, user.otpCode);
    if (!isValid) throw new BadRequestException('Galat OTP');

    await this.userModel.findByIdAndUpdate(user._id, {
      otpCode: null,
      otpExpiresAt: null,
    });

    const resetToken = this.jwtService.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        purpose: 'reset',
      },
      {
        secret: this.config.get('JWT_RESET_SECRET'),
        expiresIn: this.config.get('JWT_RESET_EXPIRES_IN'),
      },
    );

    return {
      message: 'OTP verified!',
      resetToken,
    };
  }

  // ── Reset Password ────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    let payload: any;

    try {
      payload = this.jwtService.verify(dto.resetToken, {
        secret: this.config.get('JWT_RESET_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }

    if (payload.purpose !== 'reset') {
      throw new BadRequestException('Invalid token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.userModel.findByIdAndUpdate(payload.sub, {
      password: hashedPassword,
      refreshTokens: [],
    });

    return {
      message: 'Password reset successful!',
    };
  }
}