import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SaveParentJournalPageDto {
  @IsObject() answers: Record<string, unknown>;
}

export class AddParentMomentDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD.' }) date?: string;
}
