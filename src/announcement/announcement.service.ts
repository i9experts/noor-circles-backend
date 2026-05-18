import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Announcement, AnnouncementDocument, AnnouncementIcon } from './announcement.schema';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required.' })
  @MaxLength(120)
  @Transform(({ value }) => value?.trim())
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Body is required.' })
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  body: string;

  @IsOptional()
  @IsEnum(AnnouncementIcon)
  icon?: AnnouncementIcon;
}

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name) private readonly announcementModel: Model<AnnouncementDocument>,
  ) {}

  async create(dto: CreateAnnouncementDto, createdBy: string) {
    const announcement = await this.announcementModel.create({
      title    : dto.title,
      body     : dto.body,
      icon     : dto.icon ?? AnnouncementIcon.INFO,
      createdBy: new Types.ObjectId(createdBy),
    });
    return { message: 'Announcement created.', announcement };
  }

  getAll() {
    return this.announcementModel
      .find()
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
  }

  getLatest(limit = 5) {
    return this.announcementModel
      .find()
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async remove(id: string) {
    const announcement = await this.announcementModel.findByIdAndDelete(id).lean();
    if (!announcement) throw new NotFoundException('Announcement not found.');
    return { message: 'Announcement deleted.' };
  }
}
