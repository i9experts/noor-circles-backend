import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification, NotificationDocument,
  NotificationType, NotificationStatus,
} from './notification.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Incentive, IncentiveDocument } from '../incentive/incentive.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { deleteStudentCascade } from '../student/student-cleanup';

export interface CreateNotificationInput {
  recipient       : string;
  /** Omit for system notifications that no user triggered. */
  sender         ?: string;
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
    @InjectModel(Attendance.name)   private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Incentive.name)    private readonly incentiveModel:  Model<IncentiveDocument>,
    @InjectModel(Parent.name)       private readonly parentModel:     Model<ParentDocument>,
  ) {}

  private cleanupModels() {
    return {
      studentModel   : this.studentModel,
      attendanceModel: this.attendanceModel,
      incentiveModel : this.incentiveModel,
      parentModel    : this.parentModel,
    };
  }

  /**
   * Requests that need approval go to every admin as separate copies. Once one
   * admin decides, the other copies get the same outcome, so nobody can
   * "reject" a request that was already carried out.
   */
  private resolveSiblings(n: NotificationDocument, status: NotificationStatus) {
    return this.notifModel.updateMany(
      { _id: { $ne: n._id }, type: n.type, sender: n.sender, payload: n.payload, status: NotificationStatus.PENDING },
      { $set: { status } },
    );
  }

  async create(input: CreateNotificationInput) {
    const status = input.requiresApproval
      ? NotificationStatus.PENDING
      : NotificationStatus.UNREAD;

    return this.notifModel.create({
      recipient       : new Types.ObjectId(input.recipient),
      sender          : input.sender ? new Types.ObjectId(input.sender) : null,
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
      if (Types.ObjectId.isValid(targetId)) await deleteStudentCascade(this.cleanupModels(), targetId);
    }

    n.status = NotificationStatus.ACCEPTED;
    await n.save();
    await this.resolveSiblings(n, NotificationStatus.ACCEPTED);
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
    await this.resolveSiblings(n, NotificationStatus.REJECTED);
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
