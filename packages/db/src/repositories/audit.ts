import { desc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLogs, type AuditLogRow } from '../schema.js';

/** Keys never written to an audit row, whatever a caller passes. */
const FORBIDDEN_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'apikey'];

export class AuditRepository {
  constructor(private readonly db: Database) {}

  /**
   * Record an administrative action.
   *
   * Metadata is filtered before it is stored, so an audit log can never become
   * the place a secret leaks.
   */
  async record(input: {
    actorId?: string | null;
    guildId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogRow> {
    const rows = await this.db
      .insert(auditLogs)
      .values({
        actorId: input.actorId ?? null,
        guildId: input.guildId ?? null,
        action: input.action,
        metadata: input.metadata ? safeMetadata(input.metadata) : null,
      })
      .returning();
    return rows[0]!;
  }

  async listForGuild(guildId: string, limit = 50): Promise<AuditLogRow[]> {
    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.guildId, guildId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }
}

export function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowered = key.toLowerCase();
    if (FORBIDDEN_KEYS.some((forbidden) => lowered.includes(forbidden))) continue;
    output[key] = typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  }
  return output;
}
