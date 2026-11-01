import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';

export class AdjustParentRatingDto {
  @IsInt() @Min(-20, { message: 'Adjustment must be between −20 and +20.' }) @Max(20, { message: 'Adjustment must be between −20 and +20.' })
  adjustment: number;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  note?: string;
}
