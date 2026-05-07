import {
  IsEmail, IsNotEmpty, IsString,
  Matches, MaxLength, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

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