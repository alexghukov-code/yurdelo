/**
 * Centralized UI permission map.
 *
 * Each key is an action; its value is the list of roles allowed to perform it.
 * Ownership checks (e.g. "lawyer can edit only own case") are handled
 * separately in page code — this map covers role-level access only.
 */
export const PERMISSIONS = {
  'case:view':       ['admin', 'lawyer', 'viewer'],
  'case:create':     ['admin', 'lawyer'],
  'case:edit':       ['admin', 'lawyer'],
  'case:delete':     ['admin'],

  'party:view':      ['admin', 'lawyer', 'viewer'],
  'party:create':    ['admin', 'lawyer'],
  'party:edit':      ['admin', 'lawyer'],
  'party:delete':    ['admin'],

  'stage:create':    ['admin', 'lawyer'],
  'stage:delete':    ['admin'],

  'hearing:create':  ['admin', 'lawyer'],
  'hearing:delete':  ['admin'],

  'document:view':   ['admin', 'lawyer', 'viewer'],
  'document:upload': ['admin', 'lawyer'],
  'document:delete': ['admin', 'lawyer'],

  'report:view':     ['admin', 'lawyer'],

  'user:manage':     ['admin'],

  'nav:cases':       ['admin', 'lawyer', 'viewer'],
  'nav:parties':     ['admin', 'lawyer', 'viewer'],
  'nav:calendar':    ['admin', 'lawyer', 'viewer'],
  'nav:reports':     ['admin', 'lawyer'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}
