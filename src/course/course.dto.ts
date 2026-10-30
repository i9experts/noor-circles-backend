import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

export class AssignCourseDto {
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one murabbi.' }) @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  userIds: string[];

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Due date must be YYYY-MM-DD.' })
  dueDate?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  note?: string;
}

export class HeartbeatDto {
  /** Ranges played since the last report, in seconds: [[start, end], …]. */
  @IsArray() @ArrayMaxSize(50)
  @IsArray({ each: true })
  segments: number[][];

  @IsNumber() @Min(0) @Max(36000)
  position: number;
}

export class CoursePointsDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) lesson?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) section?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5000) assessment?: number;
}

export class UpdateCourseSettingsDto {
  @IsOptional() @IsNumber() @Min(0.5) @Max(1)
  completionThreshold?: number;

  @IsOptional() @IsBoolean()
  sequential?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  passingScore?: number;

  @IsOptional() @IsInt() @Min(1) @Max(10)
  maxFailedAttemptsPerDay?: number;

  @IsOptional() @IsBoolean()
  requirePractical?: boolean;

  @IsOptional() @IsString() @MaxLength(2000)
  reflectionPrompt?: string;

  @IsOptional() @IsInt() @Min(0) @Max(5000)
  reflectionMinChars?: number;

  @IsOptional() @ValidateNested() @Type(() => CoursePointsDto)
  points?: CoursePointsDto;
}

export class CourseQuestionDto {
  @IsString() @IsNotEmpty({ message: 'Every question needs text.' }) @MaxLength(1000)
  question: string;

  @IsOptional() @IsString() @MaxLength(1000)
  questionEn?: string;

  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) @IsNotEmpty({ each: true })
  options: string[];

  @IsInt() @Min(0)
  correctIndex: number;

  @IsOptional() @IsString() @MaxLength(1000)
  explanation?: string;

  @IsOptional() @IsString() @MaxLength(20)
  sourceLesson?: string;

  @IsOptional() @IsString() @MaxLength(150)
  module?: string;
}

export class SetQuestionsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CourseQuestionDto)
  questions: CourseQuestionDto[];
}

export class SubmitAnswersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsInt({ each: true })
  answers: number[];
}

export class ReflectionDto {
  @IsString() @IsNotEmpty({ message: 'Write your reflection.' }) @MaxLength(10000)
  text: string;
}

export class ReviewReflectionDto {
  @IsIn(['approved', 'revision'], { message: 'Choose approve or ask for a revision.' })
  status: string;

  @IsOptional() @IsString() @MaxLength(2000) @Transform(safeTrim)
  feedback?: string;
}

export class FlipChartViewDto {
  /** Seconds the chart was on screen since the last report. */
  @IsNumber() @Min(0) @Max(600)
  seconds: number;
}

export class PracticalDto {
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(6) @IsInt({ each: true }) @Min(1, { each: true }) @Max(3, { each: true })
  scores: number[];

  @IsOptional() @IsString() @MaxLength(2000) @Transform(safeTrim)
  notes?: string;
}
