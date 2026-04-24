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

  /** 
   * true = OTP verify pending (account abhi active nahi)
   * false = verified account
   */
  @Prop({ type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [], select: false })
  refreshTokens: string[];

  @Prop({ type: String, default: null, select: false })
  otpCode: string | null;

  @Prop({ type: Date, default: null, select: false })
  otpExpiresAt: Date | null;

  /** Signup ke waqt temporarily store karta hai data jab tak OTP verify na ho */
  @Prop({ type: Object, default: null, select: false })
  pendingSignup: { fullName: string; password: string } | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

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