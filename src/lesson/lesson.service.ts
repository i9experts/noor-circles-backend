import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lesson, LessonDocument } from './lesson.schema';

@Injectable()
export class LessonService {
  constructor(
    @InjectModel(Lesson.name) private readonly lessonModel: Model<LessonDocument>,
  ) {}

  async getAll() {
    return this.lessonModel.find().sort({ order: 1 }).lean();
  }

  async getOne(id: string) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async create(data: Partial<Lesson>) {
    return this.lessonModel.create(data);
  }

  async update(id: string, data: Partial<Lesson>) {
    const lesson = await this.lessonModel.findByIdAndUpdate(id, data, { new: true });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async remove(id: string) {
    const lesson = await this.lessonModel.findByIdAndDelete(id);
    if (!lesson) throw new NotFoundException('Lesson not found');
    return { deleted: true };
  }
}
