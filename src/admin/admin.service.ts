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
    @InjectModel(User.name)         private readonly userModel:         Model<UserDocument>,
    @InjectModel(Neighbourhood.name) private readonly neighbourhoodModel: Model<NeighbourhoodDocument>,
    @InjectModel(Circle.name)       private readonly circleModel:       Model<CircleDocument>,
    @InjectModel(Student.name)      private readonly studentModel:      Model<StudentDocument>,
    private readonly usersService: UsersService,
  ) {}

  // ── Dashboard Stats ───────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalMurabbis, activeMurabbis, inactiveMurabbis,
      totalStudents, activeStudents,
      totalCircles, activeCircles,
      totalNeighbourhoods,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: true }),
      this.userModel.countDocuments({ role: UserRole.MURABBI, isEmailVerified: true, isActive: false }),
      this.studentModel.countDocuments(),
      this.studentModel.countDocuments({ isActive: true }),
      this.circleModel.countDocuments(),
      this.circleModel.countDocuments({ isActive: true }),
      this.neighbourhoodModel.countDocuments(),
    ]);

    return {
      totalMurabbis,
      activeMurabbis,
      inactiveMurabbis,
      totalStudents,
      activeStudents,
      totalCircles,
      activeCircles,
      totalNeighbourhoods,
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

  // ── Neighbourhoods ────────────────────────────────────────────────────────────

  getAllNeighbourhoods() {
    return this.neighbourhoodModel.find().sort({ createdAt: -1 }).lean();
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

  async createCircle(dto: CreateCircleDto) {
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
    return { message: 'Circle created successfully.', circle };
  }

  async updateCircle(id: string, dto: UpdateCircleDto) {
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
    return { message: 'Circle updated successfully.', circle };
  }

  async deleteCircle(id: string) {
    const studentsCount = await this.studentModel.countDocuments({ circle: new Types.ObjectId(id) });
    if (studentsCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${studentsCount} student(s) are enrolled in this circle. Reassign or remove them first.`,
      );
    }

    const circle = await this.circleModel.findByIdAndDelete(id).lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    return { message: 'Circle deleted successfully.' };
  }

  // ── Students ──────────────────────────────────────────────────────────────────

  getAllStudents() {
    return this.studentModel
      .find()
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
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

  async enrollStudent(dto: EnrollStudentDto) {
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
      dateOfBirth   : dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      address       : dto.address ?? null,
      circle        : new Types.ObjectId(dto.circleId),
      neighbourhood : new Types.ObjectId(dto.neighbourhoodId),
      enrollmentDate: new Date(),
    });

    this.logger.log(`Admin enrolled student → ${student.fullName}`);
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

  async assignStudentCircle(id: string, dto: AssignCircleDto) {
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
        { $set: { circle: new Types.ObjectId(dto.circleId) } },
        { new: true },
      )
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .lean();

    if (!student) throw new NotFoundException('Student not found.');
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
}
