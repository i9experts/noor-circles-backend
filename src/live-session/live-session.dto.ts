import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  @ValidateIf((o) => o.isRecurring === true || o.recurringDay !== undefined)
  @IsNumber({}, { message: 'recurringDay is required for a recurring session (0–6, Sun–Sat).' })
  @IsIn([0, 1, 2, 3, 4, 5, 6], { message: 'recurringDay must be 0–6 (Sun–Sat).' })
  recurringDay?: number;

  /** "HH:MM", 24-hour, Pakistan time. Required for recurring sessions (BUG-45). */
  @ValidateIf((o) => o.isRecurring === true || o.recurringTime !== undefined)
  @IsString({ message: 'recurringTime is required for a recurring session (HH:MM).' })
  @Matches(HHMM, { message: 'recurringTime must be HH:MM (24-hour), e.g. 19:30.' })
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

  /** "HH:MM", 24-hour, Pakistan time (BUG-45). */
  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'recurringTime must be HH:MM (24-hour), e.g. 19:30.' })
  recurringTime?: string;
}
