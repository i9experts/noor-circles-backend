import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

export class AssignCourseDto {
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one person.' }) @ArrayMaxSize(500)
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

  // ── Catalogue (marketplace) ────────────────────────────────────────────────

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Give the training a title.' }) @MaxLength(150) @Transform(safeTrim)
  title?: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(safeTrim)
  titleUr?: string;

  @IsOptional() @IsString() @MaxLength(500)
  summary?: string;

  @IsOptional() @IsString() @MaxLength(500)
  summaryUr?: string;

  @IsOptional() @IsString() @MaxLength(60) @Transform(safeTrim)
  category?: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  trainer?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  badge?: string;

  @IsOptional() @IsBoolean()
  published?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  position?: number;

  /** Murabbi tier this training leads to (1–3), or null. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn([1, 2, 3])
  tier?: number | null;
}

export class CreateCourseDto {
  @IsString() @IsNotEmpty({ message: 'Give the training a title.' }) @MaxLength(150) @Transform(safeTrim)
  title: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(safeTrim)
  titleUr?: string;

  @IsIn(['murabbi', 'parent'], { message: 'Choose who the training is for.' })
  audience: 'murabbi' | 'parent';

  @IsOptional() @IsString() @MaxLength(500)
  summary?: string;

  @IsOptional() @IsString() @MaxLength(60) @Transform(safeTrim)
  category?: string;
}

export class CourseSectionDto {
  @IsString() @IsNotEmpty({ message: 'Give the module a title.' }) @MaxLength(150) @Transform(safeTrim)
  title: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(safeTrim)
  titleUr?: string;

  @IsOptional() @IsString() @MaxLength(200)
  meta?: string;
}

export class UpdateCourseSectionDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) @Transform(safeTrim)
  title?: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(safeTrim)
  titleUr?: string;

  @IsOptional() @IsString() @MaxLength(200)
  meta?: string;

  @IsOptional() @IsIn(['up', 'down'])
  move?: 'up' | 'down';
}

export class CourseLessonDto {
  @IsMongoId({ message: 'Choose the module.' })
  sectionId: string;

  @IsString() @IsNotEmpty({ message: 'Give the lesson a title.' }) @MaxLength(200) @Transform(safeTrim)
  title: string;

  @IsOptional() @IsString() @MaxLength(200)
  topic?: string;

  /** The script; a blank line starts a new paragraph. */
  @IsOptional() @IsString() @MaxLength(50000)
  transcript?: string;
}

export class UpdateCourseLessonDto {
  @IsOptional() @IsMongoId()
  sectionId?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) @Transform(safeTrim)
  title?: string;

  @IsOptional() @IsString() @MaxLength(200)
  topic?: string;

  @IsOptional() @IsString() @MaxLength(50000)
  transcript?: string;

  @IsOptional() @IsIn(['up', 'down'])
  move?: 'up' | 'down';
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
