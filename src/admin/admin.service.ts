import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument, UserRole } from '../user/user.schema';
import { UsersService } from '../user/user.service';
import { CreateMurabbiDto } from './admin.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
  ) {}

  // ── Stats ─────────────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [total, active, inactive] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: false }),
    ]);
    return { totalMurabbis: total, activeMurabbis: active, inactiveMurabbis: inactive };
  }

  // ── List ──────────────────────────────────────────────────────────────────────

  getAllUsers() {
    return this.usersService.findAll();
  }

  getAllMurabbis() {
    return this.usersService.findAllMurabbis();
  }

  // ── Create Murabbi ────────────────────────────────────────────────────────────
  /**
   * Admin directly creates a Murabbi account.
   * - No OTP required (admin is trusted)
   * - isEmailVerified = true immediately
   * - Password is bcrypt-hashed
   */
  async createMurabbi(dto: CreateMurabbiDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) {
      throw new ConflictException('A user with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const murabbi = await this.userModel.create({
      fullName       : dto.fullName,
      email          : dto.email,
      password       : hashedPassword,
      role           : UserRole.MURABBI,
      isEmailVerified: true,   // no OTP flow needed
      isActive       : true,
    });

    this.logger.log(`Admin created murabbi → ${murabbi.email}`);
    return {
      message : 'Murabbi account created successfully.',
      murabbi : {
        id      : murabbi._id,
        fullName: murabbi.fullName,
        email   : murabbi.email,
        role    : murabbi.role,
      },
    };
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────────

  deactivateMurabbi(userId: string) {
    return this.usersService.deactivateUser(userId);
  }

  activateMurabbi(userId: string) {
    return this.usersService.activateUser(userId);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  deleteMurabbi(userId: string) {
    return this.usersService.deleteMurabbi(userId);
  }
}