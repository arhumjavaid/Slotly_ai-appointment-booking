import type { NextConfig } from 'next';

/**
 * Origin of the API, proxied through this app rather than called directly.
 *
 * The session is an HttpOnly cookie. On a split deployment (Vercel frontend,
 * Render API) the two sit on different registrable domains — `vercel.app` and
 * `onrender.com` are both on the Public Suffix List — so a direct browser call
 * is cross-site and the cookie is a third-party cookie, which Chrome and Safari
 * drop by default. Routing `/api/*` through this origin makes every request
 * same-origin, so the cookie is first-party and is stored and sent normally.
 *
 * Unset (local development) means no rewrite: the frontend talks to the backend
 * directly on localhost, where both are same-site already.
 */
const backendOrigin = process.env.BACKEND_ORIGIN?.replace(/\/$/, '');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    if (!backendOrigin) return [];
    return [{ source: '/api/:path*', destination: `${backendOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
