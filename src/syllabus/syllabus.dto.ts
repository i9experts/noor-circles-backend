import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { safeTrim } from '../common/utils/transform.util';
import { AGE_GROUPS, EVENT_TYPES, PART_KEYS } from './syllabus.schema';
import { DATE_RE } from './schedule.util';

export class CreateTrackDto {
  @IsString() @IsNotEmpty({ message: 'Name is required.' }) @MaxLength(100) @Transform(safeTrim)
  name: string;

  @IsIn(AGE_GROUPS, { message: 'Age group must be 6-8, 9-10 or 11-13.' })
  ageGroup: string;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  description?: string;
}

export class UpdateTrackDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  name?: string;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  description?: string;
}

export class SessionPartDto {
  @IsIn(PART_KEYS)
  key: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(safeTrim)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  details?: string;

  @IsOptional() @IsInt() @Min(0) @Max(240)
  minutes?: number;
}

export class CreateSessionDto {
  @IsInt() @Min(1) @Max(500)
  number: number;

  @IsInt() @Min(1) @Max(12)
  month: number;

  @IsString() @IsNotEmpty({ message: 'Title is required.' }) @MaxLength(150) @Transform(safeTrim)
  title: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(300, { each: true })
  objectives?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => SessionPartDto)
  parts?: SessionPartDto[];

  @IsOptional() @IsString() @MaxLength(1000)
  homeActivity?: string;

  @IsOptional() @IsMongoId()
  lessonId?: string | null;
}

export class UpdateSessionDto extends PartialType(CreateSessionDto) {}

export class RecordCoverageDto {
  @IsMongoId({ message: 'Select a circle.' })
  circleId: string;

  @IsMongoId({ message: 'Select a session.' })
  sessionId: string;

  /** Keys of the parts that were covered. */
  @IsArray() @IsIn(PART_KEYS, { each: true })
  partsDone: string[];

  /** Mark complete even if some parts were skipped. */
  @IsOptional() @IsBoolean()
  completed?: boolean;

  @IsOptional() @Matches(DATE_RE, { message: 'Date must be YYYY-MM-DD.' })
  date?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class StudentNoteDto {
  @IsMongoId({ message: 'Select a student.' })
  studentId: string;

  @IsString() @IsNotEmpty({ message: 'Write a note.' }) @MaxLength(500) @Transform(safeTrim)
  note: string;

  @IsOptional() @IsMongoId()
  sessionId?: string;
}

export class CreateEventDto {
  @IsString() @IsNotEmpty({ message: 'Title is required.' }) @MaxLength(150) @Transform(safeTrim)
  title: string;

  @IsIn(EVENT_TYPES, { message: 'Type must be holiday, parent_evening or event.' })
  type: string;

  @Matches(DATE_RE, { message: 'Start date must be YYYY-MM-DD.' })
  startDate: string;

  @IsOptional() @Matches(DATE_RE, { message: 'End date must be YYYY-MM-DD.' })
  endDate?: string;

  @IsOptional() @IsArray() @IsMongoId({ each: true })
  circleIds?: string[];

  @IsOptional() @IsBoolean()
  cancelsSessions?: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}
