import { IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { safeTrim } from '../common/utils/transform.util';
import { ResetPasswordDto } from '../auth/dto/auth.dto';

const PHONE_RE = /^[+]?[\d\s\-()٠-٩]{7,20}$/;

/** PATCH /users/profile — previously `body: any`, so nothing was validated (BUG-05). */
export class UpdateProfileDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Name cannot be empty.' }) @MaxLength(100) @Transform(safeTrim)
  fullName?: string;

  /** Empty string clears the phone. */
  @IsOptional() @IsString() @ValidateIf((o) => o.phone !== '')
  @Matches(PHONE_RE, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(500) @Transform(safeTrim)
  bio?: string;

  /** Empty string clears the photo; otherwise only http(s) URLs. */
  @IsOptional() @IsString() @ValidateIf((o) => o.image !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Image must be an http(s) URL.' })
  @MaxLength(2048)
  image?: string;
}

/** Same password policy as sign-up and reset (BUG-06); strings only (BUG-07). */
export class ChangePasswordDto extends ResetPasswordDto {
  @IsString({ message: 'Current password is required.' }) @IsNotEmpty({ message: 'Current password is required.' })
  currentPassword: string;
}
