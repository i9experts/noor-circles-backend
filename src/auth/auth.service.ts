import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';

import { User, UserDocument } from '../user/user.schema';
import { UsersService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import {
  SignupRequestOtpDto,
  SignupVerifyOtpDto,
  SignInDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  SetPasswordDto,
} from './dto/auth.dto';
import { AuthTokens, AuthUser } from './interface/auth.interface';

const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
/** Wrong OTP guesses allowed before the code is thrown away (BUG-04). */
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly notifService: NotificationService,
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
    const hashedOtp = await bcrypt.hash(otp, 10);

    await this.userModel.findOneAndUpdate(
      { email: dto.email, isEmailVerified: false },
      {
        fullName       : dto.fullName,
        email          : dto.email,
        password       : hashedPwd,
        isEmailVerified: false,
        otpCode        : hashedOtp,
        otpExpiresAt,
        otpAttempts    : 0,
        pendingSignup  : { fullName: dto.fullName, password: hashedPwd },
      },
      { upsert: true, new: true },
    );

    try {
      await this.mailService.sendOtp(dto.email, otp, 'signup');
    } catch (err) {
      this.logger.error(`Signup OTP email to ${dto.email} failed: ${(err as Error)?.message ?? err}`);
      throw new ServiceUnavailableException('We could not send the verification email right now. Please try again in a few minutes.');
    }
    this.logger.log(`Signup OTP sent → ${dto.email}`);

    return {
      message: 'OTP sent to your email. It is valid for 2 minutes.',
      ...(this.exposeOtp() && { otp }),
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
    await this.checkOtp(user, dto.otp);

    // Self-registered accounts start inactive and wait for an admin to
    // approve them (PATCH /admin/murabbis/:id/activate). Previously they were
    // active murabbis immediately, so anyone on the internet could sign up and
    // read murabbi-scoped data. No tokens are issued until approval.
    user.isEmailVerified = true;
    user.isActive        = false;
    user.pendingApproval = true;
    user.otpCode         = null;
    user.otpExpiresAt    = null;
    user.pendingSignup   = null;
    await user.save();

    this.notifService.createForAdmins({
      sender : user._id.toString(),
      type   : NotificationType.MURABBI_ACTION,
      title  : 'New Sign-up Awaiting Approval',
      message: `${user.fullName} (${user.email}) signed up and is waiting for approval. Activate them from the Murabbis page.`,
      payload: { userId: user._id.toString(), fullName: user.fullName, email: user.email },
    }).catch(() => {});

    this.logger.log(`Account created (pending approval) → ${user.email}`);
    return {
      message: 'Email verified! Your account is awaiting admin approval — you can sign in once it is approved.',
      pendingApproval: true,
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
    if (user.pendingApproval) {
      throw new UnauthorizedException(
        'Your account is awaiting admin approval. You will be able to sign in once it is approved.',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact the admin.',
      );
    }

    const tokens = await this.generateTokens(user._id.toString(), user.email, user.role);
    await this.usersService.addRefreshToken(
      user._id.toString(),
      this.hashToken(tokens.refreshToken),
    );
    await this.userModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

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
    await this.sendOtpQuietly(user.email, otp, 'reset');

    this.logger.log(`Reset OTP sent → ${user.email}`);
    return { message: GENERIC, ...(this.exposeOtp() && { otp }) };
  }

  /**
   * For flows that answer the same whether or not the account exists: a mail
   * failure must not turn into a 500 only for real accounts, which would
   * reveal who is registered. The failure is logged for the team instead.
   */
  private async sendOtpQuietly(email: string, otp: string, type: 'signup' | 'reset') {
    try {
      await this.mailService.sendOtp(email, otp, type);
    } catch (err) {
      this.logger.error(`OTP email (${type}) to ${email} failed: ${(err as Error)?.message ?? err}`);
    }
  }

  /** Compares an OTP, counting wrong guesses and discarding the code after too many. */
  private async checkOtp(user: UserDocument, otp: string) {
    if (await bcrypt.compare(String(otp), user.otpCode as string)) return;
    const updated = await this.userModel.findOneAndUpdate(
      { _id: user._id },
      { $inc: { otpAttempts: 1 } },
      { new: true, projection: { otpAttempts: 1 } },
    ).lean();
    if ((updated?.otpAttempts ?? MAX_OTP_ATTEMPTS) >= MAX_OTP_ATTEMPTS) {
      await this.usersService.clearOtp(user._id.toString());
      throw new BadRequestException('Too many incorrect attempts. Please request a new OTP.');
    }
    throw new BadRequestException('Incorrect OTP. Please try again.');
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
    await this.checkOtp(user, dto.otp);

    // Only the newest reset token works, and only once (BUG-03).
    const jti = randomUUID();
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { otpCode: null, otpExpiresAt: null, otpAttempts: 0, resetTokenId: jti } },
    );

    const resetToken = this.jwtService.sign(
      { sub: user._id.toString(), email: user.email, purpose: 'reset', jti },
      {
        secret    : this.config.getOrThrow<string>('JWT_RESET_SECRET'),
        expiresIn : this.config.get('JWT_RESET_EXPIRES_IN') || '10m',
      },
    );

    return { message: 'OTP verified successfully!', resetToken };
  }

  // ═══════════════════════════════════════════════════════════════
  // SET PASSWORD (from the link in a welcome / reset email)
  // ═══════════════════════════════════════════════════════════════

  private async userForSetPasswordToken(token: string) {
    const hash = createHash('sha256').update(String(token ?? '')).digest('hex');
    const user = await this.userModel.findOne({ setPasswordToken: hash, setPasswordExpires: { $gt: new Date() } })
      .select('+refreshTokens');
    if (!user) throw new BadRequestException('This link has expired or was already used. Ask the Noor Circles team for a new one.');
    return user;
  }

  /** Who the link is for (shown on the "choose your password" page). */
  async setPasswordInfo(token: string) {
    const user = await this.userForSetPasswordToken(token);
    return { fullName: user.fullName, email: user.email, role: user.role };
  }

  /** Sets the password and signs the person straight in. */
  async setPasswordWithToken(dto: SetPasswordDto) {
    const user = await this.userForSetPasswordToken(dto.token);
    if (!user.isActive) throw new UnauthorizedException('Your account has been deactivated. Please contact the admin.');
    if (user.pendingApproval) throw new UnauthorizedException('Your account is awaiting admin approval. You will be able to sign in once it is approved.');
    await this.usersService.updatePassword(user._id.toString(), await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), false);
    await this.userModel.updateOne({ _id: user._id }, { $set: { isEmailVerified: true, setPasswordExpires: null } });
    const fresh = await this.userModel.findById(user._id);
    const tokens = await this.generateTokens(user._id.toString(), user.email, user.role);
    await this.usersService.addRefreshToken(user._id.toString(), this.hashToken(tokens.refreshToken));
    await this.userModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    this.logger.log(`Password set from link → ${user.email}`);
    return { message: 'Password saved. Welcome to Noor Circles!', ...tokens, user: this.sanitize(fresh!) };
  }

  async resetPassword(resetToken: string, dto: ResetPasswordDto) {
    if (!resetToken) throw new BadRequestException('Reset token is missing.');

    let payload: { sub: string; purpose: string; email: string; jti?: string };
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

    // Atomically consume the token so it can't be replayed.
    const consumed = payload.jti && Types.ObjectId.isValid(payload.sub)
      ? await this.userModel.updateOne(
          { _id: new Types.ObjectId(payload.sub), resetTokenId: payload.jti },
          { $set: { resetTokenId: null } },
        )
      : null;
    if (!consumed?.modifiedCount) {
      throw new BadRequestException('This reset link has already been used. Please request a new one.');
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
    await this.sendOtpQuietly(user.email, otp, type);

    return { message: GENERIC, ...(this.exposeOtp() && { otp }) };
  }

  // ═══════════════════════════════════════════════════════════════
  // TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async refreshTokens(userId: string, incomingRefreshToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokens');

    if (!user?.refreshTokens?.length) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated. Please contact the admin.');
    }

    const idx = this.findTokenIndex(incomingRefreshToken, user.refreshTokens);
    if (idx === -1) {
      await this.usersService.clearAllRefreshTokens(userId);
      this.logger.warn(`Token reuse detected → ${user.email}`);
      throw new UnauthorizedException(
        'Suspicious activity detected. All sessions have been revoked. Please sign in again.',
      );
    }

    user.refreshTokens.splice(idx, 1);
    const tokens = await this.generateTokens(userId, user.email, user.role);
    user.refreshTokens.push(this.hashToken(tokens.refreshToken));
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

    const idx = this.findTokenIndex(refreshToken, user.refreshTokens);
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

  private async generateTokens(userId: string, email: string, role?: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role: role ?? 'murabbi' },
        {
          secret   : this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
          jwtid    : randomUUID(),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role: role ?? 'murabbi' },
        {
          secret   : this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
          jwtid    : randomUUID(),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * Refresh tokens are stored as SHA-256 digests. They used to be bcrypt
   * hashes, but bcrypt only reads the first 72 bytes of its input and every
   * refresh JWT for a user shares a much longer prefix (header + sub +
   * email), so any of a user's refresh tokens matched any stored hash —
   * logout, rotation and reuse detection were all ineffective. The JWT is
   * already high-entropy, so a fast hash is appropriate here.
   * Legacy bcrypt entries simply never match, forcing a one-time re-login.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private findTokenIndex(plain: string, hashed: string[]): number {
    return hashed.indexOf(this.hashToken(plain));
  }

  /**
   * OTPs are only ever echoed in API responses when explicitly opted in for
   * local development. This used to be on whenever NODE_ENV !== 'production',
   * so a deployment that forgot NODE_ENV handed out password-reset codes for
   * any account (including admins) in the HTTP response.
   */
  private exposeOtp(): boolean {
    return (
      this.config.get('EXPOSE_OTP_IN_RESPONSE') === 'true' &&
      this.config.get('NODE_ENV') !== 'production'
    );
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
      image   : user.image ?? null,
      mustChangePassword: !!user.mustChangePassword,
    };
  }
}
