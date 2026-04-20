import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
// import { AuthDto } from '../auth/dto/auth.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Find helpers ────────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  // ── Get Profile ─────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).select('-password').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // ── Update User Data ────────────────────────────────────────────────────────

  async updateUserData(userId: string, updateUserDto: any): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateUserDto },
      { new: true, runValidators: true }
    ).select('-password').exec();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: {
    fullName: string;
    email: string;
    password: string; // already hashed
  }): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  // ── OTP ────────────────────────────────────────────────────────────────────

  async setOtp(
    userId: string,
    otpCode: string,
    otpExpiresAt: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { otpCode, otpExpiresAt });
  }

  async clearOtp(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpiresAt: null,
    });
  }

  // ── Password ───────────────────────────────────────────────────────────────

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });
  }

  // ── Refresh tokens ─────────────────────────────────────────────────────────

  async addRefreshToken(userId: string, hashedToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $push: { refreshTokens: hashedToken },
    });
  }

  async removeRefreshToken(userId: string, hashedToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: hashedToken },
    });
  }

  async clearAllRefreshTokens(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokens: [] });
  }
}