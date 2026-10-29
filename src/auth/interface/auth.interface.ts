export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id      : string;
  fullName: string;
  email   : string;
  role    : string;
  image  ?: string | null;
  /** The user signed in with a temporary password and must choose their own. */
  mustChangePassword?: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}
