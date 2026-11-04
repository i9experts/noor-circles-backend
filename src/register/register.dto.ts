import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { FOLLOW_UP_STATUSES, NOTE_KINDS } from './register.schema';

export class UpdateFollowUpDto {
  @IsOptional() @IsIn(FOLLOW_UP_STATUSES) status?: string;
  /** 'YYYY-MM-DD', or null to clear. */
  @IsOptional() @ValidateIf((o) => o.nextDate !== null) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Next date must be YYYY-MM-DD.' })
  nextDate?: string | null;
}

export class AddFollowUpNoteDto extends UpdateFollowUpDto {
  @IsIn(NOTE_KINDS) kind: string;
  @IsString() @MaxLength(2000) text: string;
}
