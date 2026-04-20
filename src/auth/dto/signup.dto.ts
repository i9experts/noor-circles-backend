import { IsEmail, IsString, MinLength } from 'class-validator';

// Ye class batati hai ke signup mein kya-kya aana chahiye
export class SignUpDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8) // 8 se kam hoga to error dega automatically
  password: string;
}