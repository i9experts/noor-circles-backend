import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Finders ──────────────────────────────────────────────────────────────────

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  // ── Profile ───────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .exec();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string },
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: data },
        { new: true, runValidators: true },
      )
      .select('-password')
      .exec();
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  // ── OTP ───────────────────────────────────────────────────────────────────────

  async setOtp(userId: string, otpCode: string, otpExpiresAt: Date) {
    await this.userModel.findByIdAndUpdate(userId, { otpCode, otpExpiresAt });
  }

  async clearOtp(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpiresAt: null,
    });
  }

  // ── Password ──────────────────────────────────────────────────────────────────

  async updatePassword(userId: string, hashedPassword: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      refreshTokens: [], // Revoke all sessions on password change
    });
  }

  // ── Refresh Tokens ────────────────────────────────────────────────────────────

  async addRefreshToken(userId: string, hashedToken: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      $push: { refreshTokens: hashedToken },
    });
  }

  async clearAllRefreshTokens(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokens: [] });
  }

  // ── Admin Helpers ─────────────────────────────────────────────────────────────

  async findAll(role?: UserRole) {
    const filter: Record<string, unknown> = { isEmailVerified: true };
    if (role) filter.role = role;
    return this.userModel
      .find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAllMurabbis() {
    return this.userModel
      .find({ role: UserRole.MURABBI, isEmailVerified: true })
      .select('-password')
      .sort({ createdAt: -1 })
      .exec();
  }

  async deactivateUser(userId: string) {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { isActive: false, refreshTokens: [] },
        { new: true },
      )
      .select('-password');
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async activateUser(userId: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { isActive: true }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async deleteMurabbi(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === UserRole.ADMIN) {
      throw new NotFoundException('Admin accounts cannot be deleted.');
    }
    await this.userModel.findByIdAndDelete(userId);
    return { message: 'Murabbi deleted successfully.' };
  }
}
