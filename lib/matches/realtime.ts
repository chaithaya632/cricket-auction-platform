// =============================================================================
// ACC Match System — Server-Side Realtime Broadcast Helper
// =============================================================================
// Sends a Supabase Realtime Broadcast notification to all connected match viewers
// and scorers after a successful match mutation. Used exclusively in Server Actions.
//
// STRICT CONSTRAINTS:
// - Server-only. NEVER imported by Client Components.
// - Broadcast failure NEVER rolls back a successful database transaction.
// - Payload contains ZERO sensitive data (no credentials, personal info, or full rows).
// - Uses admin client's channel.send() for httpSend broadcast.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';
import type { MatchEventType } from './types';

/**
 * Broadcasts a match update notification to all connected clients on the
 * `acc-match-{matchId}` channel. This triggers `router.refresh()` on
 * receiving clients, which fetches authoritative state from the server.
 *
 * MUST be called ONLY AFTER a successful database mutation.
 * Broadcast failure is logged but NEVER propagated to the caller.
 */
export async function broadcastMatchUpdate(
  matchId: string,
  eventType: MatchEventType,
  extraPayload?: Record<string, unknown>
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const channelName = `acc-match-${matchId}`;
    const channel = adminClient.channel(channelName);

    await channel.send({
      type: 'broadcast',
      event: 'match_update',
      payload: {
        type: eventType,
        matchId,
        timestamp: new Date().toISOString(),
        ...extraPayload,
      },
    });

    // Clean up the server-side channel after sending
    await adminClient.removeChannel(channel);
  } catch (err) {
    // Broadcast failure MUST NEVER fail the parent Server Action.
    // The database mutation already succeeded — clients will catch up
    // via fallback refresh or page navigation.
    console.error(
      `[broadcastMatchUpdate] Non-fatal broadcast error for match ${matchId}, event ${eventType}:`,
      err
    );
  }
}
