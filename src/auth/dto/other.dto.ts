import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Valid email required.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

export class VerifyOtpDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits.' })
  otp: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Z])/, { message: 'Must contain at least one uppercase letter.' })
  @Matches(/(?=.*[0-9])/, { message: 'Must contain at least one number.' })
  newPassword: string;
}

export class ResendOtpDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}