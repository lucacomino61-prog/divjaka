/**
 * Load the project's .env into process.env (keys already set in the environment win).
 * Imported first by src/middleware.ts so POK_*, ANTHROPIC_API_KEY, TRUST_PROXY etc. work the
 * same in `astro dev` and in `node dist/server/entry.mjs` without extra flags. Secrets stay
 * server-side: nothing here is exposed to import.meta.env or the browser.
 */
import fs from 'node:fs';
import path from 'node:path';

const G = globalThis as unknown as { __dvEnvLoaded?: boolean };
if (!G.__dvEnvLoaded) {
  G.__dvEnvLoaded = true;
  try {
    const file = path.join(process.cwd(), '.env');
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!m || line.trim().startsWith('#')) continue;
        const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
    }
  } catch (e) {
    console.warn('[env] could not read .env', (e as Error)?.message);
  }
}

export {};
