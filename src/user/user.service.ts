import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from './user.schema';

const SET_PASSWORD_HOURS = 72;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly email: EmailService,
  ) {}

  // ── Finders ──────────────────────────────────────────────────────────────────

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  findByIdWithPassword(id: string) {
    return this.userModel.findById(id).select('+password').exec();
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
    data: { fullName?: string; phone?: string; bio?: string; image?: string },
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
    const hashedOtp = await bcrypt.hash(otpCode, 10);
    await this.userModel.findByIdAndUpdate(userId, { otpCode: hashedOtp, otpExpiresAt, otpAttempts: 0 });
  }

  async clearOtp(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    });
  }

  // ── Password ──────────────────────────────────────────────────────────────────

  /** Sets a new password and signs out every session; emails a security notice unless `notify` is false. */
  async updatePassword(userId: string, hashedPassword: string, notify = true) {
    const user = await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      mustChangePassword: false,
      setPasswordToken: null,
      refreshTokens: [], // Revoke all sessions on password change
    }, { new: true }).select('fullName email role').lean();
    if (user && notify) {
      void this.email.queue('account.password-changed', { email: user.email, name: user.fullName, userId: user._id }, {
        role: user.role, email: user.email,
        when: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'long', timeStyle: 'short' }),
      });
    }
  }

  /**
   * A one-time link to choose a password (72 hours). Issuing a new one
   * replaces any earlier link.
   */
  async issueSetPasswordLink(userId: string) {
    const token = randomBytes(24).toString('base64url');
    await this.userModel.updateOne({ _id: userId }, {
      $set: { setPasswordToken: createHash('sha256').update(token).digest('hex'), setPasswordExpires: new Date(Date.now() + SET_PASSWORD_HOURS * 3600_000) },
    });
    return { url: this.email.link(`/welcome/${token}`), expiresHours: SET_PASSWORD_HOURS };
  }

  /** Sends the welcome (or reset) email with a set-password link. Returns whether it was queued. */
  async emailSetPasswordLink(user: { _id: any; fullName: string; email: string; role: string }, kind: 'account.welcome' | 'account.reset') {
    const link = await this.issueSetPasswordLink(user._id.toString());
    const r = await this.email.queue(kind, { email: user.email, name: user.fullName, userId: user._id }, {
      role: user.role, email: user.email, setPasswordUrl: link.url, expiresHours: link.expiresHours, loginUrl: this.email.link('/signin'),
    });
    return r === 'queued';
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
    const target = await this.userModel.findById(userId).select('role').lean();
    if (!target) throw new NotFoundException('User not found.');
    // Deactivating an admin (including yourself) could lock everyone out (BUG-08).
    if (target.role === UserRole.ADMIN) {
      throw new BadRequestException('Admin accounts cannot be deactivated.');
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { isActive: false, refreshTokens: [] },
        { new: true },
      )
      .select('-password');
    if (!user) throw new NotFoundException('User not found.');
    void this.email.queue('account.blocked', { email: user.email, name: user.fullName, userId: user._id }, { role: user.role });
    return user;
  }

  async activateUser(userId: string) {
    const before = await this.userModel.findById(userId).select('isActive pendingApproval').lean();
    const user = await this.userModel
      .findByIdAndUpdate(userId, { isActive: true, pendingApproval: false }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found.');
    // A self-registered murabbi approved, or a paused account allowed back in.
    if (before?.pendingApproval || before?.isActive === false) {
      void this.email.queue(before.pendingApproval ? 'account.approved' : 'account.restored',
        { email: user.email, name: user.fullName, userId: user._id }, { role: user.role, loginUrl: this.email.link('/signin') });
    }
    return user;
  }

  async deleteMurabbi(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === UserRole.ADMIN) {
      throw new NotFoundException('Admin accounts cannot be deleted.');
    }
    await this.userModel.findByIdAndDelete(userId);
    // Deleting a registration that was never approved is a "no".
    if (user.pendingApproval) {
      void this.email.queue('account.declined', { email: user.email, name: user.fullName }, {});
    }
    return { message: 'Murabbi deleted successfully.' };
  }
}
