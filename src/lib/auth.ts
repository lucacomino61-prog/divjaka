/**
 * Admin authentication.
 *  - Passwords: scrypt (N=16384, r=8, p=1, 64-byte key), stored as
 *    'scrypt$16384$8$1$<salt b64url>$<hash b64url>' (scripts/seed.mjs writes the same format).
 *  - Sessions: 32 random bytes in the cookie `dv_admin`; only sha256(token) is stored.
 *    HttpOnly, SameSite=Strict, Path=/, Secure on https and in every production build.
 *    14 days, renewed on use.
 *  - Login throttle: src/lib/security.ts loginGate (per address+e-mail, per address, per e-mail,
 *    sitewide). Known devices: a successful sign-in also sets `dv_device` (180 days, Path
 *    /api/admin/login, only sha256 stored in admin_devices); attempts carrying it for the same
 *    account skip the account lock, so guessers cannot lock the owner out.
 *  - Roles: requireAdmin (owner or staff), requireOwner (settings, payment details, prices,
 *    offers, customer export/erasure).
 */
import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { all, get, run } from './db/index';
import { nowIso } from './time';
import { ApiError, E } from './http';
import { rateLimit } from './security';
import { audit } from './audit';

export const COOKIE = 'dv_admin';
const TTL_MS = 14 * 24 * 3600 * 1000;
const RENEW_AFTER_MS = 3600 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface AdminUser { id: number; email: string; name: string | null; role: 'owner' | 'staff'; created_at: string }

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const got = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Check credentials; constant work whether or not the e-mail exists. */
export function checkCredentials(email: string, password: string): AdminUser | null {
  const row = get<AdminUser & { password_hash: string }>('SELECT * FROM admin_users WHERE email = ? COLLATE NOCASE', email.trim());
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;
  const { password_hash: _h, ...user } = row;
  return user;
}

/**
 * Secure flag: on https requests, and ALWAYS in a production build (TLS usually ends at the
 * proxy, so the app sees http). COOKIE_SECURE=0 turns it off for a plain-http production test
 * on a LAN address (browsers already accept Secure cookies on http://localhost).
 */
export const secureCookies = (https: boolean): boolean => https || (!import.meta.env.DEV && process.env.COOKIE_SECURE !== '0');

function cookieOpts(secure: boolean, expires: Date) {
  return { httpOnly: true, sameSite: 'strict' as const, path: '/', secure: secureCookies(secure), expires };
}

/** A session never lives longer than this from sign-in, however often it is used. */
const ABSOLUTE_MS = 30 * 24 * 3600 * 1000;

export function createSession(userId: number, cookies: AstroCookies, secure: boolean): void {
  // The session the browser already carries (if any) ends here: a sign-in never leaves an old,
  // possibly stolen, token alive next to the new one.
  const old = cookies.get(COOKIE)?.value;
  if (old && old.length <= 100) run('DELETE FROM admin_sessions WHERE token_hash = ?', sha256(old));
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const exp = new Date(now.getTime() + TTL_MS);
  run('INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)', sha256(token), userId, now.toISOString(), exp.toISOString(), now.toISOString());
  run('DELETE FROM admin_sessions WHERE expires_at < ?', now.toISOString());
  cookies.set(COOKIE, token, cookieOpts(secure, exp));
}

/** Resolve the session cookie to a user; renews expiry (sliding 14 days, at most 30 days from sign-in). */
export function sessionUser(cookies: AstroCookies, secure: boolean): AdminUser | null {
  const token = cookies.get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const h = sha256(token);
  const s = get<{ user_id: number; created_at: string; expires_at: string; last_seen: string }>('SELECT user_id, created_at, expires_at, last_seen FROM admin_sessions WHERE token_hash = ?', h);
  if (!s) return null;
  const now = Date.now();
  const hardEnd = Date.parse(s.created_at) + ABSOLUTE_MS;
  if (Date.parse(s.expires_at) <= now || hardEnd <= now) {
    run('DELETE FROM admin_sessions WHERE token_hash = ?', h);
    return null;
  }
  const user = get<AdminUser>('SELECT id, email, name, role, created_at FROM admin_users WHERE id = ?', s.user_id);
  if (!user) return null;
  if (now - Date.parse(s.last_seen) > RENEW_AFTER_MS) {
    const exp = new Date(Math.min(now + TTL_MS, hardEnd));
    run('UPDATE admin_sessions SET expires_at = ?, last_seen = ? WHERE token_hash = ?', exp.toISOString(), new Date(now).toISOString(), h);
    cookies.set(COOKIE, token, cookieOpts(secure, exp));
  }
  return user;
}

export function destroySession(cookies: AstroCookies, secure: boolean): void {
  const token = cookies.get(COOKIE)?.value;
  if (token) run('DELETE FROM admin_sessions WHERE token_hash = ?', sha256(token));
  cookies.delete(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: secureCookies(secure) });
}

export function requireAdmin(locals: App.Locals): AdminUser {
  if (!locals.admin) throw E.unauthorized();
  return locals.admin;
}

/** Owner-only actions: settings (payment details), prices, offers, customer export/erasure. */
export function requireOwner(locals: App.Locals): AdminUser {
  const u = requireAdmin(locals);
  if (u.role !== 'owner') throw E.forbidden('Vetëm pronari mund ta bëjë këtë.', 'Only the owner can do this.');
  return u;
}

/* ---------------- known devices ---------------- */

export const DEVICE_COOKIE = 'dv_device';
const DEVICE_TTL_MS = 180 * 24 * 3600 * 1000;
const DEVICE_PATH = '/api/admin/login';

/** Remember this browser for the user (called after a successful sign-in). */
export function rememberDevice(userId: number, cookies: AstroCookies, secure: boolean): void {
  const now = new Date();
  const exp = new Date(now.getTime() + DEVICE_TTL_MS);
  const cur = cookies.get(DEVICE_COOKIE)?.value;
  if (cur && cur.length <= 100) {
    const r = run('UPDATE admin_devices SET last_seen = ?, expires_at = ? WHERE token_hash = ? AND user_id = ?', now.toISOString(), exp.toISOString(), sha256(cur), userId);
    if (r.changes) {
      cookies.set(DEVICE_COOKIE, cur, { httpOnly: true, sameSite: 'strict', path: DEVICE_PATH, secure: secureCookies(secure), expires: exp });
      return;
    }
  }
  const token = crypto.randomBytes(32).toString('base64url');
  run('INSERT INTO admin_devices (token_hash, user_id, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?)', sha256(token), userId, now.toISOString(), now.toISOString(), exp.toISOString());
  run('DELETE FROM admin_devices WHERE expires_at < ?', now.toISOString());
  // At most 20 remembered browsers per user: the oldest are forgotten.
  run('DELETE FROM admin_devices WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM admin_devices WHERE user_id = ? ORDER BY last_seen DESC LIMIT 20)', userId, userId);
  cookies.set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: DEVICE_PATH, secure: secureCookies(secure), expires: exp });
}

/** True when the request carries a valid known-device cookie for the admin with this e-mail. */
export function isKnownDevice(cookies: AstroCookies, email: string): boolean {
  const token = cookies.get(DEVICE_COOKIE)?.value;
  if (!token || token.length > 100) return false;
  const row = get<{ expires_at: string }>(
    'SELECT d.expires_at FROM admin_devices d JOIN admin_users u ON u.id = d.user_id WHERE d.token_hash = ? AND u.email = ? COLLATE NOCASE',
    sha256(token), email.trim(),
  );
  return !!row && Date.parse(row.expires_at) > Date.now();
}

/**
 * Re-authentication for sensitive actions (password change, payment details): the signed-in
 * user types their password again. A stolen session cookie alone is not enough, and guessing
 * through this door is throttled like the login: 5 checks per user and 10 per address in 15
 * minutes (429 before any hashing), every failure audited, and after 5 failures in a row every
 * session of that user is ended (the owner signs in again; the guesser's cookie is dead).
 */
const REAUTH_WINDOW = 15 * 60_000;
const reauthFails = new Map<number, number>();

export function reauthenticate(user: AdminUser, password: string | undefined | null, ip: string, action: string): void {
  if (!password) throw new ApiError(400, 'password_required', 'Shkruani fjalëkalimin tuaj për ta konfirmuar.', 'Type your password to confirm.');
  rateLimit('reauth', String(user.id), 5, REAUTH_WINDOW);
  rateLimit('reauth-ip', ip, 10, REAUTH_WINDOW);
  const row = get<{ password_hash: string }>('SELECT password_hash FROM admin_users WHERE id = ?', user.id);
  if (row && verifyPassword(password, row.password_hash)) {
    reauthFails.delete(user.id);
    return;
  }
  const n = (reauthFails.get(user.id) ?? 0) + 1;
  reauthFails.set(user.id, n);
  audit('reauth_fail', { adminId: user.id, ip, detail: { action, failures: n } });
  if (n >= 5) {
    reauthFails.delete(user.id);
    run('DELETE FROM admin_sessions WHERE user_id = ?', user.id);
    audit('reauth_lockout', { adminId: user.id, ip, detail: { action } });
    throw E.unauthorized();
  }
  throw new ApiError(400, 'bad_password', 'Fjalëkalimi aktual është i gabuar.', 'The current password is wrong.');
}

export function changePassword(userId: number, current: string, next: string): boolean {
  const row = get<{ password_hash: string }>('SELECT password_hash FROM admin_users WHERE id = ?', userId);
  if (!row || !verifyPassword(current, row.password_hash)) return false;
  run('UPDATE admin_users SET password_hash = ? WHERE id = ?', hashPassword(next), userId);
  run('DELETE FROM admin_sessions WHERE user_id = ?', userId);
  // A password change forgets every remembered browser too (a stolen device cookie dies with it).
  run('DELETE FROM admin_devices WHERE user_id = ?', userId);
  return true;
}

export const listAdmins = () => all<AdminUser>('SELECT id, email, name, role, created_at FROM admin_users ORDER BY id');
export const createAdmin = (email: string, password: string, name: string | null, role: 'owner' | 'staff' = 'owner') =>
  run('INSERT INTO admin_users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', email.trim().toLowerCase(), name, hashPassword(password), role, nowIso()).id;
