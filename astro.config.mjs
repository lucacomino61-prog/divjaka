// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Albanian is served at the root, English under /en/. Routes are file-based
// with localized slugs (see src/i18n/routes.ts), so Astro's i18n router is not used.
export default defineConfig({
  site: 'https://divjaka.example',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  server: { port: 3800, host: '127.0.0.1' },
  devToolbar: { enabled: false },
  // T1: Astro's own cross-site form check compares the Origin with url.origin, which is
  // http://localhost:PORT in production behind a proxy, and answers in text/plain before any
  // middleware runs. src/middleware.ts does the same check against the real public origin
  // (src/lib/security.ts isForbiddenCrossSiteForm) and answers /api/* in the JSON error shape.
  security: { checkOrigin: false },
  vite: {
    server: {
      watch: { ignored: ['**/data/**', '**/raw/**', '**/research/**', '**/tests/**', '**/tools/**'] },
      // T1: the dev server must never hand out the database (customers, password hashes, order
      // tokens), uploads, the schema or secrets. Vite's own defaults are repeated because this
      // list replaces them.
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.dev.vars*', '**/data/**', '**/*.db', '**/*.db-*', '**/db/*.sql', '**/db/migrations/**'] },
    },
    build: {
      // T1: keep processed <script>s as /_astro/*.js files instead of inlining small ones, so the
      // production CSP can allow them as 'self' and hash only the authored is:inline scripts
      // (src/lib/csp.ts). Other assets keep Vite's default 4 KB rule.
      assetsInlineLimit: (file) => (/\.(m?js|ts)$/.test(file) ? false : undefined),
    },
  },
});
