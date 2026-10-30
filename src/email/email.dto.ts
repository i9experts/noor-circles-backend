import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AUDIENCE_TYPES } from './email.schema';

export class AudienceDto {
  @IsIn(AUDIENCE_TYPES as unknown as string[], { message: 'Choose who to send to.' })
  type: string;

  /** Circle, neighbourhood or cluster ids. */
  @IsOptional() @IsArray() @IsMongoId({ each: true })
  ids?: string[];

  @IsOptional() @IsInt() @Min(1) @Max(3)
  tier?: number;

  /** Asaas training status: not-started | in-progress | not-certified | certified. */
  @IsOptional() @IsIn(['not-started', 'in-progress', 'not-certified', 'certified'])
  status?: string;

  /** Chosen families (Parent Insights): "p:<parentId>" or "i:<interestId>". */
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @Matches(/^[pi]:[a-f\d]{24}$/i, { each: true, message: 'Invalid family.' })
  families?: string[];
}

export class EmailPreviewDto {
  @IsString() @IsNotEmpty({ message: 'Add a subject.' }) @MaxLength(200)
  subject: string;

  @IsString() @IsNotEmpty({ message: 'Write the message.' }) @MaxLength(20000)
  body: string;
}

export class CampaignDto extends EmailPreviewDto {
  @ValidateNested() @Type(() => AudienceDto)
  audience: AudienceDto;

  /** ISO date-time; leave out to send now. */
  @IsOptional() @IsString()
  scheduledFor?: string;

  /** Send only to me, to check how it looks. */
  @IsOptional() @IsBoolean()
  testOnly?: boolean;
}

export class PreferencesDto {
  @IsObject()
  on: Record<string, boolean>;
}

export class UnsubscribeDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  token: string;

  @IsOptional() @IsBoolean()
  subscribe?: boolean;
}
