import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class QuizAnswersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsInt({ each: true }) @Min(0, { each: true }) @Max(9, { each: true })
  answers: number[];
}

export class SelfCheckDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsInt({ each: true }) @Min(0, { each: true }) @Max(3, { each: true })
  answers: number[];
}

export class TargetTickDto {
  @IsInt() @Min(0) @Max(31)
  slot: number;

  @IsBoolean()
  on: boolean;
}

export class TargetLighterDto {
  @IsBoolean()
  lighter: boolean;
}

export class AssignParentsDto {
  /** Specific parent accounts; leave out (with all: true) for every parent account. */
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsMongoId({ each: true })
  userIds?: string[];

  @IsOptional() @IsBoolean()
  all?: boolean;
}

export class ParentAccessDto {
  @IsBoolean()
  allOpen: boolean;
}
