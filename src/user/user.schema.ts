import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false }) // Never returned in queries by default
  password: string;

  @Prop({ type: [String], default: [] })
  refreshTokens: string[];

  @Prop({ type: String, default: null, select: false })
  otpCode: string | null;

  @Prop({ type: Date, default: null, select: false })
  otpExpiresAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Ensure password and sensitive fields are never accidentally leaked
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.otpCode;
    delete ret.otpExpiresAt;
    delete ret.__v;
    return ret;
  },
});