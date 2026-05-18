import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification, NotificationDocument,
  NotificationType, NotificationStatus,
} from './notification.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';

export interface CreateNotificationInput {
  recipient       : string;
  sender          : string;
  type            : NotificationType;
  title           : string;
  message         : string;
  requiresApproval?: boolean;
  payload?        : Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private readonly notifModel:   Model<NotificationDocument>,
    @InjectModel(Student.name)      private readonly studentModel: Model<StudentDocument>,
    @InjectModel(User.name)         private readonly userModel:    Model<UserDocument>,
  ) {}

  async create(input: CreateNotificationInput) {
    const status = input.requiresApproval
      ? NotificationStatus.PENDING
      : NotificationStatus.UNREAD;

    return this.notifModel.create({
      recipient       : new Types.ObjectId(input.recipient),
      sender          : new Types.ObjectId(input.sender),
      type            : input.type,
      title           : input.title,
      message         : input.message,
      status,
      requiresApproval: input.requiresApproval ?? false,
      payload         : input.payload ?? {},
    });
  }

  async createForAdmins(input: Omit<CreateNotificationInput, 'recipient'>) {
    const admins = await this.userModel
      .find({ role: UserRole.ADMIN })
      .select('_id')
      .lean();
    return Promise.all(
      admins.map((a) => this.create({ ...input, recipient: a._id.toString() })),
    );
  }

  async getForUser(userId: string) {
    return this.notifModel
      .find({ recipient: new Types.ObjectId(userId) })
      .populate('sender', 'fullName email role')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async getUnreadCount(userId: string) {
    const count = await this.notifModel.countDocuments({
      recipient: new Types.ObjectId(userId),
      status   : { $in: [NotificationStatus.UNREAD, NotificationStatus.PENDING] },
    });
    return { count };
  }

  async markRead(notifId: string, userId: string) {
    const n = await this.notifModel.findOneAndUpdate(
      {
        _id      : new Types.ObjectId(notifId),
        recipient: new Types.ObjectId(userId),
        status   : NotificationStatus.UNREAD,
      },
      { $set: { status: NotificationStatus.READ } },
      { new: true },
    );
    if (!n) throw new NotFoundException('Notification not found.');
    return { message: 'Marked as read.' };
  }

  async markAllRead(userId: string) {
    await this.notifModel.updateMany(
      { recipient: new Types.ObjectId(userId), status: NotificationStatus.UNREAD },
      { $set: { status: NotificationStatus.READ } },
    );
    return { message: 'All notifications marked as read.' };
  }

  async acceptRequest(notifId: string) {
    const n = await this.notifModel.findOne({
      _id   : new Types.ObjectId(notifId),
      status: NotificationStatus.PENDING,
    });
    if (!n) throw new NotFoundException('Pending notification not found.');

    if (n.type === NotificationType.DELETE_REQUEST) {
      const { targetId } = n.payload as { targetId: string };
      await this.studentModel.findByIdAndDelete(targetId);
    }

    n.status = NotificationStatus.ACCEPTED;
    await n.save();
    return { message: 'Request accepted and executed.' };
  }

  async rejectRequest(notifId: string) {
    const n = await this.notifModel.findOne({
      _id   : new Types.ObjectId(notifId),
      status: NotificationStatus.PENDING,
    });
    if (!n) throw new NotFoundException('Pending notification not found.');
    n.status = NotificationStatus.REJECTED;
    await n.save();
    return { message: 'Request rejected.' };
  }

  getActivityFeed(limit = 10) {
    return this.notifModel
      .find({
        type: { $in: [NotificationType.MURABBI_ACTION, NotificationType.STUDENT_ASSIGNED, NotificationType.CIRCLE_ASSIGNED] },
      })
      .populate('sender', 'fullName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
