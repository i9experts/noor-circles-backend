import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomInt } from "crypto";
import { User, UserDocument } from "../users/schemas/user.schema";
import { SignupDto } from "./dto/signup.dto";
import { SigninDto } from "./dto/signin.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  private hashText(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private async signTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: "15m",
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: "7d",
    });
    return { accessToken, refreshToken };
  }

  async signup(dto: SignupDto) {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) throw new BadRequestException("Email already exists");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
    });

    const tokens = await this.signTokens(user.id, user.email);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    await user.save();

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email },
      ...tokens,
    };
  }

  async signin(dto: SigninDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    const tokens = await this.signTokens(user.id, user.email);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    await user.save();

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email },
      ...tokens,
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException();

    const tokens = await this.signTokens(user.id, user.email);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    await user.save();

    return tokens;
  }

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash: null });
    return { message: "Logged out" };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({ email: dto.email });

    // Generic response for security
    if (!user) return { message: "If email exists, OTP sent" };

    const otp = String(randomInt(100000, 999999));
    user.resetOtpHash = this.hashText(otp);
    user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.resetOtpAttempts = 0;
    await user.save();

    // TODO: send email via mailer service
    console.log("OTP for testing:", otp);

    return { message: "If email exists, OTP sent" };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
      throw new BadRequestException("Invalid OTP");
    }

    if (user.resetOtpAttempts >= 5) {
      throw new BadRequestException("Too many attempts");
    }

    if (user.resetOtpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException("OTP expired");
    }

    const otpHash = this.hashText(dto.otp);
    if (otpHash !== user.resetOtpHash) {
      user.resetOtpAttempts += 1;
      await user.save();
      throw new BadRequestException("Invalid OTP");
    }

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, type: "reset" },
      { secret: process.env.JWT_RESET_SECRET, expiresIn: "15m" },
    );

    user.resetOtpHash = undefined;
    user.resetOtpExpiresAt = undefined;
    user.resetOtpAttempts = 0;
    await user.save();

    return { resetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken, {
        secret: process.env.JWT_RESET_SECRET,
      });
    } catch {
      throw new BadRequestException("Invalid or expired reset token");
    }

    if (payload.type !== "reset") throw new BadRequestException("Invalid token");

    const user = await this.userModel.findById(payload.sub);
    if (!user) throw new BadRequestException("User not found");

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.refreshTokenHash = undefined; // force re-login on all devices
    await user.save();

    return { message: "Password updated successfully" };
  }
}