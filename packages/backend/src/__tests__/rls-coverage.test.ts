/**
 * Static verification: all user-facing route files use getDb (RLS-aware pool).
 * This test catches the bug where a route file uses raw `db` pool,
 * bypassing RLS context (app.current_user_id / app.current_user_role).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES_DIR = resolve(__dirname, '../routes');

// Route files that MUST use getDb for RLS enforcement
const RLS_REQUIRED = [
  'cases.ts',
  'parties.ts',
  'users.ts',
  'stages.ts',
  'hearings.ts',
  'transfers.ts',
  'documents.ts',
  'notifications.ts',
  'reports.ts',
];

// Route files that are exempt from RLS
const RLS_EXEMPT = ['health.ts', 'auth.ts'];

describe('RLS coverage: all user-facing routes use getDb', () => {
  for (const file of RLS_REQUIRED) {
    it(`${file} imports getDb`, () => {
      const content = readFileSync(resolve(ROUTES_DIR, file), 'utf-8');
      expect(content).toContain("from '../utils/db.js'");
    });

    it(`${file} destructures db as rawDb`, () => {
      const content = readFileSync(resolve(ROUTES_DIR, file), 'utf-8');
      expect(content).toContain('db: rawDb');
    });

    it(`${file} calls getDb(req, rawDb)`, () => {
      const content = readFileSync(resolve(ROUTES_DIR, file), 'utf-8');
      expect(content).toContain('getDb(req, rawDb)');
    });
  }

  for (const file of RLS_EXEMPT) {
    it(`${file} is exempt from RLS (no getDb)`, () => {
      const content = readFileSync(resolve(ROUTES_DIR, file), 'utf-8');
      expect(content).not.toContain('getDb(req');
    });
  }
});
