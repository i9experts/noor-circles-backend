// forgot-password.dto.ts
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Valid email required.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}