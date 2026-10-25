import {
  ValidateIf,
  IsIn,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { safeEmail, safeTrim } from '../common/utils/transform.util';

// ── Murabbi ───────────────────────────────────────────────────────────────────

export class CreateMurabbiDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(60, { message: 'Full name must be at most 60 characters.' })
  @Transform(safeTrim)
  fullName: string;

  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(safeEmail)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(64, { message: 'Password must be at most 64 characters.' })
  @Matches(/(?=.*[A-Z])/, { message: 'Password must contain at least one uppercase letter.' })
  @Matches(/(?=.*[0-9])/, { message: 'Password must contain at least one number.' })
  password: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(safeTrim)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Image URL too long.' })
  @Transform(safeTrim)
  image?: string;
}

// ── Neighbourhood ─────────────────────────────────────────────────────────────

export class CreateNeighbourhoodDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  name: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  city?: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  area?: string;

  @IsOptional() @IsString() @MaxLength(300) @Transform(safeTrim)
  mosques?: string;

  @IsOptional() @IsString()
  status?: 'active' | 'review' | 'inactive';
}

export class UpdateNeighbourhoodDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  name?: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  city?: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  area?: string;

  @IsOptional() @IsString() @MaxLength(300) @Transform(safeTrim)
  mosques?: string;

  @IsOptional() @IsString()
  status?: 'active' | 'review' | 'inactive';
}

export class CreatePipelineDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  name: string;

  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim)
  area?: string;

  @IsOptional() @IsString() @MaxLength(200) @Transform(safeTrim)
  mosqueContact?: string;

  @IsOptional() @IsNumber() @Min(1)
  targetCircles?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  interestLevel?: number;

  @IsOptional() @IsString()
  status?: 'prospecting' | 'in-talks' | 'ready-to-launch';
}

export class UpdatePipelineDto {
  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim) name?: string;
  @IsOptional() @IsString() @MaxLength(100) @Transform(safeTrim) area?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(safeTrim) mosqueContact?: string;
  @IsOptional() @IsNumber() @Min(1) targetCircles?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) interestLevel?: number;
  @IsOptional() @IsIn(['prospecting', 'in-talks', 'ready-to-launch'], { message: 'Status must be prospecting, in-talks or ready-to-launch.' })
  status?: 'prospecting' | 'in-talks' | 'ready-to-launch';
}

// ── Circle ────────────────────────────────────────────────────────────────────

export class CreateCircleDto {
  @IsString()
  @IsNotEmpty({ message: 'Circle name is required.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(safeTrim)
  name: string;

  @IsMongoId({ message: 'Invalid neighbourhood ID.' })
  neighbourhoodId: string;

  @IsMongoId({ message: 'Invalid murabbi ID.' })
  murabbiId: string;

  @IsOptional()
  @IsNumber({}, { message: 'Capacity must be a number.' })
  @Min(1, { message: 'Capacity must be at least 1.' })
  capacity?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsMongoId({ message: 'Invalid syllabus track.' })
  trackId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'Meeting day must be 0–6 (Sunday–Saturday).' })
  meetingDay?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Meeting time must be HH:MM (24-hour).' })
  meetingTime?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be YYYY-MM-DD.' })
  startDate?: string | null;
}

export class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(safeTrim)
  name?: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid neighbourhood ID.' })
  neighbourhoodId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid murabbi ID.' })
  murabbiId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Capacity must be a number.' })
  @Min(1, { message: 'Capacity must be at least 1.' })
  capacity?: number;

  /** Deactivate / reactivate a circle (BUG-17). */
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false.' })
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsMongoId({ message: 'Invalid syllabus track.' })
  trackId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'Meeting day must be 0–6 (Sunday–Saturday).' })
  meetingDay?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Meeting time must be HH:MM (24-hour).' })
  meetingTime?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be YYYY-MM-DD.' })
  startDate?: string | null;
}

// ── Student ───────────────────────────────────────────────────────────────────

export class EnrollStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(100, { message: 'Full name must be at most 100 characters.' })
  @Transform(safeTrim)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Father name is required.' })
  @MaxLength(100, { message: 'Father name must be at most 100 characters.' })
  @Transform(safeTrim)
  fatherName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enrollment date must be a valid ISO date.' })
  enrollmentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(safeTrim)
  address?: string;

  @IsMongoId({ message: 'Invalid circle ID.' })
  circleId: string;

  @IsMongoId({ message: 'Invalid neighbourhood ID.' })
  neighbourhoodId: string;
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty.' })
  @MaxLength(100, { message: 'Full name must be at most 100 characters.' })
  @Transform(safeTrim)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Father name cannot be empty.' })
  @MaxLength(100, { message: 'Father name must be at most 100 characters.' })
  @Transform(safeTrim)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid ISO date.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(safeTrim)
  address?: string;
}

export class AssignCircleDto {
  @IsMongoId({ message: 'Invalid circle ID.' })
  circleId: string;
}

// ── Update Murabbi ─────────────────────────────────────────────────────────────

export class UpdateMurabbiDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty.' })
  @MaxLength(60, { message: 'Full name must be at most 60 characters.' })
  @Transform(safeTrim)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(safeTrim)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Image URL too long.' })
  @Transform(safeTrim)
  image?: string;
}
