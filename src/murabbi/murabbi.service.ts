import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsDateString, IsEmail, IsMongoId, IsNotEmpty,
  IsOptional, IsString, Matches, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Circle, CircleDocument }       from '../circle/circle.schema';
import { Student, StudentDocument }      from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { NotificationService }       from '../notification/notification.service';
import { NotificationType }          from '../notification/notification.schema';
import { safeEmail, safeTrim } from '../common/utils/transform.util';

export class MurabbiEnrollStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(100)
  @Transform(safeTrim)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Father name is required.' })
  @MaxLength(100)
  @Transform(safeTrim)
  fatherName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enrollment date must be a valid ISO date.' })
  enrollmentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(safeTrim)
  address?: string;

  @IsMongoId({ message: 'Invalid circle ID.' })
  circleId: string;

  @IsMongoId({ message: 'Invalid neighbourhood ID.' })
  neighbourhoodId: string;
}

export class MurabbiUpdateStudentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty.' })
  @MaxLength(100)
  @Transform(safeTrim)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Father name cannot be empty.' })
  @MaxLength(100)
  @Transform(safeTrim)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid ISO date.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(safeTrim)
  address?: string;
}

@Injectable()
export class MurabbiService {
  constructor(
    @InjectModel(Circle.name)      private readonly circleModel:      Model<CircleDocument>,
    @InjectModel(Student.name)     private readonly studentModel:     Model<StudentDocument>,
    @InjectModel(Attendance.name)  private readonly attendanceModel:  Model<AttendanceDocument>,
    private readonly notifService: NotificationService,
  ) {}

  private async myCircleIds(murabbiId: string): Promise<Types.ObjectId[]> {
    const circles = await this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .select('_id')
      .lean();
    return circles.map((c) => c._id as Types.ObjectId);
  }

  private myStudentFilter(murabbiOid: Types.ObjectId, circleIds: Types.ObjectId[]) {
    return {
      $or: [
        { murabbi: murabbiOid },
        { circle: { $in: circleIds } },
      ],
    };
  }

  async getMyCircles(murabbiId: string) {
    const circles = await this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .populate('neighbourhood', 'name city area mosques status')
      .sort({ createdAt: -1 })
      .lean();

    const circleIds = circles.map((c) => c._id);

    const [studentAgg, attendanceDocs] = await Promise.all([
      this.studentModel.aggregate([
        { $match: { circle: { $in: circleIds }, isActive: true } },
        { $group: { _id: '$circle', count: { $sum: 1 } } },
      ]),
      this.attendanceModel
        .find({ circle: { $in: circleIds } })
        .select('circle sessionNumber records')
        .lean(),
    ]);

    const studentMap = new Map<string, number>(
      studentAgg.map((r: any) => [r._id.toString(), r.count]),
    );
    const sessionMap = new Map<string, number>();
    const attMap     = new Map<string, { present: number; total: number }>();

    for (const sess of attendanceDocs) {
      const cid = sess.circle?.toString();
      if (!cid) continue;
      const prev = sessionMap.get(cid) || 0;
      if (sess.sessionNumber > prev) sessionMap.set(cid, sess.sessionNumber);
      if (!attMap.has(cid)) attMap.set(cid, { present: 0, total: 0 });
      const acc = attMap.get(cid)!;
      for (const rec of sess.records) {
        acc.total++;
        if (rec.status === 'present') acc.present++;
      }
    }

    return circles.map((c) => {
      const cid     = c._id.toString();
      const att     = attMap.get(cid);
      const attRate = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
      return { ...c, studentCount: studentMap.get(cid) || 0, sessionsCompleted: sessionMap.get(cid) || 0, attendanceRate: attRate };
    });
  }

  async getMyStudents(murabbiId: string) {
    const murabbiOid = new Types.ObjectId(murabbiId);
    const circleIds  = await this.myCircleIds(murabbiId);
    return this.studentModel
      .find(this.myStudentFilter(murabbiOid, circleIds))
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .sort({ fullName: 1 })
      .lean();
  }

  async updateStudent(murabbiId: string, studentId: string, dto: MurabbiUpdateStudentDto) {
    const murabbiOid = new Types.ObjectId(murabbiId);
    const circleIds  = await this.myCircleIds(murabbiId);

    const exists = await this.studentModel.exists({
      _id: new Types.ObjectId(studentId),
      ...this.myStudentFilter(murabbiOid, circleIds),
    });
    if (!exists) throw new NotFoundException('Student not found in your circles.');

    const update: Record<string, unknown> = {};
    if (dto.fullName)    update['fullName']    = dto.fullName;
    if (dto.fatherName)  update['fatherName']  = dto.fatherName;
    if (dto.phone)       update['phone']       = dto.phone;
    if (dto.email !== undefined) update['email'] = dto.email || null;
    if (dto.dateOfBirth) update['dateOfBirth'] = new Date(dto.dateOfBirth);
    if (dto.address !== undefined) update['address'] = dto.address || null;

    const student = await this.studentModel
      .findByIdAndUpdate(studentId, { $set: update }, { new: true, runValidators: true })
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .lean();

    this.notifService.createForAdmins({
      sender : murabbiId,
      type   : NotificationType.MURABBI_ACTION,
      title  : 'Student Info Updated',
      message: `Murabbi updated information for student "${student?.fullName}".`,
      payload: { studentId: studentId, studentName: student?.fullName },
    }).catch(() => {});

    return { message: 'Student updated successfully.', student };
  }

  async requestDeleteStudent(murabbiId: string, studentId: string) {
    const murabbiOid = new Types.ObjectId(murabbiId);
    const circleIds  = await this.myCircleIds(murabbiId);

    const student = await this.studentModel.findOne({
      _id: new Types.ObjectId(studentId),
      ...this.myStudentFilter(murabbiOid, circleIds),
    }).lean();
    if (!student) throw new NotFoundException('Student not found in your circles.');

    await this.notifService.createForAdmins({
      sender          : murabbiId,
      type            : NotificationType.DELETE_REQUEST,
      title           : `Delete Request: ${student.fullName}`,
      message         : `Murabbi is requesting to delete student "${student.fullName}" from circle. Please review and approve or reject.`,
      requiresApproval: true,
      payload         : { targetId: studentId, targetName: student.fullName, targetModel: 'Student' },
    });

    return { message: 'Delete request sent to admin for approval.' };
  }

  async enrollStudent(murabbiId: string, dto: MurabbiEnrollStudentDto) {
    const circle = await this.circleModel.findById(dto.circleId).lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    if (circle.murabbi?.toString() !== murabbiId) {
      throw new BadRequestException('This circle is not assigned to you.');
    }
    if (!circle.isActive) throw new BadRequestException('Cannot enroll in an inactive circle.');

    const enrolledCount = await this.studentModel.countDocuments({
      circle  : new Types.ObjectId(dto.circleId),
      isActive: true,
    });
    if (enrolledCount >= circle.capacity) {
      throw new BadRequestException(`Circle is full (capacity: ${circle.capacity}).`);
    }

    const student = await this.studentModel.create({
      fullName      : dto.fullName,
      fatherName    : dto.fatherName,
      phone         : dto.phone,
      email         : dto.email ?? null,
      dateOfBirth   : null,
      address       : dto.address ?? null,
      circle        : new Types.ObjectId(dto.circleId),
      neighbourhood : new Types.ObjectId(dto.neighbourhoodId),
      murabbi       : new Types.ObjectId(murabbiId),
      enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : new Date(),
    });

    this.notifService.createForAdmins({
      sender : murabbiId,
      type   : NotificationType.MURABBI_ACTION,
      title  : 'New Student Enrolled',
      message: `Murabbi enrolled new student "${student.fullName}" in circle "${circle.name}".`,
      payload: { studentId: student._id?.toString(), studentName: student.fullName, circleName: circle.name },
    }).catch(() => {});

    return { message: 'Student enrolled successfully.', student };
  }

  async getDashboard(murabbiId: string) {
    const murabbiOid = new Types.ObjectId(murabbiId);
    const circleIds  = await this.myCircleIds(murabbiId);

    const circles = await this.circleModel
      .find({ murabbi: murabbiOid })
      .populate('neighbourhood', 'name city')
      .lean();

    const studentFilter = this.myStudentFilter(murabbiOid, circleIds);

    const [totalStudents, activeStudents] = await Promise.all([
      this.studentModel.countDocuments(studentFilter),
      this.studentModel.countDocuments({ $and: [studentFilter, { isActive: true }] }),
    ]);

    const topStudents = await this.studentModel
      .find({ $and: [studentFilter, { isActive: true }] })
      .populate('circle', 'name')
      .sort({ enrollmentDate: 1 })
      .limit(5)
      .lean();

    return {
      stats: {
        totalStudents,
        activeStudents,
        circleCount  : circles.length,
        activeCircles: circles.filter((c) => c.isActive).length,
      },
      circles,
      topStudents,
    };
  }
}
