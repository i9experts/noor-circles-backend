import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class VisionPointDto {
  @IsString() @MaxLength(120) en: string;
  @IsOptional() @IsString() @MaxLength(120) ur?: string;
  @IsOptional() @IsString() @MaxLength(300) detailEn?: string;
}

export class UpdateFounderDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) titleEn?: string;
  @IsOptional() @IsString() @MaxLength(100) titleUr?: string;
  @IsOptional() @IsString() @MaxLength(200) taglineEn?: string;
  @IsOptional() @IsString() @MaxLength(200) taglineUr?: string;
  /** An uploaded photo's URL, or '' for the bundled photo. */
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsUrl({ require_protocol: true }, { message: 'Photo must be a full link.' }) @MaxLength(500) photo?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsUrl({ require_protocol: true }, { message: 'Blog link must start with https://' }) @MaxLength(300) blogUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) quoteEn?: string;
  @IsOptional() @IsString() @MaxLength(300) quoteUr?: string;
  @IsOptional() @IsString() @MaxLength(8000) storyEn?: string;
  @IsOptional() @IsString() @MaxLength(8000) storyUr?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => VisionPointDto) vision?: VisionPointDto[];
  @IsOptional() @IsString() @MaxLength(4000) messageParentsUr?: string;
  @IsOptional() @IsString() @MaxLength(4000) messageParentsEn?: string;
  @IsOptional() @IsString() @MaxLength(4000) messageMurabbisEn?: string;
  @IsOptional() @IsString() @MaxLength(4000) messageMurabbisUr?: string;
}
