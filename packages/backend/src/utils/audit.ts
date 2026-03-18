interface Queryable {
  query(text: string, params: unknown[]): Promise<unknown>;
}

interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(q: Queryable, entry: AuditEntry): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.userId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  );
}
