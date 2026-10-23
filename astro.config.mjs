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
  vite: {
    server: {
      watch: { ignored: ['**/data/**', '**/raw/**', '**/research/**', '**/tests/**', '**/tools/**'] },
    },
  },
});
