import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Step 1 — OTP maango */
export class SignupRequestOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @IsEmail({}, { message: 'Valid email required.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Z])/, { message: 'Must contain at least one uppercase letter.' })
  @Matches(/(?=.*[0-9])/, { message: 'Must contain at least one number.' })
  password: string;
}

/** Step 2 — OTP verify karo → account banta hai */
export class SignupVerifyOtpDto {
  @IsEmail({}, { message: 'Valid email required.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits.' })
  otp: string;
}