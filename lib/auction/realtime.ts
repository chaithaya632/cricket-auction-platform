// =============================================================================
// ACC Auction Portal — Server-Side Realtime Broadcast Helper
// =============================================================================
// Sends a Supabase Realtime Broadcast notification to all connected clients
// after a successful auction mutation. Used exclusively in Server Actions.
//
// STRICT CONSTRAINTS:
// - Server-only. NEVER imported by Client Components.
// - Broadcast failure NEVER rolls back a successful database transaction.
// - Payload contains ZERO sensitive data (no mobile numbers, credentials, or full rows).
// - Uses admin client's channel.send() for httpSend broadcast.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Broadcasts an auction update notification to all connected clients on the
 * `acc-auction-{seasonId}` channel. This triggers `router.refresh()` on
 * receiving clients, which fetches authoritative state from the server.
 *
 * MUST be called ONLY AFTER a successful database mutation.
 * Broadcast failure is logged but NEVER propagated to the caller.
 */
export async function broadcastAuctionUpdate(
  seasonId: string,
  eventType: string
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const channelName = `acc-auction-${seasonId}`;
    const channel = adminClient.channel(channelName);

    await channel.send({
      type: 'broadcast',
      event: 'auction_update',
      payload: {
        type: eventType,
        seasonId,
        timestamp: new Date().toISOString(),
      },
    });

    // Clean up the server-side channel after sending
    await adminClient.removeChannel(channel);
  } catch (err) {
    // Broadcast failure MUST NEVER fail the parent Server Action.
    // The database mutation already succeeded — clients will catch up
    // via the fallback heartbeat polling.
    console.error(
      `[broadcastAuctionUpdate] Non-fatal broadcast error for season ${seasonId}, event ${eventType}:`,
      err
    );
  }
}
