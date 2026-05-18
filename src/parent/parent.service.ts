import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ArrayMinSize, IsArray, IsEmail, IsInt, IsMongoId, IsNotEmpty, IsOptional,
  IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Parent, ParentDocument } from './parent.schema';
import { Student, StudentDocument } from '../student/student.schema';

export class RegisterParentDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid WhatsApp number format.' })
  whatsappNumber?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one student must be selected.' })
  @IsMongoId({ each: true, message: 'Each student ID must be a valid ID.' })
  studentIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  notes?: string;
}

export class UpdateParentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/)
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  notes?: string;
}

export class AddFeedbackDto {
  @IsString()
  @IsNotEmpty({ message: 'Feedback message is required.' })
  @MinLength(3)
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  message: string;

  @IsInt() @Min(1) @Max(5)
  stars: number;

  @IsInt() @Min(1)
  sessionNumber: number;
}

@Injectable()
export class ParentService {
  constructor(
    @InjectModel(Parent.name)  private readonly parentModel:  Model<ParentDocument>,
    @InjectModel(Student.name) private readonly studentModel: Model<StudentDocument>,
  ) {}

  async register(dto: RegisterParentDto) {
    const studentOids = dto.studentIds.map((id) => new Types.ObjectId(id));

    const foundCount = await this.studentModel.countDocuments({ _id: { $in: studentOids } });
    if (foundCount !== studentOids.length) throw new NotFoundException('One or more students not found.');

    const parent = await this.parentModel.create({
      fullName      : dto.fullName,
      phone         : dto.phone,
      email         : dto.email ?? null,
      whatsappNumber: dto.whatsappNumber ?? null,
      students      : studentOids,
      notes         : dto.notes ?? '',
    });

    return { message: 'Parent registered successfully.', parent };
  }

  async getAll() {
    return this.parentModel
      .find()
      .populate({
        path    : 'students',
        select  : 'fullName circle',
        populate: { path: 'circle', select: 'name' },
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getOne(id: string) {
    const parent = await this.parentModel
      .findById(id)
      .populate({
        path    : 'students',
        select  : 'fullName circle',
        populate: { path: 'circle', select: 'name' },
      })
      .lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return parent;
  }

  async update(id: string, dto: UpdateParentDto) {
    const update: Record<string, unknown> = {};
    if (dto.fullName)       update['fullName']       = dto.fullName;
    if (dto.phone)          update['phone']          = dto.phone;
    if (dto.email)          update['email']          = dto.email;
    if (dto.whatsappNumber) update['whatsappNumber'] = dto.whatsappNumber;
    if (dto.notes !== undefined) update['notes']     = dto.notes;

    const parent = await this.parentModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return { message: 'Parent updated successfully.', parent };
  }

  async remove(id: string) {
    const parent = await this.parentModel.findByIdAndDelete(id).lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return { message: 'Parent record deleted successfully.' };
  }

  async addFeedback(id: string, dto: AddFeedbackDto) {
    const parent = await this.parentModel.findById(id);
    if (!parent) throw new NotFoundException('Parent not found.');

    parent.feedback.push({
      message      : dto.message,
      stars        : dto.stars,
      sessionNumber: dto.sessionNumber,
      date         : new Date(),
    } as any);
    parent.isEngaged = true;
    await parent.save();

    return { message: 'Feedback recorded successfully.', parent };
  }

  async getStats() {
    const [totalParents, totalStudents, parentsWithFeedback] = await Promise.all([
      this.parentModel.countDocuments(),
      this.studentModel.countDocuments(),
      this.parentModel.countDocuments({ 'feedback.0': { $exists: true } }),
    ]);

    const engagementRate    = totalParents > 0 ? Math.round((parentsWithFeedback / totalParents) * 100) : 0;
    const registrationRate  = totalStudents > 0 ? Math.round((totalParents / totalStudents) * 100) : 0;

    // Average stars across all feedback entries
    const allParents    = await this.parentModel.find().select('feedback').lean();
    let totalStars = 0;
    let totalFeedbackCount = 0;
    for (const p of allParents) {
      for (const f of p.feedback) {
        totalStars += f.stars;
        totalFeedbackCount++;
      }
    }
    const avgStars = totalFeedbackCount > 0
      ? (totalStars / totalFeedbackCount).toFixed(1)
      : '0.0';

    return {
      totalParents,
      totalStudents,
      registrationRate,
      engagementRate,
      totalFeedbackCount,
      avgStars,
    };
  }
}
