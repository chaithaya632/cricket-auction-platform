// =============================================================================
// ACC Auction Portal — Fix B Regression Tests
// Verifies that revalidatePath() calls are correctly centralized in
// autoAdvanceToNextLot after removing the pre-advance blocks from
// confirmSaleAction, markUnsoldAction, and finalizeExpiredLotAction.
//
// Specification source:
//   acc_auction_fix_b_revalidatepath_investigation_report.md — Section 8
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: next/cache — intercept revalidatePath calls
// ---------------------------------------------------------------------------
const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: any) => fn),
}));

// ---------------------------------------------------------------------------
// Mock: next/navigation
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(() => ({ get: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Mock: next/server (after())
// ---------------------------------------------------------------------------
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => void) => { fn(); }),
}));

// ---------------------------------------------------------------------------
// Mock: broadcast
// ---------------------------------------------------------------------------
const mockBroadcastAuctionUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/auction/realtime', () => ({
  broadcastAuctionUpdate: (...args: any[]) => mockBroadcastAuctionUpdate(...args),
  enqueueBackgroundBroadcast: vi.fn((fn: () => Promise<void>) => fn()),
}));

// ---------------------------------------------------------------------------
// Mock: permissions
// ---------------------------------------------------------------------------
vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(),
  requireFranchise: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: audit
// ---------------------------------------------------------------------------
vi.mock('@/lib/acc/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: executeAuctionMutationFlow — configurable per test
// ---------------------------------------------------------------------------
let mutationSucceeds = true;
vi.mock('@/lib/auction/transaction', () => ({
  executeAuctionMutationFlow: vi.fn().mockImplementation(() =>
    mutationSucceeds
      ? Promise.resolve({ success: true, data: { event: { id: 'evt-id', sequence_number: 42 } } })
      : Promise.resolve({ success: false, error: 'conflict' })
  ),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/auction/queries — getActiveLot always returns a minimal lot
// ---------------------------------------------------------------------------
vi.mock('@/lib/auction/queries', () => ({
  getActiveLot: vi.fn().mockResolvedValue({
    id: 'lot-next',
    status: 'in_progress',
    season_id: 'season-1',
    player: { id: 'player-1', name: 'Test Player' },
  }),
  getAuctionSessionState: vi.fn().mockResolvedValue({
    status: 'live',
    isLive: true,
    isPaused: false,
  }),
  getSeasonAuctionConfig: vi.fn().mockResolvedValue({}),
  getRecentAuctionEvents: vi.fn().mockResolvedValue([]),
  getActiveLotScarcity: vi.fn().mockResolvedValue(null),
  getAllFranchisesLiveSummary: vi.fn().mockResolvedValue([]),
  getActiveBuckets: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// The module under test — imported AFTER all mocks are declared
// ---------------------------------------------------------------------------
import { autoAdvanceToNextLot } from '@/lib/auction/actions';

// ---------------------------------------------------------------------------
// Supabase mock client builder
//
// All queries in autoAdvanceToNextLot go through adminClient.from(table).
// The relevant chains are:
//
//   season_config reads (status, active_buckets, first_bid_timer):
//     .from('season_config').select(col).eq('season_id',v).eq('key',k).maybeSingle()
//
//   auction_lots — activeLot check (in_progress):
//     .from('auction_lots').select('id').eq('season_id',v).eq('status','in_progress').maybeSingle()
//
//   auction_lots — pending lots:
//     .from('auction_lots').select('*').eq('season_id',v).eq('status','pending').in('bucket',[...]).order(...).order(...).limit(n)
//
//   season_config writes (paused remaining / delete):
//     .from('season_config').upsert(...)  /  .from('season_config').delete().eq(...).in(...)
// ---------------------------------------------------------------------------

function buildMockClient(opts: {
  sessionStatus?: string;
  inProgressLotId?: string | null;
  pendingLots?: any[];
  timerSeconds?: number;
}): any {
  const {
    sessionStatus = 'live',
    inProgressLotId = null,
    pendingLots = [],
    timerSeconds = 30,
  } = opts;

  // Resolve season_config .maybeSingle() by 'key' param value.
  // We capture the last .eq() argument before .maybeSingle() to decide.
  function makeSeasonConfigChain(keyValue?: string): any {
    return {
      maybeSingle: () => {
        if (keyValue === 'auction_session_status') {
          return Promise.resolve({ data: { value: sessionStatus }, error: null });
        }
        if (keyValue === 'auction_active_buckets') {
          return Promise.resolve({ data: null, error: null }); // use DEFAULT_BUCKET_ORDER
        }
        if (keyValue === 'auction_first_bid_timer_seconds') {
          return Promise.resolve({ data: { value: String(timerSeconds) }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  // Capture the key param from .eq('key', keyVal) calls on season_config
  function makeSeasonConfigSelectChain(): any {
    return {
      eq: (field: string, val: string) => {
        // First .eq() is 'season_id' — return a chain for the next .eq()
        if (field === 'season_id') {
          return {
            eq: (f2: string, keyVal: string) => makeSeasonConfigChain(keyVal),
          };
        }
        return makeSeasonConfigChain();
      },
    };
  }

  // Resolve auction_lots queries: distinguish by status value in .eq('status', ...)
  function makeAuctionLotsSelectChain(): any {
    let capturedStatus: string | null = null;
    const chain: any = {
      eq: (field: string, val: string) => {
        if (field === 'status') capturedStatus = val;
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: () => {
        return Promise.resolve({ data: capturedStatus === 'pending' ? pendingLots : [], error: null });
      },
      maybeSingle: () => {
        if (capturedStatus === 'in_progress') {
          return inProgressLotId
            ? Promise.resolve({ data: { id: inProgressLotId }, error: null })
            : Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  }

  return {
    from: (table: string) => {
      if (table === 'season_config') {
        return {
          select: () => makeSeasonConfigSelectChain(),
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }

      if (table === 'auction_lots') {
        return {
          select: () => makeAuctionLotsSelectChain(),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }

      // Fallback for any other table (auction_history, etc.)
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'evt-id', sequence_number: 1 }, error: null }),
          }),
        }),
      };
    },
    removeChannel: vi.fn().mockResolvedValue(undefined),
    channel: vi.fn(() => ({
      subscribe: vi.fn(),
      send: vi.fn().mockResolvedValue('ok'),
      unsubscribe: vi.fn(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/** Sorted unique list of paths passed to revalidatePath. */
function revalidatedPaths(): string[] {
  return [...new Set<string>(mockRevalidatePath.mock.calls.map((c: any[]) => c[0] as string))].sort();
}

function assertInvalidated(path: string) {
  expect(revalidatedPaths(), `Expected revalidatePath('${path}') but got: ${JSON.stringify(revalidatedPaths())}`).toContain(path);
}

function assertNotInvalidated(path: string) {
  expect(revalidatedPaths(), `Expected revalidatePath('${path}') NOT called but it was. Paths: ${JSON.stringify(revalidatedPaths())}`).not.toContain(path);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SEASON_ID = 'season-1';
const ACTOR_ID = 'admin-user-1';

const PENDING_LOT = {
  id: 'lot-next',
  status: 'pending',
  season_id: SEASON_ID,
  bucket: 'B1',
  round: 1,
  draw_number: 1,
};

describe('Fix B — autoAdvanceToNextLot revalidatePath centralization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationSucceeds = true;
  });

  // -------------------------------------------------------------------------
  // R-1: Success path — /admin/auction IS invalidated; /admin/queue is NOT
  // -------------------------------------------------------------------------
  it('R-1: successful advance invalidates /admin/auction but NOT /admin/queue (redirect stub)', async () => {
    const client = buildMockClient({ pendingLots: [PENDING_LOT] });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: true });

    assertInvalidated('/admin/auction');
    assertNotInvalidated('/admin/queue');
  });

  // -------------------------------------------------------------------------
  // R-2: soldToFranchise=true → /franchise and /franchise/squad ARE invalidated
  // -------------------------------------------------------------------------
  it('R-2: soldToFranchise=true invalidates /franchise and /franchise/squad', async () => {
    const client = buildMockClient({ pendingLots: [PENDING_LOT] });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: true });

    assertInvalidated('/franchise');
    assertInvalidated('/franchise/squad');
    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertInvalidated('/live/projector');
    assertInvalidated('/franchise/auction');
    assertInvalidated('/player/auction');
  });

  // -------------------------------------------------------------------------
  // R-3: soldToFranchise=false (UNSOLD) → /franchise paths NOT invalidated
  // -------------------------------------------------------------------------
  it('R-3: soldToFranchise=false (UNSOLD) does NOT invalidate /franchise or /franchise/squad', async () => {
    const client = buildMockClient({ pendingLots: [PENDING_LOT] });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: false });

    assertNotInvalidated('/franchise');
    assertNotInvalidated('/franchise/squad');
    // But critical auction-floor paths ARE still invalidated
    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertInvalidated('/live/projector');
    assertInvalidated('/franchise/auction');
    assertInvalidated('/player/auction');
  });

  // -------------------------------------------------------------------------
  // R-3b: No options (skip, startNextBucketGroup) → /franchise paths NOT invalidated
  // -------------------------------------------------------------------------
  it('R-3b: no options (plain progression for skip/bucket-group) does NOT invalidate /franchise paths', async () => {
    const client = buildMockClient({ pendingLots: [PENDING_LOT] });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID /* no options */);

    assertNotInvalidated('/franchise');
    assertNotInvalidated('/franchise/squad');
    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertInvalidated('/franchise/auction');
  });

  // -------------------------------------------------------------------------
  // R-4: Early exit (lot already in_progress) — critical paths still invalidated
  //      This verifies the guard added to the in_progress early-exit branch.
  // -------------------------------------------------------------------------
  it('R-4: early exit (lot already in_progress) still invalidates /admin/auction and /live', async () => {
    const client = buildMockClient({
      inProgressLotId: 'lot-existing', // signals activeLot exists
      pendingLots: [],
    });

    const result = await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, {
      soldToFranchise: true,
    });

    expect(result.advanced).toBe(false);
    expect(result.nextLotId).toBe('lot-existing');

    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertInvalidated('/live/projector');
    assertInvalidated('/franchise/auction');
    assertInvalidated('/player/auction');
    // soldToFranchise=true → franchise paths included even on early exit
    assertInvalidated('/franchise');
    assertInvalidated('/franchise/squad');
    // Redirect stub still excluded
    assertNotInvalidated('/admin/queue');
  });

  // -------------------------------------------------------------------------
  // R-4b: Early exit WITHOUT soldToFranchise — /franchise paths NOT invalidated
  // -------------------------------------------------------------------------
  it('R-4b: early exit (lot already in_progress) with soldToFranchise=false does NOT invalidate /franchise paths', async () => {
    const client = buildMockClient({
      inProgressLotId: 'lot-existing',
      pendingLots: [],
    });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: false });

    assertNotInvalidated('/franchise');
    assertNotInvalidated('/franchise/squad');
    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
  });

  // -------------------------------------------------------------------------
  // R-5: Empty floor (UNSOLD finalization) — floor routes invalidated, /franchise/squad NOT
  // -------------------------------------------------------------------------
  it('R-5: empty floor with soldToFranchise=false invalidates floor routes but NOT /franchise/squad', async () => {
    const client = buildMockClient({
      inProgressLotId: null,
      pendingLots: [], // ← empty floor
    });

    const result = await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, {
      soldToFranchise: false,
    });

    expect(result.advanced).toBe(false);
    expect(result.nextLotId).toBeNull();

    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertInvalidated('/live/projector');
    assertInvalidated('/franchise/auction');
    assertInvalidated('/player/auction');
    assertNotInvalidated('/franchise/squad');
    assertNotInvalidated('/franchise');
    assertNotInvalidated('/admin/queue');
  });

  // -------------------------------------------------------------------------
  // R-5b: Empty floor with soldToFranchise=true → /franchise/squad IS invalidated
  // -------------------------------------------------------------------------
  it('R-5b: empty floor with soldToFranchise=true invalidates /franchise and /franchise/squad', async () => {
    const client = buildMockClient({
      inProgressLotId: null,
      pendingLots: [],
    });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: true });

    assertInvalidated('/franchise');
    assertInvalidated('/franchise/squad');
    assertInvalidated('/admin/auction');
    assertInvalidated('/live');
    assertNotInvalidated('/admin/queue');
  });

  // -------------------------------------------------------------------------
  // R-6: Session completed/not_started → NO revalidatePath calls at all
  // -------------------------------------------------------------------------
  it('R-6: session completed returns early with zero revalidatePath calls', async () => {
    const client = buildMockClient({ sessionStatus: 'completed' });

    const result = await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, {
      soldToFranchise: true,
    });

    expect(result.advanced).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('R-6b: session not_started returns early with zero revalidatePath calls', async () => {
    const client = buildMockClient({ sessionStatus: 'not_started' });

    await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, { soldToFranchise: true });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // R-7: Mutation failure → NO revalidatePath (DB state unchanged for next lot)
  // -------------------------------------------------------------------------
  it('R-7: mutation failure (optimistic lock conflict) produces NO revalidatePath calls', async () => {
    mutationSucceeds = false;
    const client = buildMockClient({ pendingLots: [PENDING_LOT] });

    const result = await autoAdvanceToNextLot(client, SEASON_ID, ACTOR_ID, {
      soldToFranchise: true,
    });

    expect(result.advanced).toBe(false);
    // No invalidation — the next lot was never written
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
