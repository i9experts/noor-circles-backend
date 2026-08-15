/**
 * Admin Seed Script (plain JS — runs at deploy time with production deps only)
 *
 * The original src/admin/seed-admin.ts requires ts-node + tsconfig-paths,
 * which are devDependencies and get pruned from the production install.
 * Running `npm run seed:admin` via Railway's preDeployCommand therefore
 * silently failed (command not found) — no admin was ever created, and no
 * error surfaced in deploy logs because the failure happens before Nest's
 * logger initializes. This script uses only real runtime dependencies
 * (mongoose, bcrypt) so it works in the production image as-is.
 *
 * Run: node scripts/seed-admin.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const uri = process.env.MONGODB_URI;

if (!email || !password) {
  console.error('❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  process.exit(1);
}
if (!uri) {
  console.error('❌  MONGODB_URI missing.');
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    fullName: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    role: { type: String, default: 'admin' },
    isEmailVerified: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    refreshTokens: { type: [String], default: [] },
    otpCode: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

async function seed() {
  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  const UserModel = mongoose.models['User'] || mongoose.model('User', UserSchema);
  const normalizedEmail = email.toLowerCase();

  const existing = await UserModel.findOne({ email: normalizedEmail });

  if (existing) {
    // Sync role/active/verified flags and reset the password to match the
    // current ADMIN_PASSWORD env var, in case this is a re-run after a
    // credential change rather than a first-time seed.
    const hashedPassword = await bcrypt.hash(password, 12);
    existing.password = hashedPassword;
    existing.role = 'admin';
    existing.isEmailVerified = true;
    existing.isActive = true;
    await existing.save();
    console.log(`🔄  Existing admin found — password/role synced: ${normalizedEmail}`);
  } else {
    const hashedPassword = await bcrypt.hash(password, 12);
    await UserModel.create({
      fullName: 'Admin',
      email: normalizedEmail,
      password: hashedPassword,
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });
    console.log(`✅  Admin created: ${normalizedEmail}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
