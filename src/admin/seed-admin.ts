/**
 * Admin Seed Script
 * Run: npx ts-node -r tsconfig-paths/register src/admin/seed-admin.ts
 */

import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const ADMIN = {
  fullName: 'Admin',
  email   : process.env.ADMIN_EMAIL    || 'ahad.aptech1@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Admin@123',
};

const UserSchema = new mongoose.Schema(
  {
    fullName       : String,
    email          : { type: String, unique: true, lowercase: true },
    password       : String,
    role           : { type: String, default: 'admin' },
    isEmailVerified: { type: Boolean, default: true },
    isActive       : { type: Boolean, default: true },
    refreshTokens  : { type: [String], default: [] },
    otpCode        : { type: String, default: null },
    otpExpiresAt   : { type: Date, default: null },
  },
  { timestamps: true },
);

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  // Prevent model re-registration error if run multiple times in watch mode
  const UserModel =
    mongoose.models['User'] || mongoose.model('User', UserSchema);

  const existing = await UserModel.findOne({ email: ADMIN.email.toLowerCase() } as any);
  if (existing) {
    console.log(`⚠️   Admin already exists: ${ADMIN.email}`);
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN.password, 12);

  await UserModel.create({
    fullName       : ADMIN.fullName,
    email          : ADMIN.email.toLowerCase(),
    password       : hashedPassword,
    role           : 'admin',
    isEmailVerified: true,
    isActive       : true,
  });

  console.log('');
  console.log('✅  Admin seeded successfully!');
  console.log(`   Email   : ${ADMIN.email}`);
  console.log(`   Password: ${ADMIN.password}`);
  console.log('');
  console.log('⚠️   IMPORTANT: Change the password after first login!');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
