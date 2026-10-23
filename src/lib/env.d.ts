/// <reference types="astro/client" />
// Request-scoped values set by src/middleware.ts (T1).
declare namespace App {
  interface Locals {
    /** 'sq' at the root, 'en' under /en/. */
    lang: 'sq' | 'en';
    /** Signed-in admin (null when not signed in). */
    admin: import('./auth').AdminUser | null;
    /** True when the request came over https (direct or via a trusted proxy). */
    https: boolean;
  }
}
