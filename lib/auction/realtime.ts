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
import type { AuctionBroadcastPayload } from './types';

/**
 * Broadcasts an auction update notification to all connected clients on the
 * `acc-auction-{seasonId}` channel. Carries authoritative state deltas for
 * instantaneous UI updates, and triggers background `router.refresh()`.
 *
 * MUST be called ONLY AFTER a successful database mutation.
 * Broadcast failure is logged but NEVER propagated to the caller.
 */
export async function broadcastAuctionUpdate(
  seasonId: string,
  eventType: string,
  payloadData?: Partial<AuctionBroadcastPayload>
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const channelName = `acc-auction-${seasonId}`;
    const channel = adminClient.channel(channelName);

    const now = new Date().toISOString();
    const correlationId =
      payloadData?.correlationId ||
      `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const payload: AuctionBroadcastPayload = {
      version: 2,
      type: eventType,
      seasonId,
      serverTimestamp: now,
      correlationId,
      timestamp: now,
      ...(payloadData || {}),
    };

    // Ensure socket authorization token is present for direct broadcast HTTP transport
    if (channel && (channel as any).socket) {
      if (!(channel as any).socket.accessTokenValue && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        (channel as any).socket.accessTokenValue = process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    }

    if (typeof (channel as any).httpSend === 'function') {
      await (channel as any).httpSend('auction_update', payload);
    } else {
      await channel.send({
        type: 'broadcast',
        event: 'auction_update',
        payload,
      });
    }

    // Clean up the server-side channel asynchronously without blocking caller
    Promise.resolve(adminClient.removeChannel(channel)).catch(() => {});
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

let activeBroadcastPromise: Promise<void> | null = null;

/**
 * Resets the background broadcast queue for testing isolation.
 */
export function _resetBroadcastChainForTesting(): void {
  activeBroadcastPromise = null;
}

/**
 * Enqueues a server-side Realtime broadcast to be dispatched asynchronously
 * without blocking the caller Server Action's return to the client.
 *
 * GUARANTEED FIFO SEQUENCING:
 * Broadcast tasks are chained onto a sequential Promise queue. Even if Next.js
 * App Router's `after()` triggers multiple registered callbacks concurrently,
 * task N+1 will never initiate its network transmission until task N has
 * completely settled. This guarantees that SALE/UNSOLD events (sequence N)
 * are published over the wire before PLAYER_SELECTED events (sequence N+1).
 *
 * SERVERLESS LIFECYCLE GUARANTEE:
 * Uses Next.js App Router's `after()` from 'next/server', which ties into Vercel
 * and Serverless platform execution hooks (waitUntil) to ensure the compute
 * environment stays active until the HTTP send completes.
 *
 * TEST / CLI FALLBACK:
 * If invoked outside an active Next.js request lifecycle (e.g. in Vitest unit tests),
 * the context error is caught and the broadcast task executes directly.
 */
export function enqueueBackgroundBroadcast(broadcastTask: () => Promise<any>): void {
  let taskPromise: Promise<void>;

  if (!activeBroadcastPromise) {
    // Queue is currently idle: execute task immediately
    taskPromise = (async () => {
      await broadcastTask();
    })();
  } else {
    // Previous broadcast is still in flight: chain task to preserve strict FIFO sequencing
    const previous = activeBroadcastPromise;
    taskPromise = previous
      .catch(() => {})
      .then(async () => {
        await broadcastTask();
      });
  }

  // Update active broadcast pointer until chain settles
  const trackedPromise = taskPromise
    .catch((err) => {
      console.error('[enqueueBackgroundBroadcast] Task error:', err);
    })
    .then(() => {
      if (activeBroadcastPromise === trackedPromise) {
        activeBroadcastPromise = null;
      }
    });

  activeBroadcastPromise = trackedPromise;

  try {
    const { after } = require('next/server');
    after(() => taskPromise);
  } catch {
    // Outside Next.js request context (e.g. during Vitest or CLI scripts)
    taskPromise.catch((err) => {
      console.error('[enqueueBackgroundBroadcast] Execution error:', err);
    });
  }
}
