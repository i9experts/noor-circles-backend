import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;  // hidden — frontend localStorage se bhejega

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP 6 digits ka hona chahiye' })
  otp: string;
}