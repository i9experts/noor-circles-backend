// src/services/auth.service.ts

const BASE = process.env.API_URL || 'http://localhost:3000/api/v1';

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Something went wrong.');
  return data as T;
}

// ── Signup ───────────────────────────────────────────────────────────────────

export const signupRequestOtp = (body: {
  fullName: string;
  email: string;
  password: string;
}) => request('/auth/signup/request-otp', { method: 'POST', body: JSON.stringify(body) });

export const signupVerifyOtp = (body: { email: string; otp: string }) =>
  request<{ accessToken: string; refreshToken: string; user: AuthUser }>(
    '/auth/signup/verify-otp',
    { method: 'POST', body: JSON.stringify(body) },
  );

// ── Signin ───────────────────────────────────────────────────────────────────

export const signin = (body: { email: string; password: string }) =>
  request<{ accessToken: string; refreshToken: string; user: AuthUser }>(
    '/auth/signin',
    { method: 'POST', body: JSON.stringify(body) },
  );

// ── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPassword = (email: string) =>
  request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const verifyOtp = (body: { email: string; otp: string }) =>
  request<{ resetToken: string }>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const resetPassword = (resetToken: string, newPassword: string) =>
  request('/auth/reset-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resetToken}` },
    body: JSON.stringify({ newPassword }),
  });

// ── Resend OTP ───────────────────────────────────────────────────────────────

export const resendOtp = (email: string, type: 'signup' | 'reset') =>
  request(`/auth/resend-otp?type=${type}`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

// ── Token Refresh ────────────────────────────────────────────────────────────

export const refreshTokens = (refreshToken: string) =>
  request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshToken}` },
  });

// ── Me ───────────────────────────────────────────────────────────────────────

export const getMe = (accessToken: string) =>
  request<AuthUser>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'murabbi';
}