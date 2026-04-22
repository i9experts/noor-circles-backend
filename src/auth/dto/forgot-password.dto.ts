import { Transform } from "class-transformer";
import { IsEmail, } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}