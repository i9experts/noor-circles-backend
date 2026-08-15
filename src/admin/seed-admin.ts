/**
 * Admin Seed Script
 * Runs automatically as a Railway pre-deploy step (node dist/admin/seed-admin.js)
 * after `npm run build` compiles this file. Idempotent: creates the admin if
 * missing, or syncs the password/role on an existing account if ADMIN_EMAIL
 * already exists — so updating ADMIN_PASSWORD in Railway and redeploying is
 * enough to rotate the admin password without manual DB access.
 */

import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const email    = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  process.exit(1);
}

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
    console.error('❌  MONGODB_URI missing.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  const UserModel =
    mongoose.models['User'] || mongoose.model('User', UserSchema);

  const normalizedEmail = (email as string).toLowerCase();
  const hashedPassword = await bcrypt.hash(password as string, 12);

  const existing = await UserModel.findOne({ email: normalizedEmail } as any);

  if (existing) {
    existing.set({
      password       : hashedPassword,
      role           : 'admin',
      isEmailVerified: true,
      isActive       : true,
    });
    await existing.save();
    console.log(`🔄  Existing admin synced: ${normalizedEmail}`);
  } else {
    await UserModel.create({
      fullName       : 'Admin',
      email          : normalizedEmail,
      password       : hashedPassword,
      role           : 'admin',
      isEmailVerified: true,
      isActive       : true,
    });
    console.log(`✅  Admin created: ${normalizedEmail}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
