import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lesson, LessonDocument } from './lesson.schema';

@Injectable()
export class LessonService {
  constructor(
    @InjectModel(Lesson.name) private readonly lessonModel: Model<LessonDocument>,
  ) {}

  /** Murabbis never see Draft lessons (BUG-44). */
  async getAll(includeDrafts = false) {
    return this.lessonModel.find(includeDrafts ? {} : { status: { $ne: 'Draft' } }).sort({ order: 1 }).lean();
  }

  async getOne(id: string, includeDrafts = false) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson || (!includeDrafts && lesson.status === 'Draft')) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async create(data: Partial<Lesson>) {
    return this.lessonModel.create(data);
  }

  async update(id: string, data: Partial<Lesson>) {
    const lesson = await this.lessonModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async remove(id: string) {
    const lesson = await this.lessonModel.findByIdAndDelete(id);
    if (!lesson) throw new NotFoundException('Lesson not found');
    return { deleted: true };
  }
}
