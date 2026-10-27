/**
 * admin_users read side for the Stafi page (/admin/stafi/, owner only). Never returns
 * password_hash. Last sign-in comes from the audit log (login_ok rows, kept 2 years), so no
 * extra column is written on every sign-in. Changes go through src/lib/auth.ts (addAccount,
 * updateAccount, resetAccountPassword), which hold the rules.
 */
import { all, get } from '../index';

export interface Account {
  id: number; email: string; name: string | null; role: 'owner' | 'staff'; created_at: string;
  /** Set when the owner disabled the account (migration 006); null = active. */
  disabled_at: string | null;
  /** Last successful sign-in (audit_log login_ok), null when none is on record. */
  last_sign_in: string | null;
}

// ts >= created_at: SQLite reuses the id of a deleted last row, and the audit log keeps the old
// account's sign-ins under it.
const COLS = `u.id, u.email, u.name, u.role, u.created_at, u.disabled_at,
  (SELECT MAX(a.ts) FROM audit_log a WHERE a.admin_id = u.id AND a.action = 'login_ok' AND a.ts >= u.created_at) AS last_sign_in`;

/** Owners first, then by name / e-mail. */
export const listAccounts = () =>
  all<Account>(`SELECT ${COLS} FROM admin_users u ORDER BY u.disabled_at IS NOT NULL, u.role = 'staff', COALESCE(u.name, u.email) COLLATE NOCASE`);

export const getAccount = (id: number) => get<Account>(`SELECT ${COLS} FROM admin_users u WHERE u.id = ?`, id);

export const emailTaken = (email: string) => !!get('SELECT 1 FROM admin_users WHERE email = ? COLLATE NOCASE', email.trim());

/** Active owners other than `exceptId`: an account may lose the owner role only while this is ≥ 1. */
export const otherActiveOwners = (exceptId: number) =>
  Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND disabled_at IS NULL AND id != ?", exceptId)?.n ?? 0);
