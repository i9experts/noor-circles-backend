import {
  IsDateString, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
  IsEmail, ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { safeEmail, safeTrim } from '../common/utils/transform.util';
import { MONTH_RE } from '../common/utils/month.util';
import {
  CONTRIBUTOR_STATUSES, CONTRIBUTOR_TYPES, FREQUENCIES, MANUAL_METHODS, MIN_MONTHLY_PLEDGE, PAYMENT_METHODS,
} from './contribution.schema';

const PHONE_RE = /^[+]?[\d\s\-()٠-٩]{7,20}$/;
const MAX_PKR  = 10_000_000;

export class CreateContributorDto {
  @IsIn(CONTRIBUTOR_TYPES, { message: 'Type must be parent or supporter.' })
  type: string;

  /** Required for type=parent; name/phone default from the parent record. */
  @ValidateIf((o) => o.type === 'parent')
  @IsMongoId({ message: 'Select the parent this contribution belongs to.' })
  parentId?: string;

  @ValidateIf((o) => o.type === 'supporter')
  @IsString() @IsNotEmpty({ message: 'Full name is required.' }) @MaxLength(100) @Transform(safeTrim)
  fullName?: string;

  @IsOptional() @IsEmail({}, { message: 'Invalid email address.' }) @Transform(safeEmail)
  email?: string;

  @IsOptional() @IsString() @Matches(PHONE_RE, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional() @IsIn(FREQUENCIES)
  frequency?: string;

  @IsInt({ message: 'Monthly contribution must be a whole number of rupees.' })
  @Min(MIN_MONTHLY_PLEDGE, { message: `Minimum monthly contribution is PKR ${MIN_MONTHLY_PLEDGE}.` })
  @Max(MAX_PKR)
  monthlyPledge: number;

  @IsOptional() @Matches(MONTH_RE, { message: 'Start month must be YYYY-MM.' })
  startMonth?: string;

  @IsOptional() @IsIn(PAYMENT_METHODS)
  preferredMethod?: string;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  notes?: string;
}

export class UpdateContributorDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) @Transform(safeTrim)
  fullName?: string;

  @IsOptional() @IsEmail({}, { message: 'Invalid email address.' }) @Transform(safeEmail)
  email?: string;

  @IsOptional() @IsString() @Matches(PHONE_RE, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsInt({ message: 'Monthly contribution must be a whole number of rupees.' })
  @Min(MIN_MONTHLY_PLEDGE, { message: `Minimum monthly contribution is PKR ${MIN_MONTHLY_PLEDGE}.` })
  @Max(MAX_PKR)
  monthlyPledge?: number;

  @IsOptional() @IsIn(CONTRIBUTOR_STATUSES)
  status?: string;

  @IsOptional() @IsIn(PAYMENT_METHODS)
  preferredMethod?: string;

  @IsOptional() @IsString() @MaxLength(1000) @Transform(safeTrim)
  notes?: string;
}

export class RecordPaymentDto {
  @IsMongoId({ message: 'Select a contributor.' })
  contributorId: string;

  @IsInt({ message: 'Amount must be a whole number of rupees.' }) @Min(1) @Max(MAX_PKR)
  amount: number;

  @Matches(MONTH_RE, { message: 'Month must be YYYY-MM.' })
  month: string;

  @IsIn(MANUAL_METHODS, { message: 'Method must be cash, bank_transfer, jazzcash, easypaisa or other.' })
  method: string;

  @IsOptional() @IsString() @MaxLength(120) @Transform(safeTrim)
  reference?: string;

  @IsOptional() @IsDateString({}, { message: 'Received date must be a valid date.' })
  receivedAt?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  notes?: string;
}

export class UpdatePaymentDto {
  @IsIn(['refunded', 'void'], { message: 'A payment can only be marked refunded or void.' })
  status: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  notes?: string;
}

/** Public "Support Noor Circles" form on the landing page. */
export class PublicCheckoutDto {
  @IsString() @IsNotEmpty({ message: 'Full name is required.' }) @MaxLength(100) @Transform(safeTrim)
  fullName: string;

  @IsEmail({}, { message: 'Please provide a valid email address.' }) @Transform(safeEmail)
  email: string;

  @IsString() @Matches(PHONE_RE, { message: 'Invalid phone number format.' })
  phone: string;

  @IsInt({ message: 'Amount must be a whole number of rupees.' })
  @Min(MIN_MONTHLY_PLEDGE, { message: `The minimum contribution is PKR ${MIN_MONTHLY_PLEDGE}.` })
  @Max(MAX_PKR)
  amount: number;

  @IsIn(FREQUENCIES, { message: 'Choose monthly or one-time.' })
  frequency: string;

  /** Honeypot — must stay empty. */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}
