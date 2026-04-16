/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  displayPic?: string;

  @IsOptional()
  @IsNumber()
  level?: number;

  @IsOptional()
  @IsNumber()
  currentXp?: number;

  @IsOptional()
  @IsNumber()
  totalXp?: number;

  @IsOptional()
  @IsNumber()
  gem?: number;

  @IsOptional()
  @IsNumber()
  diamond?: number;

  @IsOptional()
  @IsNumber()
  coin?: number;

  @IsOptional()
  @IsNumber()
  totalMatch?: number;

  @IsOptional()
  @IsNumber()
  won?: number;

  @IsOptional()
  @IsNumber()
  lost?: number;

  @IsOptional()
  @IsNumber()
  kills?: number;

  @IsOptional()
  @IsNumber()
  death?: number;

  @IsOptional()
  @IsNumber()
  assists?: number;

  @IsOptional()
  @IsNumber()
  hours?: number;

  @IsOptional()
  @IsArray()
  availableSkill?: string[];
}
