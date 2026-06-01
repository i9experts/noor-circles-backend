import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument, UserRole } from '../user/user.schema';
import { UsersService } from '../user/user.service';
import { Neighbourhood, NeighbourhoodDocument } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Parent, ParentDocument }         from '../parent/parent.schema';
import { NotificationService } from '../notification/notification.service';
import { NotificationType }    from '../notification/notification.schema';
import { AnnouncementService } from '../announcement/announcement.service';
import {
  AssignCircleDto,
  CreateCircleDto,
  CreateMurabbiDto,
  CreateNeighbourhoodDto,
  EnrollStudentDto,
  UpdateCircleDto,
  UpdateNeighbourhoodDto,
  UpdateStudentDto,
} from './admin.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name)          private readonly userModel:          Model<UserDocument>,
    @InjectModel(Neighbourhood.name) private readonly neighbourhoodModel: Model<NeighbourhoodDocument>,
    @InjectModel(Circle.name)        private readonly circleModel:        Model<CircleDocument>,
    @InjectModel(Student.name)       private readonly studentModel:       Model<StudentDocument>,
    @InjectModel(Attendance.name)    private readonly attendanceModel:    Model<AttendanceDocument>,
    @InjectModel(Parent.name)        private readonly parentModel:        Model<ParentDocument>,
    private readonly usersService:        UsersService,
    private readonly notifService:        NotificationService,
    private readonly announcementService: AnnouncementService,
  ) {}

  // ── Dashboard Stats ───────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalMurabbis, activeMurabbis, inactiveMurabbis,
      totalStudents, activeStudents,
      totalCircles, activeCircles,
      totalNeighbourhoods,
      sessionsCompleted, attendanceSessions,
      totalParents, engagedParents,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: false }),
      this.studentModel.countDocuments(),
      this.studentModel.countDocuments({ isActive: true }),
      this.circleModel.countDocuments(),
      this.circleModel.countDocuments({ isActive: true }),
      this.neighbourhoodModel.countDocuments(),
      this.attendanceModel.countDocuments(),
      this.attendanceModel.find().select('records').lean(),
      this.parentModel.countDocuments(),
      this.parentModel.countDocuments({ 'feedback.0': { $exists: true } }),
    ]);

    let totalPresent = 0;
    let totalRecords = 0;
    for (const session of attendanceSessions) {
      for (const rec of session.records) {
        totalRecords++;
        if (rec.status === 'present') totalPresent++;
      }
    }
    const avgAttendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    return {
      totalMurabbis,
      activeMurabbis,
      inactiveMurabbis,
      totalStudents,
      activeStudents,
      totalCircles,
      activeCircles,
      totalNeighbourhoods,
      sessionsCompleted,
      avgAttendanceRate,
      parentEngagement: totalParents > 0 ? Math.round((engagedParents / totalParents) * 100) : 0,
    };
  }

  // ── Murabbis ──────────────────────────────────────────────────────────────────

  getAllUsers() {
    return this.usersService.findAll();
  }

  getAllMurabbis() {
    return this.usersService.findAllMurabbis();
  }

  async createMurabbi(dto: CreateMurabbiDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) throw new ConflictException('A user with this email already exists.');

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const murabbi = await this.userModel.create({
      fullName       : dto.fullName,
      email          : dto.email,
      password       : hashedPassword,
      role           : UserRole.MURABBI,
      isEmailVerified: true,
      isActive       : true,
      phone          : dto.phone   ?? null,
      address        : dto.address ?? null,
      image          : dto.image   ?? null,
    });

    this.logger.log(`Admin created murabbi → ${murabbi.email}`);
    return {
      message : 'Murabbi account created successfully.',
      murabbi : { id: murabbi._id, fullName: murabbi.fullName, email: murabbi.email, role: murabbi.role },
    };
  }

  deactivateMurabbi(userId: string) { return this.usersService.deactivateUser(userId); }
  activateMurabbi(userId: string)   { return this.usersService.activateUser(userId); }
  deleteMurabbi(userId: string)     { return this.usersService.deleteMurabbi(userId); }

  async updateMurabbi(userId: string, dto: { fullName?: string; phone?: string; address?: string; image?: string }) {
    const update: Record<string, unknown> = {};
    if (dto.fullName !== undefined) update['fullName'] = dto.fullName;
    if (dto.phone    !== undefined) update['phone']    = dto.phone    || null;
    if (dto.address  !== undefined) update['address']  = dto.address  || null;
    if (dto.image    !== undefined) update['image']    = dto.image    || null;

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true },
    ).select('-password -refreshTokens');
    if (!user) throw new NotFoundException('Murabbi not found.');
    return user;
  }

  // ── Neighbourhoods ────────────────────────────────────────────────────────────

  getAllNeighbourhoods() {
    return this.neighbourhoodModel.find().sort({ createdAt: -1 }).lean();
  }

  async getOneNeighbourhood(id: string) {
    const doc = await this.neighbourhoodModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Neighbourhood not found.');
    return doc;
  }

  async createNeighbourhood(dto: CreateNeighbourhoodDto) {
    const exists = await this.neighbourhoodModel.findOne({
      name: { $regex: `^${dto.name}$`, $options: 'i' },
    });
    if (exists) throw new ConflictException('A neighbourhood with this name already exists.');

    const neighbourhood = await this.neighbourhoodModel.create({
      name: dto.name,
      city: dto.city ?? null,
    });
    this.logger.log(`Admin created neighbourhood → ${neighbourhood.name}`);
    return { message: 'Neighbourhood created successfully.', neighbourhood };
  }

  async updateNeighbourhood(id: string, dto: UpdateNeighbourhoodDto) {
    if (dto.name) {
      const duplicate = await this.neighbourhoodModel.findOne({
        _id : { $ne: new Types.ObjectId(id) },
        name: { $regex: `^${dto.name}$`, $options: 'i' },
      });
      if (duplicate) throw new ConflictException('A neighbourhood with this name already exists.');
    }

    const neighbourhood = await this.neighbourhoodModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .lean();

    if (!neighbourhood) throw new NotFoundException('Neighbourhood not found.');
    return { message: 'Neighbourhood updated successfully.', neighbourhood };
  }

  async deleteNeighbourhood(id: string) {
    const circlesCount = await this.circleModel.countDocuments({ neighbourhood: new Types.ObjectId(id) });
    if (circlesCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${circlesCount} circle(s) are assigned to this neighbourhood. Reassign or delete them first.`,
      );
    }

    const neighbourhood = await this.neighbourhoodModel.findByIdAndDelete(id).lean();
    if (!neighbourhood) throw new NotFoundException('Neighbourhood not found.');
    return { message: 'Neighbourhood deleted successfully.' };
  }

  // ── Circles ───────────────────────────────────────────────────────────────────

  getAllCircles() {
    return this.circleModel
      .find()
      .populate('neighbourhood', 'name city')
      .populate('murabbi', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getCircleById(id: string) {
    const circle = await this.circleModel
      .findById(id)
      .populate('neighbourhood', 'name city')
      .populate('murabbi', 'fullName email')
      .lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    return circle;
  }

  async createCircle(dto: CreateCircleDto, adminId?: string) {
    const [neighbourhood, murabbi] = await Promise.all([
      this.neighbourhoodModel.findById(dto.neighbourhoodId).lean(),
      this.userModel.findOne({ _id: dto.murabbiId, role: UserRole.MURABBI, isEmailVerified: true }).lean(),
    ]);

    if (!neighbourhood) throw new NotFoundException('Neighbourhood not found.');
    if (!murabbi)        throw new NotFoundException('Murabbi not found or is not an active murabbi.');

    const circle = await this.circleModel.create({
      name        : dto.name,
      neighbourhood: new Types.ObjectId(dto.neighbourhoodId),
      murabbi     : new Types.ObjectId(dto.murabbiId),
      capacity    : dto.capacity ?? 30,
    });

    this.logger.log(`Admin created circle → ${circle.name}`);

    if (adminId) {
      this.notifService.create({
        recipient: dto.murabbiId,
        sender   : adminId,
        type     : NotificationType.CIRCLE_ASSIGNED,
        title    : 'New Circle Assigned',
        message  : `You have been assigned as the Murabbi for "${circle.name}" in ${neighbourhood.name}.`,
        payload  : { circleId: circle._id?.toString(), circleName: circle.name, neighbourhoodName: neighbourhood.name },
      }).catch(() => {});
    }

    return { message: 'Circle created successfully.', circle };
  }

  async updateCircle(id: string, dto: UpdateCircleDto, adminId?: string) {
    if (dto.neighbourhoodId) {
      const neighbourhood = await this.neighbourhoodModel.findById(dto.neighbourhoodId).lean();
      if (!neighbourhood) throw new NotFoundException('Neighbourhood not found.');
    }
    if (dto.murabbiId) {
      const murabbi = await this.userModel
        .findOne({ _id: dto.murabbiId, role: UserRole.MURABBI, isEmailVerified: true })
        .lean();
      if (!murabbi) throw new NotFoundException('Murabbi not found or is not an active murabbi.');
    }

    const update: Record<string, unknown> = {};
    if (dto.name)            update['name']         = dto.name;
    if (dto.neighbourhoodId) update['neighbourhood'] = new Types.ObjectId(dto.neighbourhoodId);
    if (dto.murabbiId)       update['murabbi']       = new Types.ObjectId(dto.murabbiId);
    if (dto.capacity)        update['capacity']      = dto.capacity;

    const circle = await this.circleModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .populate('neighbourhood', 'name city')
      .populate('murabbi', 'fullName email')
      .lean();

    if (!circle) throw new NotFoundException('Circle not found.');

    if (adminId && dto.murabbiId) {
      this.notifService.create({
        recipient: dto.murabbiId,
        sender   : adminId,
        type     : NotificationType.CIRCLE_ASSIGNED,
        title    : 'Circle Assigned to You',
        message  : `You have been assigned as the Murabbi for circle "${circle.name}".`,
        payload  : { circleId: id, circleName: circle.name },
      }).catch(() => {});
    }

    return { message: 'Circle updated successfully.', circle };
  }

  async deleteCircle(id: string) {
    const circle = await this.circleModel.findByIdAndDelete(id).lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    // Unassign students from deleted circle
    await this.studentModel.updateMany(
      { circle: new Types.ObjectId(id) },
      { $set: { circle: null } },
    );
    return { message: 'Circle deleted successfully.' };
  }

  // ── Students ──────────────────────────────────────────────────────────────────

  getAllStudents(murabbiId?: string) {
    const filter = murabbiId ? { murabbi: new Types.ObjectId(murabbiId) } : {};
    return this.studentModel
      .find(filter)
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .populate('murabbi', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getStudentById(id: string) {
    const student = await this.studentModel
      .findById(id)
      .populate('circle', 'name capacity murabbi')
      .populate('neighbourhood', 'name city')
      .lean();
    if (!student) throw new NotFoundException('Student not found.');
    return student;
  }

  async enrollStudent(dto: EnrollStudentDto, adminId?: string) {
    const [circle, neighbourhood] = await Promise.all([
      this.circleModel.findById(dto.circleId).lean(),
      this.neighbourhoodModel.findById(dto.neighbourhoodId).lean(),
    ]);

    if (!circle)        throw new NotFoundException('Circle not found.');
    if (!neighbourhood) throw new NotFoundException('Neighbourhood not found.');

    if (!circle.isActive) {
      throw new BadRequestException('Cannot enroll in an inactive circle.');
    }

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
      murabbi       : circle.murabbi ? new Types.ObjectId(circle.murabbi.toString()) : null,
      enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : new Date(),
    });

    this.logger.log(`Admin enrolled student → ${student.fullName}`);

    if (adminId && circle.murabbi) {
      this.notifService.create({
        recipient: circle.murabbi.toString(),
        sender   : adminId,
        type     : NotificationType.STUDENT_ASSIGNED,
        title    : 'New Student Enrolled in Your Circle',
        message  : `${student.fullName} has been enrolled in your circle "${circle.name}" by the admin.`,
        payload  : { studentId: student._id?.toString(), studentName: student.fullName, circleName: circle.name },
      }).catch(() => {});
    }

    return { message: 'Student enrolled successfully.', student };
  }

  async updateStudent(id: string, dto: UpdateStudentDto) {
    const update: Record<string, unknown> = {};
    if (dto.fullName)    update['fullName']    = dto.fullName;
    if (dto.fatherName)  update['fatherName']  = dto.fatherName;
    if (dto.phone)       update['phone']       = dto.phone;
    if (dto.email)       update['email']       = dto.email;
    if (dto.dateOfBirth) update['dateOfBirth'] = new Date(dto.dateOfBirth);
    if (dto.address)     update['address']     = dto.address;

    const student = await this.studentModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .populate('circle', 'name')
      .populate('neighbourhood', 'name city')
      .lean();

    if (!student) throw new NotFoundException('Student not found.');
    return { message: 'Student updated successfully.', student };
  }

  async assignStudentCircle(id: string, dto: AssignCircleDto, adminId?: string) {
    const circle = await this.circleModel.findById(dto.circleId).lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    if (!circle.isActive) throw new BadRequestException('Cannot assign to an inactive circle.');

    const enrolledCount = await this.studentModel.countDocuments({
      circle  : new Types.ObjectId(dto.circleId),
      isActive: true,
    });
    if (enrolledCount >= circle.capacity) {
      throw new BadRequestException(`Circle is full (capacity: ${circle.capacity}).`);
    }

    const student = await this.studentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            circle : new Types.ObjectId(dto.circleId),
            murabbi: circle.murabbi ? new Types.ObjectId(circle.murabbi.toString()) : null,
          },
        },
        { new: true },
      )
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .lean();

    if (!student) throw new NotFoundException('Student not found.');

    if (adminId && circle.murabbi) {
      this.notifService.create({
        recipient: circle.murabbi.toString(),
        sender   : adminId,
        type     : NotificationType.STUDENT_ASSIGNED,
        title    : 'Student Assigned to Your Circle',
        message  : `${student.fullName} has been assigned to your circle "${circle.name}" by the admin.`,
        payload  : { studentId: id, studentName: student.fullName, circleName: circle.name },
      }).catch(() => {});
    }

    return { message: 'Student reassigned to new circle successfully.', student };
  }

  async deactivateStudent(id: string) {
    const student = await this.studentModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean();
    if (!student) throw new NotFoundException('Student not found.');
    return { message: 'Student deactivated successfully.' };
  }

  async activateStudent(id: string) {
    const student = await this.studentModel
      .findByIdAndUpdate(id, { $set: { isActive: true } }, { new: true })
      .lean();
    if (!student) throw new NotFoundException('Student not found.');
    return { message: 'Student activated successfully.' };
  }

  async deleteStudent(id: string) {
    const student = await this.studentModel.findByIdAndDelete(id).lean();
    if (!student) throw new NotFoundException('Student not found.');
    return { message: 'Student record deleted successfully.' };
  }

  // ── Extended Dashboard ────────────────────────────────────────────────────────

  async getDashboardExtended() {
    const activeCircles = await this.circleModel
      .find({ isActive: true })
      .populate('neighbourhood', 'name city')
      .populate('murabbi', 'fullName')
      .sort({ name: 1 })
      .lean();

    const circlesWithCounts = await Promise.all(
      activeCircles.map(async (c) => {
        const enrolledCount = await this.studentModel.countDocuments({
          circle  : c._id,
          isActive: true,
        });
        return { ...c, enrolledCount };
      }),
    );

    const [recentActivity, announcements] = await Promise.all([
      this.notifService.getActivityFeed(10),
      this.announcementService.getLatest(5),
    ]);

    return { activeCircles: circlesWithCounts, recentActivity, announcements };
  }
}
