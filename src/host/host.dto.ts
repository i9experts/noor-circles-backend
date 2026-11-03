import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { SPACE_STATUSES, SPACE_TYPES } from './host.content';

class AvailabilityDto {
  @IsInt() @Min(0) @Max(6) day: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Times must be HH:MM.' }) from: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Times must be HH:MM.' }) to: string;
}

/** What a host can change about their own space. */
export class HostSpaceDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Give your space a name.' }) @MaxLength(100) name?: string;
  @IsOptional() @IsIn(SPACE_TYPES.map((t) => t.value)) type?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) area?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) capacity?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) facilities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(21) @ValidateNested({ each: true }) @Type(() => AvailabilityDto) availability?: AvailabilityDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsUrl({ require_tld: false }, { each: true, message: 'Each photo must be an uploaded image link.' }) photos?: string[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AdminSpaceDto extends HostSpaceDto {
  @IsOptional() @IsIn(SPACE_STATUSES) status?: (typeof SPACE_STATUSES)[number];
  @IsOptional() @IsMongoId() neighbourhoodId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) adminNotes?: string;
}

export class CreateSpaceDto extends HostSpaceDto {
  @IsMongoId() hostId: string;
  @IsOptional() @IsMongoId() neighbourhoodId?: string;
}

export class UnavailableDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD.' }) date: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

class VisitItemDto {
  @IsString() key: string;
  @IsBoolean() ok: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class VisitDto {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => VisitItemDto) checklist: VisitItemDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsIn(['approve', 'changes', 'decline']) recommendation: 'approve' | 'changes' | 'decline';
}

export class HostCheckDto {
  @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) answers: number[];
}

export class VenueDto {
  @IsOptional() @IsMongoId() spaceId?: string | null;
}
