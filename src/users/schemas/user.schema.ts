import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ default: false })
  isEmailVerified!: boolean;

  @Prop({ default: "user" })
  role!: string;

  @Prop()
  refreshTokenHash?: string;

  @Prop()
  resetOtpHash?: string;

  @Prop()
  resetOtpExpiresAt?: Date;

  @Prop({ default: 0 })
  resetOtpAttempts!: number;
}

export const UserSchema = SchemaFactory.createForClass(User);