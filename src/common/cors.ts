import type { Request } from 'express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Public endpoints that any website may call from a browser. They require
 * no login and are rate-limited, so they don't depend on the caller's origin
 * being listed in FRONTEND_URL. (The landing page's interest form was
 * silently blocked by CORS when its domain wasn't in that list.)
 */
const PUBLIC: { method: 'GET' | 'POST'; path: RegExp }[] = [
  { method: 'POST', path: /^\/api\/v1\/interest\/?(\?.*)?$/ },
  { method: 'POST', path: /^\/api\/v1\/contributions\/public\/checkout\/?(\?.*)?$/ },
  // The interest form's city / area lists and "Use my location".
  { method: 'GET', path: /^\/api\/v1\/places(\/reverse)?\/?(\?.*)?$/ },
];

const BASE: CorsOptions = {
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/**
 * CORS per request: the configured portal origins (with credentials) for
 * everything, plus any origin, without credentials, for the public
 * endpoints above (and their preflights).
 */
export function buildCorsDelegate(allowedOrigins: string[]) {
  return (
    req: Request,
    callback: (err: Error | null, options: CorsOptions) => void,
  ) => {
    const method = (req.method || '').toUpperCase();
    // A preflight asks about the method it will use next.
    const wanted = method === 'OPTIONS'
      ? String(req.headers['access-control-request-method'] || '').toUpperCase()
      : method;
    const url = req.originalUrl || req.url || '';
    const isPublic = PUBLIC.some((p) => (p.method === wanted || (p.method === 'GET' && wanted === 'HEAD')) && p.path.test(url));

    callback(
      null,
      isPublic
        ? { ...BASE, origin: true, credentials: false }
        : { ...BASE, origin: allowedOrigins, credentials: true },
    );
  };
}
