/* eslint-disable prettier/prettier */
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
// import { AuthProvider } from "../../user/schema/user.schema"

export class SocialLoginDto {
  authProvider: string;
  token: string;
}
