import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateLiveSessionDto {
  @IsString()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUrl({}, { message: 'zoomLink must be a valid URL.' })
  zoomLink: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'recurringDay must be 0–6 (Sun–Sat).' })
  recurringDay?: number;

  @IsOptional()
  @IsString()
  recurringTime?: string;
}

export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'zoomLink must be a valid URL.' })
  zoomLink?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  recurringDay?: number;

  @IsOptional()
  @IsString()
  recurringTime?: string;
}
