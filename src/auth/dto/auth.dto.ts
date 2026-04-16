import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ── 1. SignUp ──────────────────────────────────────────────────────────────────
// Used by: SignUpPage.tsx
export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  password: string;
}

// ── 2. SignIn ──────────────────────────────────────────────────────────────────
// Used by: SignInPage.tsx
export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

// ── 3. ForgotPassword ─────────────────────────────────────────────────────────
// Used by: ForgotPasswordPage.tsx
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

// ── 4. VerifyOtp ──────────────────────────────────────────────────────────────
// Used by: VerifyOtpPage.tsx
export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit number' })
  otp: string;
}

// ── 5. ResetPassword ──────────────────────────────────────────────────────────
// Used by: ResetPasswordPage.tsx
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  newPassword: string;
}

// ── 6. RefreshToken ───────────────────────────────────────────────────────────
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}