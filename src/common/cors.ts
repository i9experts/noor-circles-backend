import type { Request } from 'express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Public endpoints that any website may call from a browser. They require
 * no login and are rate-limited, so they don't depend on the caller's origin
 * being listed in FRONTEND_URL. (The landing page's interest form was
 * silently blocked by CORS when its domain wasn't in that list.)
 */
const PUBLIC_PATHS = [
  /^\/api\/v1\/interest\/?(\?.*)?$/,
  /^\/api\/v1\/contributions\/public\/checkout\/?(\?.*)?$/,
];

const BASE: CorsOptions = {
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/**
 * CORS per request: the configured portal origins (with credentials) for
 * everything, plus any origin, without credentials, for the public form
 * endpoint's POST and its preflight.
 */
export function buildCorsDelegate(allowedOrigins: string[]) {
  return (
    req: Request,
    callback: (err: Error | null, options: CorsOptions) => void,
  ) => {
    const method = (req.method || '').toUpperCase();
    const isPublic =
      (method === 'POST' || method === 'OPTIONS') &&
      PUBLIC_PATHS.some((re) => re.test(req.originalUrl || req.url || ''));

    callback(
      null,
      isPublic
        ? { ...BASE, origin: true, credentials: false }
        : { ...BASE, origin: allowedOrigins, credentials: true },
    );
  };
}
