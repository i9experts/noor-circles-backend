import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Ye type TypeScript ko batata hai ke Document mein kya fields hain
export type UserDocument = User & Document;

@Schema({ timestamps: true }) // createdAt, updatedAt automatically add hoga
export class User {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string; // hashed password store hoga

  @Prop({ type: [String], default: [] })
  refreshTokens: string[];


    @Prop({ default: null })
  otpCode: string | null;

  @Prop({ default: null })
  otpExpiresAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);