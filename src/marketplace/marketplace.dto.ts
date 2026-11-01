import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

export class TrainingRequestDto {
  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  note?: string;
}

export class ApproveRequestDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Due date must be YYYY-MM-DD.' })
  dueDate?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  note?: string;
}

export class DeclineRequestDto {
  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  reason?: string;
}

export class TierUpgradeDto {
  @IsIn([1, 2, 3])
  tier: number;
}
