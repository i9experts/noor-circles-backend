import { IsMongoId, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SaveJournalPageDto {
  /** { fieldKey: text } — unknown keys are ignored. */
  @IsObject()
  answers: Record<string, string>;
}

export class AddMomentDto {
  @IsString() @IsNotEmpty({ message: 'Write the moment first.' }) @MaxLength(1500)
  text: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD.' })
  date?: string;

  @IsOptional() @IsMongoId()
  circleId?: string;
}
