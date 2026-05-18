import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsEnum, IsMongoId, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  Incentive, IncentiveDocument,
  AwardType, AWARD_POINTS,
} from './incentive.schema';
import { Student, StudentDocument } from '../student/student.schema';

export class AwardPointsDto {
  @IsMongoId({ message: 'Invalid student ID.' })
  studentId: string;

  @IsEnum(['noor-star', 'circle-champion', 'sadaqah-hero', 'knowledge-seeker', 'kindness-award', 'courage-award'],
    { message: 'Invalid award type.' })
  awardType: AwardType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  note?: string;
}

@Injectable()
export class IncentiveService {
  constructor(
    @InjectModel(Incentive.name) private readonly incentiveModel: Model<IncentiveDocument>,
    @InjectModel(Student.name)   private readonly studentModel:   Model<StudentDocument>,
  ) {}

  async award(awardedById: string, dto: AwardPointsDto) {
    const student = await this.studentModel.findById(dto.studentId).lean();
    if (!student) throw new NotFoundException('Student not found.');

    const points = AWARD_POINTS[dto.awardType];
    if (!points) throw new BadRequestException('Invalid award type.');

    const incentive = await this.incentiveModel.create({
      student   : new Types.ObjectId(dto.studentId),
      awardType : dto.awardType,
      points,
      awardedBy : new Types.ObjectId(awardedById),
      note      : dto.note ?? '',
    });

    return { message: 'Points awarded successfully.', incentive };
  }

  async getAll() {
    return this.incentiveModel
      .find()
      .populate('student', 'fullName')
      .populate('awardedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getLeaderboard() {
    // Aggregate total points per student, then join student + circle data
    const results = await this.incentiveModel.aggregate([
      {
        $group: {
          _id       : '$student',
          noorPoints: { $sum: '$points' },
        },
      },
      { $sort: { noorPoints: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from        : 'students',
          localField  : '_id',
          foreignField: '_id',
          as          : 'studentDoc',
        },
      },
      { $unwind: '$studentDoc' },
      {
        $lookup: {
          from        : 'circles',
          localField  : 'studentDoc.circle',
          foreignField: '_id',
          as          : 'circleDoc',
        },
      },
      {
        $project: {
          _id       : '$studentDoc._id',
          fullName  : '$studentDoc.fullName',
          noorPoints: 1,
          circle    : { $arrayElemAt: ['$circleDoc', 0] },
        },
      },
    ]);

    return results.map((r) => ({
      _id       : r._id,
      fullName  : r.fullName,
      noorPoints: r.noorPoints,
      circle    : r.circle ? { name: r.circle.name } : null,
    }));
  }

  async getByStudent(studentId: string) {
    const records = await this.incentiveModel
      .find({ student: new Types.ObjectId(studentId) })
      .populate('awardedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    const totalPoints = records.reduce((sum, r) => sum + r.points, 0);
    return { totalPoints, records };
  }
}
