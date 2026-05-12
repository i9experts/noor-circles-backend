import {
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ── Murabbi ───────────────────────────────────────────────────────────────────

export class CreateMurabbiDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(60, { message: 'Full name must be at most 60 characters.' })
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(64, { message: 'Password must be at most 64 characters.' })
  @Matches(/(?=.*[A-Z])/, { message: 'Password must contain at least one uppercase letter.' })
  @Matches(/(?=.*[0-9])/, { message: 'Password must contain at least one number.' })
  password: string;
}

// ── Neighbourhood ─────────────────────────────────────────────────────────────

export class CreateNeighbourhoodDto {
  @IsString()
  @IsNotEmpty({ message: 'Neighbourhood name is required.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'City must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  city?: string;
}

export class UpdateNeighbourhoodDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'City must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  city?: string;
}

// ── Circle ────────────────────────────────────────────────────────────────────

export class CreateCircleDto {
  @IsString()
  @IsNotEmpty({ message: 'Circle name is required.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsMongoId({ message: 'Invalid neighbourhood ID.' })
  neighbourhoodId: string;

  @IsMongoId({ message: 'Invalid murabbi ID.' })
  murabbiId: string;

  @IsOptional()
  @IsNumber({}, { message: 'Capacity must be a number.' })
  @Min(1, { message: 'Capacity must be at least 1.' })
  capacity?: number;
}

export class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MaxLength(100, { message: 'Name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
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
}

// ── Student ───────────────────────────────────────────────────────────────────

export class EnrollStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(100, { message: 'Full name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Father name is required.' })
  @MaxLength(100, { message: 'Father name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  fatherName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid ISO date.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(({ value }) => value?.trim())
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
  @Transform(({ value }) => value?.trim())
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Father name cannot be empty.' })
  @MaxLength(100, { message: 'Father name must be at most 100 characters.' })
  @Transform(({ value }) => value?.trim())
  fatherName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid ISO date.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must be at most 200 characters.' })
  @Transform(({ value }) => value?.trim())
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
  @Transform(({ value }) => value?.trim())
  fullName?: string;
}
