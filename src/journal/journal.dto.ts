import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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

  /** OK to show my name if the team features this moment. */
  @IsOptional() @IsBoolean()
  shareName?: boolean;
}

export class UpdateMomentDto {
  @IsBoolean()
  shareName: boolean;
}

export class FeatureMomentDto {
  @IsBoolean()
  featured: boolean;
}

export class JournalReminderDto {
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one murabbi.' }) @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  userIds: string[];

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
