import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN = 'admin',
  MURABBI = 'murabbi',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true, maxlength: 60 })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.MURABBI })
  role: UserRole;

  /** false = OTP pending  |  true = active account */
  @Prop({ type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: String, default: null, trim: true })
  phone: string | null;

  @Prop({ type: String, default: null, maxlength: 500 })
  bio: string | null;

  @Prop({ type: [String], default: [], select: false })
  refreshTokens: string[];

  /** OTP stored as PLAIN STRING (not hashed) */
  @Prop({ type: String, default: null, select: false })
  otpCode: string | null;

  @Prop({ type: Date, default: null, select: false })
  otpExpiresAt: Date | null;

  /** Temp data before email verified */
  @Prop({ type: Object, default: null, select: false })
  pendingSignup: { fullName: string; password: string } | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Never leak sensitive fields in API responses
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.otpCode;
    delete ret.otpExpiresAt;
    delete ret.pendingSignup;
    delete ret.__v;
    return ret;
  },
});
