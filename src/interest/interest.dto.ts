import {
  IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FamilyProfileDto } from '../insights/family-profile';
import { safeEmail, safeTrim } from '../common/utils/transform.util';
import { INTEREST_ROLES, INTEREST_STATUSES } from './interest.schema';

export class LocationDto {
  @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @IsNumber() @Min(-180) @Max(180)
  lng: number;
}

export class CreateInterestDto {
  @IsIn(INTEREST_ROLES, { message: 'Role must be parent, mentor or host.' })
  role: string;

  @IsString() @IsNotEmpty({ message: 'First name is required.' }) @MaxLength(60) @Transform(safeTrim)
  firstName: string;

  @IsString() @IsNotEmpty({ message: 'Last name is required.' }) @MaxLength(60) @Transform(safeTrim)
  lastName: string;

  @IsEmail({}, { message: 'Please provide a valid email address.' }) @MaxLength(120) @Transform(safeEmail)
  email: string;

  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsString() @IsNotEmpty({ message: 'City is required.' }) @MaxLength(80) @Transform(safeTrim)
  city: string;

  @IsString() @IsNotEmpty({ message: 'Neighbourhood is required.' }) @MaxLength(100) @Transform(safeTrim)
  neighbourhood: string;

  @IsOptional() @IsString() @MaxLength(80) @Transform(safeTrim)
  roleDetail?: string;

  @IsOptional() @IsString() @MaxLength(80) @Transform(safeTrim)
  district?: string;

  @IsOptional() @IsString() @MaxLength(80) @Transform(safeTrim)
  province?: string;

  /** From "Use my location" (stored rounded to about 1 km). */
  @IsOptional() @ValidateNested() @Type(() => LocationDto)
  location?: LocationDto;

  /** Parents only: the optional "about your family" answers. */
  @IsOptional() @ValidateNested() @Type(() => FamilyProfileDto)
  profile?: FamilyProfileDto;

  /**
   * Honeypot. Hidden from people on the landing page, so it should always
   * arrive empty; bots that fill every field get a fake success.
   */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

export class UpdateInterestDto {
  @IsOptional() @IsIn(INTEREST_STATUSES, { message: 'Status must be new, contacted or closed.' })
  status?: string;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  notes?: string;
}
