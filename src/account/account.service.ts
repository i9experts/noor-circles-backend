import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Interest, InterestDocument } from '../interest/interest.schema';
import { CourseService, ASAAS_KEY } from '../course/course.service';
import { UsersService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { ConvertInterestDto, CreateParentAccountDto } from './account.dto';
import { tempPassword } from './temp-password';

const BCRYPT_ROUNDS = 12;

/** Last 10 digits, so "0300 1234567" and "+92 300 1234567" match. */
const phoneKey = (p?: string | null) => (p ?? '').replace(/\D/g, '').slice(-10);

/**
 * Portal accounts that admins create for people (murabbis from interest
 * requests, parents) with a temporary password the admin shares with them
 * personally. The person chooses their own password at first sign-in.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly loginUrl: string;

  constructor(
    @InjectModel(User.name)     private readonly userModel:     Model<UserDocument>,
    @InjectModel(Parent.name)   private readonly parentModel:   Model<ParentDocument>,
    @InjectModel(Interest.name) private readonly interestModel: Model<InterestDocument>,
    private readonly course: CourseService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    const portal = (config.get<string>('PORTAL_URL')
      || (config.get<string>('FRONTEND_URL') || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');
    this.loginUrl = `${portal}/signin`;
  }

  private credentials(user: { _id: any; fullName: string; email: string; role: string; phone?: string | null }, password: string, emailed = false) {
    return {
      account: { id: user._id.toString(), fullName: user.fullName, email: user.email, role: user.role, phone: user.phone ?? null },
      credentials: { email: user.email, password, loginUrl: this.loginUrl },
      /** A welcome / reset email with a set-password link was queued too. */
      emailed,
    };
  }

  private async assertEmailFree(email: string) {
    if (await this.userModel.exists({ email })) {
      throw new ConflictException(`${email} already has a Noor Circles account. Use “Reset password” on that account instead.`);
    }
  }

  private async createUser(data: { fullName: string; email: string; role: UserRole; phone?: string | null; address?: string | null }) {
    await this.assertEmailFree(data.email);
    const password = tempPassword();
    try {
      const user = await this.userModel.create({
        ...data,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        isEmailVerified: true,
        isActive: true,
        mustChangePassword: true,
      });
      const emailed = await this.users.emailSetPasswordLink(user, 'account.welcome');
      return { user, password, emailed };
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictException(`${data.email} already has a Noor Circles account.`);
      throw err;
    }
  }

  // ── From an interest request ────────────────────────────────────────────────

  async convertInterest(id: string, adminId: string, dto: ConvertInterestDto) {
    const interest = await this.interestModel.findById(id);
    if (!interest) throw new NotFoundException('Interest request not found.');
    if (interest.account && await this.userModel.exists({ _id: interest.account })) {
      throw new ConflictException('An account was already created for this request. Use “Reset password” to issue a new password.');
    }
    if (interest.role === 'host') {
      throw new BadRequestException('Hosts offer a space and don’t need a portal account. Add the space under Neighbourhoods instead.');
    }
    const fullName = `${interest.firstName} ${interest.lastName}`.trim().slice(0, 60);

    let result: ReturnType<AccountService['credentials']> & { parentId?: string; linkedExisting?: boolean; training?: string | null };
    if (interest.role === 'mentor') {
      const { user, password, emailed } = await this.createUser({
        fullName, email: interest.email, role: UserRole.MURABBI, phone: interest.phone,
        address: `${interest.neighbourhood}, ${interest.city}`.slice(0, 200),
      });
      let training: string | null = null;
      if (dto.assignTraining) {
        training = await this.course.assign(ASAAS_KEY, adminId, { userIds: [user._id.toString()] })
          .then(() => 'Asaas training assigned.')
          .catch((err) => { this.logger.warn(`Could not assign training: ${(err as Error).message}`); return null; });
      }
      result = { ...this.credentials(user, password, emailed), training };
    } else {
      // A parent may already be on file (e.g. their child was enrolled first): link to that record.
      const key = phoneKey(interest.phone);
      const candidates = await this.parentModel.find({ $or: [{ email: interest.email }, ...(key ? [{ phone: { $regex: `${key}$` } }] : [])] })
        .select('phone email account profile').lean();
      const existing = candidates.find((p) => p.email === interest.email) ?? candidates.find((p) => phoneKey(p.phone) === key);
      if (existing?.account) {
        throw new ConflictException('This parent already has an account. Use “Reset password” on the Parents page.');
      }
      const { user, password, emailed } = await this.createUser({ fullName, email: interest.email, role: UserRole.PARENT, phone: interest.phone });
      let parentId: string;
      if (existing) {
        await this.parentModel.updateOne({ _id: existing._id }, { $set: {
          account: user._id, ...(!existing.email && { email: interest.email }),
          ...(!(existing as any).profile && interest.profile && { profile: interest.profile }),
        } });
        parentId = existing._id.toString();
      } else {
        const parent = await this.parentModel.create({
          fullName: fullName.slice(0, 100), phone: interest.phone.slice(0, 20), email: interest.email,
          whatsappNumber: interest.phone.slice(0, 20), account: user._id, profile: interest.profile ?? null,
          notes: `From the website: ${interest.neighbourhood}, ${interest.city}${interest.roleDetail ? ` · child's age ${interest.roleDetail}` : ''}`.slice(0, 300),
        });
        parentId = parent._id.toString();
      }
      result = { ...this.credentials(user, password, emailed), parentId, linkedExisting: !!existing };
    }

    interest.account = new Types.ObjectId(result.account.id);
    if (interest.status === 'new') interest.status = 'contacted';
    await interest.save();
    this.logger.log(`Account created from interest → ${result.account.email} [${result.account.role}]`);
    return { message: `${result.account.role === 'murabbi' ? 'Murabbi' : 'Parent'} account created. Share the sign-in details with ${fullName}.`, ...result };
  }

  // ── Parents already on file ─────────────────────────────────────────────────

  async createParentAccount(parentId: string, dto: CreateParentAccountDto) {
    const parent = await this.parentModel.findById(parentId);
    if (!parent) throw new NotFoundException('Parent not found.');
    if (parent.account && await this.userModel.exists({ _id: parent.account })) {
      throw new ConflictException('This parent already has an account. Use “Reset password” to issue a new password.');
    }
    const email = dto.email ?? parent.email;
    if (!email) throw new BadRequestException('Add the parent’s email address first: it’s their sign-in name.');
    const { user, password, emailed } = await this.createUser({ fullName: parent.fullName.slice(0, 60), email, role: UserRole.PARENT, phone: parent.phone });
    parent.account = user._id;
    if (!parent.email) parent.email = email;
    await parent.save();
    return { message: `Account created. Share the sign-in details with ${parent.fullName}.`, ...this.credentials(user, password, emailed), parentId };
  }

  // ── Any murabbi or parent account ───────────────────────────────────────────

  private async managedUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid id.');
    const user = await this.userModel.findById(userId);
    if (!user || ![UserRole.MURABBI, UserRole.PARENT].includes(user.role)) throw new NotFoundException('Account not found.');
    return user;
  }

  /** Issues a new temporary password and signs the person out everywhere. */
  async resetPassword(userId: string) {
    const user = await this.managedUser(userId);
    const password = tempPassword();
    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.mustChangePassword = true;
    user.refreshTokens = [];
    if (!user.isEmailVerified) user.isEmailVerified = true;
    await user.save();
    const emailed = await this.users.emailSetPasswordLink(user, 'account.reset');
    return { message: `New temporary password for ${user.fullName}. Their old password no longer works.`, ...this.credentials(user, password, emailed) };
  }

  async setAccess(userId: string, active: boolean) {
    const user = await this.managedUser(userId);
    const changed = user.isActive !== active;
    user.isActive = active;
    if (!active) user.refreshTokens = [];
    await user.save();
    if (changed) {
      void this.email.queue(active ? 'account.restored' : 'account.blocked', { email: user.email, name: user.fullName, userId: user._id },
        { role: user.role, loginUrl: this.loginUrl });
    }
    return { message: active ? `${user.fullName} can sign in again.` : `${user.fullName} can no longer sign in.`, isActive: active };
  }
}
