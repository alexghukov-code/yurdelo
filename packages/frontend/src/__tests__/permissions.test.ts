import { describe, it, expect } from 'vitest';
import { can, PERMISSIONS, type Permission } from '../lib/permissions';

describe('can(role, permission)', () => {
  // ── admin: full access ──
  it('admin can do everything', () => {
    for (const perm of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can('admin', perm)).toBe(true);
    }
  });

  // ── viewer: read-only ──
  it('viewer can view cases', () => {
    expect(can('viewer', 'case:view')).toBe(true);
  });

  it('viewer cannot create cases', () => {
    expect(can('viewer', 'case:create')).toBe(false);
  });

  it('viewer cannot delete cases', () => {
    expect(can('viewer', 'case:delete')).toBe(false);
  });

  it('viewer cannot view reports', () => {
    expect(can('viewer', 'report:view')).toBe(false);
  });

  it('viewer can view documents', () => {
    expect(can('viewer', 'document:view')).toBe(true);
  });

  it('viewer cannot upload documents', () => {
    expect(can('viewer', 'document:upload')).toBe(false);
  });

  it('viewer cannot manage users', () => {
    expect(can('viewer', 'user:manage')).toBe(false);
  });

  // ── lawyer: own cases + reports ──
  it('lawyer can create cases', () => {
    expect(can('lawyer', 'case:create')).toBe(true);
  });

  it('lawyer can edit cases', () => {
    expect(can('lawyer', 'case:edit')).toBe(true);
  });

  it('lawyer cannot delete cases', () => {
    expect(can('lawyer', 'case:delete')).toBe(false);
  });

  it('lawyer can view reports', () => {
    expect(can('lawyer', 'report:view')).toBe(true);
  });

  it('lawyer can upload documents', () => {
    expect(can('lawyer', 'document:upload')).toBe(true);
  });

  it('lawyer cannot manage users', () => {
    expect(can('lawyer', 'user:manage')).toBe(false);
  });

  // ── nav permissions ──
  it('viewer sees cases/parties/calendar but not reports', () => {
    expect(can('viewer', 'nav:cases')).toBe(true);
    expect(can('viewer', 'nav:parties')).toBe(true);
    expect(can('viewer', 'nav:calendar')).toBe(true);
    expect(can('viewer', 'nav:reports')).toBe(false);
  });

  // ── unknown role ──
  it('unknown role has no access', () => {
    expect(can('guest', 'case:view')).toBe(false);
  });
});
