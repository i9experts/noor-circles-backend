import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength,
  Min, ValidateNested,
} from 'class-validator';
import { VISIT_RATINGS } from './visit-checklist';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateClusterDto {
  @IsString() @IsNotEmpty({ message: 'Give the cluster a name.' }) @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsMongoId({ each: true })
  neighbourhoodIds?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsMongoId({ each: true })
  supervisorIds?: string[];

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateClusterDto extends CreateClusterDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  declare name: string;
}

export class CreateSupervisorDto {
  @IsString() @IsNotEmpty({ message: 'Full name is required.' }) @MaxLength(60)
  fullName: string;

  @IsEmail({}, { message: 'Enter a valid email address.' }) @MaxLength(120)
  email: string;

  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  /** Clusters to put them in straight away. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true })
  clusterIds?: string[];
}

export class VisitScoreDto {
  @IsString() @MaxLength(40)
  key: string;

  /** 0 needs support, 1 good, 2 strong; null = not seen. */
  @IsOptional() @IsInt() @Min(0) @Max(2)
  score?: number | null;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class CreateVisitDto {
  @IsMongoId({ message: 'Choose the circle.' })
  circleId: string;

  @Matches(DATE_RE, { message: 'Date must be YYYY-MM-DD.' })
  date: string;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  childrenPresent?: number;

  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => VisitScoreDto)
  checklist: VisitScoreDto[];

  @IsIn(VISIT_RATINGS as unknown as string[], { message: 'Choose an overall rating.' })
  overall: string;

  @IsOptional() @IsString() @MaxLength(2000)
  highlights?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  concerns?: string;

  @IsOptional() @IsBoolean()
  safeguarding?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(300, { each: true })
  followUps?: string[];
}

export class FollowUpDto {
  @IsBoolean()
  done: boolean;
}

export class StudentActiveDto {
  @IsBoolean()
  active: boolean;
}

export class ClusterAudienceDto {
  @IsMongoId({ message: 'Choose the cluster.' })
  clusterId: string;

  @IsIn(['murabbis', 'parents'], { message: 'Send to murabbis or parents.' })
  to: 'murabbis' | 'parents';
}

export class ClusterMessageDto extends ClusterAudienceDto {

  @IsString() @IsNotEmpty({ message: 'Write a subject.' }) @MaxLength(200)
  subject: string;

  @IsString() @IsNotEmpty({ message: 'Write a message.' }) @MaxLength(20000)
  body: string;

  @IsOptional() @IsBoolean()
  testOnly?: boolean;
}
