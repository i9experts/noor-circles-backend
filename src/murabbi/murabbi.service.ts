import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';

@Injectable()
export class MurabbiService {
  constructor(
    @InjectModel(Circle.name)  private readonly circleModel:  Model<CircleDocument>,
    @InjectModel(Student.name) private readonly studentModel: Model<StudentDocument>,
  ) {}

  async getMyCircles(murabbiId: string) {
    return this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .populate('neighbourhood', 'name city')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getMyStudents(murabbiId: string) {
    const circles = await this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .select('_id')
      .lean();

    if (!circles.length) return [];

    return this.studentModel
      .find({ circle: { $in: circles.map((c) => c._id) } })
      .populate('circle', 'name capacity')
      .populate('neighbourhood', 'name city')
      .sort({ fullName: 1 })
      .lean();
  }

  async getDashboard(murabbiId: string) {
    const circles = await this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .populate('neighbourhood', 'name city')
      .lean();

    const circleIds = circles.map((c) => c._id);

    const [totalStudents, activeStudents] = await Promise.all([
      circleIds.length
        ? this.studentModel.countDocuments({ circle: { $in: circleIds } })
        : Promise.resolve(0),
      circleIds.length
        ? this.studentModel.countDocuments({ circle: { $in: circleIds }, isActive: true })
        : Promise.resolve(0),
    ]);

    // Top 5 students sorted by enrollment date (noorPoints not yet implemented)
    const topStudents = circleIds.length
      ? await this.studentModel
          .find({ circle: { $in: circleIds }, isActive: true })
          .populate('circle', 'name')
          .sort({ enrollmentDate: 1 })
          .limit(5)
          .lean()
      : [];

    return {
      stats: {
        totalStudents,
        activeStudents,
        circleCount : circles.length,
        activeCircles: circles.filter((c) => c.isActive).length,
      },
      circles,
      topStudents,
    };
  }
}
