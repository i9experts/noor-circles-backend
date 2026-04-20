import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)                                    // exactly 6 characters
  @Matches(/^\d{6}$/, { message: 'OTP 6 digits ka hona chahiye' })
  otp: string;
}