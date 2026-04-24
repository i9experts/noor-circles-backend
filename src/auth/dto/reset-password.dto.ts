// reset-password.dto.ts
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Z])/, { message: 'Must contain at least one uppercase letter.' })
  @Matches(/(?=.*[0-9])/, { message: 'Must contain at least one number.' })
  newPassword: string;
}