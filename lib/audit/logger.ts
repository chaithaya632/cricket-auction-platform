// =============================================================================
// ACC Auction Portal — Centralized Audit Logger
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditLogEntry {
  seasonId?: string | null;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog(
  entry: AuditLogEntry,
  client?: SupabaseClient
): Promise<void> {
  try {
    const supabase = client || createAdminClient();
    await supabase.from('audit_logs').insert({
      season_id: entry.seasonId ?? null,
      actor_user_id: entry.actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to write audit log entry:', err);
  }
}
