/**
 * Database: Node's built-in SQLite (node:sqlite, synchronous).
 *
 * - File: data/divjaka.db (override with env DIVJAKA_DB). Folder created on first open.
 * - WAL, foreign keys, busy_timeout so the dev server, the built server and the seed script
 *   can share the file.
 * - db/schema.sql is applied on every boot (it is idempotent), then any db/migrations/NNN-*.sql
 *   whose number is not yet in schema_version. scripts/seed.mjs does exactly the same.
 * - tx(fn) runs fn inside BEGIN IMMEDIATE (nested calls become SAVEPOINTs). fn must be
 *   synchronous: no await inside a transaction, so two requests can never interleave.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import schemaSql from '../../../db/schema.sql?raw';

const migrationFiles = import.meta.glob('../../../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export type Param = SQLInputValue;
export type Row = Record<string, unknown>;

export function dataDir(): string {
  return path.resolve(process.env.DIVJAKA_DATA || path.join(process.cwd(), 'data'));
}

export function dbPath(): string {
  return path.resolve(process.env.DIVJAKA_DB || path.join(dataDir(), 'divjaka.db'));
}

function migrate(conn: DatabaseSync): void {
  conn.exec(schemaSql);
  const done = new Set(
    (conn.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map((r) => r.version),
  );
  const list = Object.entries(migrationFiles)
    .map(([file, sql]) => {
      const name = path.basename(file, '.sql');
      const version = Number(name.split('-')[0]);
      return { name, version, sql };
    })
    .filter((m) => Number.isInteger(m.version) && m.version > 1 && !done.has(m.version))
    .sort((a, b) => a.version - b.version);
  for (const m of list) {
    conn.exec('BEGIN IMMEDIATE');
    try {
      // Another process (dev server, built server, seed) may have applied it while we waited.
      if (conn.prepare('SELECT 1 FROM schema_version WHERE version = ?').get(m.version)) {
        conn.exec('COMMIT');
        continue;
      }
      conn.exec(m.sql);
      conn.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, new Date().toISOString());
      conn.exec('COMMIT');
    } catch (e) {
      conn.exec('ROLLBACK');
      throw e;
    }
  }
}

function open(): DatabaseSync {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file, { timeout: 5000 });
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('PRAGMA synchronous = NORMAL');
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec('PRAGMA busy_timeout = 5000');
  migrate(conn);
  return conn;
}

// One connection per process; kept on globalThis so Vite SSR reloads in dev reuse it. A reload
// may bring new migration files, so the (idempotent, cheap) migrate step runs on every module
// evaluation, not only when the connection is opened.
const G = globalThis as unknown as { __dvDb?: DatabaseSync; __dvStmts?: Map<string, StatementSync> };
export const db: DatabaseSync = G.__dvDb ?? (G.__dvDb = open());
if (G.__dvStmts) migrate(db);
const stmts: Map<string, StatementSync> = G.__dvStmts ?? (G.__dvStmts = new Map());

function stmt(sql: string): StatementSync {
  let s = stmts.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmts.set(sql, s);
  }
  return s;
}

/** All rows. Parameters are always bound (never interpolated). */
export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return stmt(sql).all(...params) as T[];
}

/** First row or undefined. */
export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return stmt(sql).get(...params) as T | undefined;
}

/** Run a write. Returns changes and the new rowid as numbers. */
export function run(sql: string, ...params: Param[]): { changes: number; id: number } {
  const r = stmt(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

let depth = 0;

/** Run fn in one transaction (BEGIN IMMEDIATE). Rolls back and rethrows on error. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) {
    const sp = `sp_${depth}`;
    db.exec(`SAVEPOINT ${sp}`);
    depth++;
    try {
      const r = fn();
      db.exec(`RELEASE ${sp}`);
      return r;
    } catch (e) {
      db.exec(`ROLLBACK TO ${sp}`);
      db.exec(`RELEASE ${sp}`);
      throw e;
    } finally {
      depth--;
    }
  }
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    if (r && typeof (r as { then?: unknown }).then === 'function') {
      throw new Error('tx(fn): fn must be synchronous');
    }
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally {
    depth--;
  }
}

/** JSON column helpers. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (v: unknown): string => JSON.stringify(v ?? null);

/** True when SQLite refused a write because of a CHECK / trigger / UNIQUE constraint. */
export function isConstraintError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e);
  return /constraint|over_capacity/i.test(msg);
}
