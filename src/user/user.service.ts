import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Finders ─────────────────────────────────────────────────────────────────

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  /** Sensitive fields ke sath — auth service ke liye */
  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password +refreshTokens +otpCode +otpExpiresAt +pendingSignup')
      .exec();
  }

  findByIdWithSecrets(id: string) {
    return this.userModel
      .findById(id)
      .select('+refreshTokens +otpCode +otpExpiresAt')
      .exec();
  }

  // ── Profile ──────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).select('-password').exec();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async updateUserData(userId: string, data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: data }, { new: true, runValidators: true })
      .select('-password')
      .exec();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  async create(data: { fullName: string; email: string; password: string }): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  // ── OTP ──────────────────────────────────────────────────────────────────────

  async setOtp(userId: string, otpCode: string, otpExpiresAt: Date) {
    await this.userModel.findByIdAndUpdate(userId, { otpCode, otpExpiresAt });
  }

  async clearOtp(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpiresAt: null,
    });
  }

  // ── Password ─────────────────────────────────────────────────────────────────

  async updatePassword(userId: string, hashedPassword: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      refreshTokens: [],
    });
  }

  // ── Refresh Tokens ───────────────────────────────────────────────────────────

  async addRefreshToken(userId: string, hashedToken: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      $push: { refreshTokens: hashedToken },
    });
  }

  async clearAllRefreshTokens(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokens: [] });
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async findAll() {
    return this.userModel.find({ isEmailVerified: true }).select('-password').exec();
  }

  async deactivateUser(userId: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { isActive: false }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}