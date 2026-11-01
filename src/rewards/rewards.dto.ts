import { IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';
import { MONTH_RE } from '../common/utils/month.util';
import { PAYOUT_METHODS } from './rewards.schema';

export class CreatePoolDto {
  @Matches(MONTH_RE, { message: 'Month must be YYYY-MM.' })
  month: string;

  @IsIn(['fixed', 'percent'], { message: 'Budget mode must be fixed or percent.' })
  budgetMode: string;

  /** PKR for fixed, 0–100 for percent (validated in the service). */
  @IsInt({ message: 'Budget must be a whole number.' }) @Min(0) @Max(10_000_000)
  budgetValue: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  studentSharePct?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxStudents?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxMurabbis?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  minMurabbiScore?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  parentSharePct?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxParents?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  minParentScore?: number;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  notes?: string;
}

export class UpdatePoolDto {
  @IsOptional() @IsIn(['fixed', 'percent'])
  budgetMode?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  budgetValue?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  studentSharePct?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxStudents?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxMurabbis?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  minMurabbiScore?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  parentSharePct?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  maxParents?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  minParentScore?: number;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  notes?: string;
}

export class AddAllocationDto {
  @IsIn(['student', 'murabbi', 'parent'])
  recipientType: string;

  @IsMongoId({ message: 'Select a recipient.' })
  recipientId: string;

  @IsInt() @Min(0) @Max(10_000_000)
  amount: number;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  notes?: string;
}

export class UpdateAllocationDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  amount?: number;

  @IsOptional() @IsIn(['proposed', 'cancelled'], { message: 'Status can be set to proposed or cancelled here.' })
  status?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  notes?: string;
}

export class PayAllocationDto {
  @IsIn(PAYOUT_METHODS, { message: 'Choose how the reward was given.' })
  method: string;

  @IsOptional() @IsString() @MaxLength(120) @Transform(safeTrim)
  reference?: string;

  @IsOptional() @IsDateString()
  paidAt?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  notes?: string;
}
