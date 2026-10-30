import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Interest, InterestDocument } from './interest.schema';
import { CreateInterestDto, UpdateInterestDto } from './interest.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { EmailService } from '../email/email.service';

const ROLE_LABEL: Record<string, string> = { parent: 'parent', mentor: 'mentor', host: 'host' };

@Injectable()
export class InterestService {
  private readonly logger = new Logger(InterestService.name);

  constructor(
    @InjectModel(Interest.name) private readonly interestModel: Model<InterestDocument>,
    private readonly notifService: NotificationService,
    private readonly email: EmailService,
  ) {}

  async create(dto: CreateInterestDto) {
    const thanks = { message: 'Thank you! The Noor Circles team will be in touch soon, in sha Allah.' };

    if (dto.website) {
      this.logger.warn(`Interest honeypot triggered (${dto.email})`);
      return thanks;
    }

    const interest = await this.interestModel.create({
      role         : dto.role,
      firstName    : dto.firstName,
      lastName     : dto.lastName,
      email        : dto.email,
      phone        : dto.phone,
      city         : dto.city,
      neighbourhood: dto.neighbourhood,
      roleDetail   : dto.roleDetail ?? '',
    });

    const name = `${interest.firstName} ${interest.lastName}`;
    this.notifService.createForAdmins({
      type   : NotificationType.INTEREST_REQUEST,
      title  : `New ${ROLE_LABEL[interest.role]} interest`,
      message: `${name} (${interest.neighbourhood}, ${interest.city}) wants to join as a ${ROLE_LABEL[interest.role]}.`,
      payload: { interestId: interest._id.toString(), role: interest.role, name, city: interest.city },
    }).catch(() => {});

    void this.email.queue('interest.thanks', { email: interest.email, name }, { role: interest.role });
    void this.email.queue('interest.alert', { email: this.email.supportEmail, name: 'Noor Circles team' }, {
      name, role: interest.role, email: interest.email, phone: interest.phone, city: interest.city,
      neighbourhood: interest.neighbourhood, roleDetail: interest.roleDetail, adminUrl: this.email.link('/'),
    });

    this.logger.log(`Interest received → ${interest.role} · ${interest.email}`);
    return thanks;
  }

  findAll(filters: { status?: string; role?: string }) {
    const q: Record<string, string> = {};
    if (filters.status) q.status = filters.status;
    if (filters.role)   q.role   = filters.role;
    return this.interestModel.find(q).populate('account', 'email role isActive mustChangePassword lastLoginAt').sort({ createdAt: -1 }).lean();
  }

  async update(id: string, dto: UpdateInterestDto) {
    const interest = await this.interestModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .lean();
    if (!interest) throw new NotFoundException('Interest request not found.');
    return { message: 'Interest request updated.', interest };
  }

  async remove(id: string) {
    const interest = await this.interestModel.findByIdAndDelete(id).lean();
    if (!interest) throw new NotFoundException('Interest request not found.');
    return { message: 'Interest request deleted.' };
  }
}
