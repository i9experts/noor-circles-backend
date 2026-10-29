import { IsBoolean, IsEmail, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConvertInterestDto {
  /** Murabbis only: assign the Asaas training straight away. */
  @IsOptional() @IsBoolean()
  assignTraining?: boolean;
}

export class CreateParentAccountDto {
  /** Needed when the parent record has no email yet. */
  @IsOptional() @IsEmail({}, { message: 'Enter a valid email address.' }) @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;
}

export class AccountAccessDto {
  @IsBoolean()
  active: boolean;
}
