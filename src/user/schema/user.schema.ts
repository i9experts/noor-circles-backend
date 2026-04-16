import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string; // bcrypt hash

  // ── OTP for password reset ─────────────────────────────────────────────────
  @Prop({ default: null })
  otpCode: string | null;

  @Prop({ default: null })
  otpExpiresAt: Date | null;

  // ── Refresh tokens (allow multiple devices) ────────────────────────────────
  @Prop({ type: [String], default: [] })
  refreshTokens: string[]; // store hashed refresh tokens
}

export const UserSchema = SchemaFactory.createForClass(User);