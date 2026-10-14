/**
 * Shared bootstrap for the end-to-end suite.
 *
 * Boots the real AppModule (every controller, guard, pipe, filter and
 * interceptor) against a real MongoDB, with exactly two seams replaced:
 *   - MailService  → captures OTPs in memory instead of sending SMTP mail
 *   - ThrottlerStorage → never blocks, so the suite isn't rate-limited
 *     (throttling itself is covered separately in platform.e2e-spec.ts)
 *
 * Requires a reachable MongoDB. Set E2E_MONGODB_URI (defaults to a local
 * mongod on 27017). Each spec file gets its own throwaway database.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

export const API = '/api/v1';
export const PORTAL_ORIGIN = 'http://portal.e2e.test';
export const ADMIN_EMAIL = 'admin@e2e.test';
export const ADMIN_PASSWORD = 'AdminPass123';
export const DEFAULT_PASSWORD = 'Password123';

export interface SentMail {
  to: string;
  otp: string;
  type: 'signup' | 'reset';
}

export interface E2EContext {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  db: Connection;
  mails: SentMail[];
  lastOtp: (email: string) => string | undefined;
  close: () => Promise<void>;
}

export function setTestEnv(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'e2e-access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    JWT_RESET_SECRET: 'e2e-reset-secret',
    JWT_RESET_EXPIRES_IN: '10m',
    MAIL_HOST: '127.0.0.1',
    MAIL_PORT: '2525',
    MAIL_USER: 'e2e',
    MAIL_PASS: 'e2e',
    MAIL_FROM: 'noreply@e2e.test',
    FRONTEND_URL: 'http://localhost:5173',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    GREEN_API_INSTANCE_ID: '',
    GREEN_API_TOKEN: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
  };
  Object.assign(process.env, base, overrides);
}

export async function createApp(
  dbName: string,
  opts: { env?: Record<string, string>; realThrottler?: boolean } = {},
): Promise<E2EContext> {
  const baseUri = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017';
  setTestEnv({
    MONGODB_URI: `${baseUri.replace(/\/$/, '')}/noor_e2e_${dbName}`,
    ...opts.env,
  });

  // Imported lazily so ConfigModule.forRoot() sees the env set above.
  const { AppModule } = await import('../../src/app.module');
  const { MailService } = await import('../../src/mail/mail.service');
  const { HttpExceptionFilter } =
    await import('../../src/common/filters/http-exception.filter');
  const { ResponseInterceptor } =
    await import('../../src/common/interceptors/response.interceptor');

  const mails: SentMail[] = [];
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      sendOtp: (to: string, otp: string, type: 'signup' | 'reset') => {
        mails.push({ to, otp, type });
        return Promise.resolve();
      },
    });
  if (!opts.realThrottler) {
    builder = builder.overrideProvider(ThrottlerStorage).useValue({
      increment: () =>
        Promise.resolve({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  // Mirrors src/main.ts bootstrap (minus helmet/compression/morgan/swagger).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const { buildCorsDelegate } = await import('../../src/common/cors');
  app.enableCors(buildCorsDelegate([PORTAL_ORIGIN]));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();

  const db = app.get<Connection>(getConnectionToken());
  await db.dropDatabase();
  // Dropping the DB also drops the indexes Mongoose built at startup —
  // rebuild them so unique constraints behave exactly as in production.
  await Promise.all(db.modelNames().map((n) => db.model(n).syncIndexes()));
  await seedAdmin(db);

  return {
    app,
    db,
    mails,
    http: () => request(app.getHttpServer()),
    lastOtp: (email) => [...mails].reverse().find((m) => m.to === email)?.otp,
    close: async () => {
      await db.dropDatabase();
      await app.close();
    },
  };
}

async function seedAdmin(db: Connection) {
  await db.collection('users').insertOne({
    fullName: 'Test Admin',
    email: ADMIN_EMAIL,
    password: await bcrypt.hash(ADMIN_PASSWORD, 4),
    role: 'admin',
    isEmailVerified: true,
    isActive: true,
    tier: 1,
    refreshTokens: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function signIn(ctx: E2EContext, email: string, password: string) {
  const res = await ctx
    .http()
    .post(`${API}/auth/signin`)
    .send({ email, password });
  if (res.status !== 200)
    throw new Error(
      `signin ${email} failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Admin creates a murabbi and returns its id + access token. */
export async function createMurabbi(
  ctx: E2EContext,
  adminToken: string,
  email: string,
  fullName = 'Murabbi ' + email,
) {
  const res = await ctx
    .http()
    .post(`${API}/admin/murabbis`)
    .set(bearer(adminToken))
    .send({ fullName, email, password: DEFAULT_PASSWORD });
  if (res.status !== 201)
    throw new Error(
      `createMurabbi failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  const login = await signIn(ctx, email, DEFAULT_PASSWORD);
  return {
    id: String(res.body.data.murabbi.id),
    token: login.accessToken,
    refreshToken: login.refreshToken,
  };
}

/**
 * Standard fixture: 1 neighbourhood, 2 murabbis (A, B), one circle each,
 * one student enrolled in each circle.
 */
export async function seedWorld(ctx: E2EContext, tag = '') {
  const admin = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD);
  const A = await createMurabbi(
    ctx,
    admin.accessToken,
    `a${tag}@e2e.test`,
    'Murabbi A',
  );
  const B = await createMurabbi(
    ctx,
    admin.accessToken,
    `b${tag}@e2e.test`,
    'Murabbi B',
  );

  const nbh = await ctx
    .http()
    .post(`${API}/admin/neighbourhoods`)
    .set(bearer(admin.accessToken))
    .send({ name: `Gulshan${tag}`, city: 'Karachi' });
  const nbhId = nbh.body.data.neighbourhood._id;

  const mkCircle = async (name: string, murabbiId: string, capacity = 30) => {
    const r = await ctx
      .http()
      .post(`${API}/admin/circles`)
      .set(bearer(admin.accessToken))
      .send({ name, neighbourhoodId: nbhId, murabbiId, capacity });
    return r.body.data.circle._id as string;
  };
  const circleA = await mkCircle(`Circle A${tag}`, A.id);
  const circleB = await mkCircle(`Circle B${tag}`, B.id);

  const mkStudent = async (fullName: string, circleId: string) => {
    const r = await ctx
      .http()
      .post(`${API}/admin/students/enroll`)
      .set(bearer(admin.accessToken))
      .send({
        fullName,
        fatherName: 'Father',
        phone: '03001234567',
        circleId,
        neighbourhoodId: nbhId,
      });
    return r.body.data.student._id as string;
  };
  const studentA = await mkStudent('Student A', circleA);
  const studentB = await mkStudent('Student B', circleB);

  return {
    admin: admin.accessToken,
    A,
    B,
    nbhId,
    circleA,
    circleB,
    studentA,
    studentB,
    mkCircle,
    mkStudent,
  };
}

export const BAD_ID = 'not-an-object-id';
export const MISSING_ID = '64b7f0000000000000000000';
