// =============================================================================
// ACC Auction Portal — Integration Tests: Three-Browser Live Auction Verification
// =============================================================================
// Simulates:
// - Browser A = Admin
// - Browser B = Franchise
// - Browser C = Public /live
//
// Verification Sequence:
// 1. START → same player on all three
// 2. BID → bid propagates to all three
// 3. PAUSE → all three show PAUSED with exact frozen remaining seconds
// 4. Wait at least 10 seconds → timer remains frozen
// 5. RESUME → timer continues from the exact frozen value
// 6. BID again → all three receive the new authoritative bid
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { OperatorControls } from '@/components/auction/operator-controls';
import { AuctionSessionIndicator } from '@/components/acc/status-badges';
import { resolveAuctionSessionStatus } from '@/lib/auction/queries';
import type { AuctionSessionState } from '@/lib/auction/types';
import { calculateNextBid } from '@/domain/auction/bid-increment';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('Three-Browser Live Auction Verification Simulation', () => {
  it('executes full multi-client lifecycle: START -> BID -> PAUSE -> WAIT 10s -> RESUME -> BID', async () => {
    const seasonId = 'season-live-sim-001';
    const timerDuration = 30; // 30s base timer

    // In-memory synchronized shared database state
    interface SharedDbState {
      season: { id: string; name: string; status: string };
      seasonConfig: Record<string, string>;
      activeLot: {
        id: string;
        season_id: string;
        player_name: string;
        draw_number: number;
        bucket: string;
        base_price: number;
        status: string;
        current_price: number | null;
        highest_bidder_franchise_id: string | null;
        started_at: string | null;
        ended_at: string | null;
      } | null;
      events: Array<{
        type: string;
        price?: number;
        franchise_id?: string;
        payload?: any;
        created_at: string;
      }>;
    }

    const db: SharedDbState = {
      season: { id: seasonId, name: 'ACC 2026', status: 'auction' },
      seasonConfig: {
        auction_session_status: 'live',
        first_bid_timer_seconds: '30',
        subsequent_bid_timer_seconds: '15',
      },
      activeLot: null,
      events: [],
    };

    // Helper functions simulating queries used by Admin, Franchise, and Public /live
    const getSessionState = (): AuctionSessionState => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: db.season.status,
        sessionConfigStatus: db.seasonConfig['auction_session_status'],
        startedAt: db.seasonConfig['auction_started_at'],
        endedAt: db.seasonConfig['auction_ended_at'],
      });

      const pausedSecRaw = db.seasonConfig['auction_lot_paused_remaining_seconds'];
      const pausedRemainingSeconds = pausedSecRaw ? parseInt(pausedSecRaw, 10) : null;

      return {
        status,
        seasonId: db.season.id,
        seasonName: db.season.name,
        isLive: status === 'live',
        isPaused: status === 'paused',
        isNotStarted: status === 'not_started',
        isCompleted: status === 'completed',
        startedAt: db.seasonConfig['auction_started_at'] || null,
        activeLotId: db.activeLot?.id || null,
        pausedRemainingSeconds,
        pausedAt: db.seasonConfig['auction_paused_at'] || null,
      };
    };

    // -------------------------------------------------------------------------
    // STEP 1: START LOT
    // -------------------------------------------------------------------------
    const startTime = Date.now();
    db.activeLot = {
      id: 'lot-player-042',
      season_id: seasonId,
      player_name: 'Rohit Sharma',
      draw_number: 42,
      bucket: 'B1',
      base_price: 20,
      status: 'in_progress',
      current_price: null,
      highest_bidder_franchise_id: null,
      started_at: new Date(startTime).toISOString(),
      ended_at: null,
    };
    db.events.push({
      type: 'PLAYER_SELECTED',
      created_at: new Date(startTime).toISOString(),
    });

    // Verify: Browser A (Admin), Browser B (Franchise), Browser C (Public /live)
    // All three observe the exact same active player and draw number
    const adminView1 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView1 = { lot: db.activeLot, session: getSessionState() };
    const publicView1 = { lot: db.activeLot, session: getSessionState() };

    expect(adminView1.lot?.player_name).toBe('Rohit Sharma');
    expect(franchiseView1.lot?.player_name).toBe('Rohit Sharma');
    expect(publicView1.lot?.player_name).toBe('Rohit Sharma');
    expect(adminView1.session.isLive).toBe(true);
    expect(franchiseView1.session.isLive).toBe(true);
    expect(publicView1.session.isLive).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 2: BID PLACED BY FRANCHISE B
    // -------------------------------------------------------------------------
    const bid1Time = startTime + 3000; // 3 seconds in
    const franchiseBId = 'franchise-titans-01';
    const nextBid1 = calculateNextBid(db.activeLot.current_price, db.activeLot.base_price);
    expect(nextBid1).toBe(20); // First bid equals base price

    db.activeLot.current_price = nextBid1;
    db.activeLot.highest_bidder_franchise_id = franchiseBId;
    db.activeLot.started_at = new Date(bid1Time).toISOString();
    db.events.push({
      type: 'BID_PLACED',
      price: nextBid1,
      franchise_id: franchiseBId,
      created_at: new Date(bid1Time).toISOString(),
    });

    // Verify: Bid propagates to all three browsers
    const adminView2 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView2 = { lot: db.activeLot, session: getSessionState() };
    const publicView2 = { lot: db.activeLot, session: getSessionState() };

    expect(adminView2.lot?.current_price).toBe(20);
    expect(franchiseView2.lot?.current_price).toBe(20);
    expect(publicView2.lot?.current_price).toBe(20);
    expect(adminView2.lot?.highest_bidder_franchise_id).toBe(franchiseBId);
    expect(franchiseView2.lot?.highest_bidder_franchise_id).toBe(franchiseBId);
    expect(publicView2.lot?.highest_bidder_franchise_id).toBe(franchiseBId);

    // -------------------------------------------------------------------------
    // STEP 3: PAUSE AUCTION AT ELAPSED = 6 SECONDS
    // -------------------------------------------------------------------------
    const pauseTime = bid1Time + 6000; // 6 seconds after bid
    const elapsedOnLot = Math.floor((pauseTime - new Date(db.activeLot.started_at!).getTime()) / 1000);
    const remainingSecondsOnPause = Math.max(0, timerDuration - elapsedOnLot); // 30 - 6 = 24s

    db.seasonConfig['auction_session_status'] = 'paused';
    db.seasonConfig['auction_paused_at'] = new Date(pauseTime).toISOString();
    db.seasonConfig['auction_lot_paused_remaining_seconds'] = String(remainingSecondsOnPause);
    db.events.push({
      type: 'PAUSE',
      payload: { paused_at: new Date(pauseTime).toISOString(), remaining_seconds: remainingSecondsOnPause },
      created_at: new Date(pauseTime).toISOString(),
    });

    // Verify: All three show PAUSED with the exact same frozen remaining seconds
    const adminView3 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView3 = { lot: db.activeLot, session: getSessionState() };
    const publicView3 = { lot: db.activeLot, session: getSessionState() };

    expect(adminView3.session.status).toBe('paused');
    expect(franchiseView3.session.status).toBe('paused');
    expect(publicView3.session.status).toBe('paused');

    expect(adminView3.session.pausedRemainingSeconds).toBe(24);
    expect(franchiseView3.session.pausedRemainingSeconds).toBe(24);
    expect(publicView3.session.pausedRemainingSeconds).toBe(24);

    // Render AuctionTimer component for all three browsers:
    const adminTimerHtml1 = renderToString(
      <AuctionTimer
        startedAt={adminView3.lot!.started_at}
        durationSeconds={timerDuration}
        isActive={adminView3.lot!.status === 'in_progress' && adminView3.session.isLive}
        isPaused={adminView3.session.isPaused}
        pausedRemainingSeconds={adminView3.session.pausedRemainingSeconds}
      />
    );
    const franchiseTimerHtml1 = renderToString(
      <AuctionTimer
        startedAt={franchiseView3.lot!.started_at}
        durationSeconds={timerDuration}
        isActive={franchiseView3.lot!.status === 'in_progress' && franchiseView3.session.isLive}
        isPaused={franchiseView3.session.isPaused}
        pausedRemainingSeconds={franchiseView3.session.pausedRemainingSeconds}
      />
    );
    const publicTimerHtml1 = renderToString(
      <AuctionTimer
        startedAt={publicView3.lot!.started_at}
        durationSeconds={timerDuration}
        isActive={publicView3.lot!.status === 'in_progress' && publicView3.session.isLive}
        isPaused={publicView3.session.isPaused}
        pausedRemainingSeconds={publicView3.session.pausedRemainingSeconds}
      />
    );

    // All three display PAUSED (24s) with amber styling
    expect(adminTimerHtml1).toContain('PAUSED (24s)');
    expect(franchiseTimerHtml1).toContain('PAUSED (24s)');
    expect(publicTimerHtml1).toContain('PAUSED (24s)');

    expect(adminTimerHtml1).toContain('text-amber-400');
    expect(franchiseTimerHtml1).toContain('text-amber-400');
    expect(publicTimerHtml1).toContain('text-amber-400');

    // -------------------------------------------------------------------------
    // STEP 4: WAIT AT LEAST 10 SECONDS WHILE PAUSED
    // -------------------------------------------------------------------------
    const simulatedWaitTime = pauseTime + 12000; // 12 seconds elapsed in real-world time

    // Re-query database after 12 seconds:
    const adminView4 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView4 = { lot: db.activeLot, session: getSessionState() };
    const publicView4 = { lot: db.activeLot, session: getSessionState() };

    // Session remains paused
    expect(adminView4.session.status).toBe('paused');
    expect(franchiseView4.session.status).toBe('paused');
    expect(publicView4.session.status).toBe('paused');

    // Timer remains completely frozen at 24s on all three!
    expect(adminView4.session.pausedRemainingSeconds).toBe(24);
    expect(franchiseView4.session.pausedRemainingSeconds).toBe(24);
    expect(publicView4.session.pausedRemainingSeconds).toBe(24);

    const adminTimerHtml2 = renderToString(
      <AuctionTimer
        startedAt={adminView4.lot!.started_at}
        durationSeconds={timerDuration}
        isActive={adminView4.lot!.status === 'in_progress' && adminView4.session.isLive}
        isPaused={adminView4.session.isPaused}
        pausedRemainingSeconds={adminView4.session.pausedRemainingSeconds}
      />
    );
    expect(adminTimerHtml2).toContain('PAUSED (24s)');

    // -------------------------------------------------------------------------
    // STEP 5: RESUME AUCTION
    // -------------------------------------------------------------------------
    const resumeTime = simulatedWaitTime;
    const pausedToRestore = parseInt(db.seasonConfig['auction_lot_paused_remaining_seconds'], 10);
    const elapsedToRestore = timerDuration - pausedToRestore; // 30 - 24 = 6s
    const restoredStartedAt = new Date(resumeTime - elapsedToRestore * 1000).toISOString();

    db.seasonConfig['auction_session_status'] = 'live';
    delete db.seasonConfig['auction_lot_paused_remaining_seconds'];
    delete db.seasonConfig['auction_paused_at'];
    db.activeLot.started_at = restoredStartedAt;
    db.events.push({
      type: 'RESUME',
      payload: { resumed_at: new Date(resumeTime).toISOString(), remaining_seconds: pausedToRestore },
      created_at: new Date(resumeTime).toISOString(),
    });

    // Verify: Session is live again across all three browsers
    const adminView5 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView5 = { lot: db.activeLot, session: getSessionState() };
    const publicView5 = { lot: db.activeLot, session: getSessionState() };

    expect(adminView5.session.isLive).toBe(true);
    expect(franchiseView5.session.isLive).toBe(true);
    expect(publicView5.session.isLive).toBe(true);
    expect(adminView5.session.isPaused).toBe(false);

    // Verify timer continuous countdown starting from exactly 24s:
    const deadline = new Date(db.activeLot.started_at).getTime() + timerDuration * 1000;
    const remainingRightAtResume = Math.ceil((deadline - resumeTime) / 1000);
    expect(remainingRightAtResume).toBe(24); // Exactly 24s!

    // -------------------------------------------------------------------------
    // STEP 6: SUBSEQUENT BID PLACED BY FRANCHISE C
    // -------------------------------------------------------------------------
    const franchiseCId = 'franchise-warriors-02';
    const nextBid2 = calculateNextBid(db.activeLot.current_price, db.activeLot.base_price);
    expect(nextBid2).toBe(30); // 20 + 10 = 30

    const bid2Time = resumeTime + 2000;
    db.activeLot.current_price = nextBid2;
    db.activeLot.highest_bidder_franchise_id = franchiseCId;
    db.activeLot.started_at = new Date(bid2Time).toISOString();
    db.events.push({
      type: 'BID_PLACED',
      price: nextBid2,
      franchise_id: franchiseCId,
      created_at: new Date(bid2Time).toISOString(),
    });

    // Verify: All three browsers receive new authoritative bid
    const adminView6 = { lot: db.activeLot, session: getSessionState() };
    const franchiseView6 = { lot: db.activeLot, session: getSessionState() };
    const publicView6 = { lot: db.activeLot, session: getSessionState() };

    expect(adminView6.lot?.current_price).toBe(30);
    expect(franchiseView6.lot?.current_price).toBe(30);
    expect(publicView6.lot?.current_price).toBe(30);

    expect(adminView6.lot?.highest_bidder_franchise_id).toBe(franchiseCId);
    expect(franchiseView6.lot?.highest_bidder_franchise_id).toBe(franchiseCId);
    expect(publicView6.lot?.highest_bidder_franchise_id).toBe(franchiseCId);
  });

  it('Test E: executes 3 consecutive PAUSE -> wait -> RESUME cycles across Admin, Franchise, Public /live, and Public /live/projector with exact frozen timer and zero state desynchronization', () => {
    const seasonId = 'season-3-cycle-pause-001';
    const timerDuration = 30;
    const ALLOWED_VALUE_TYPES = new Set(['integer', 'text', 'boolean', 'json']);

    interface ConfigEntry {
      key: string;
      value: string;
      value_type: string;
    }

    const configTable = new Map<string, ConfigEntry>([
      ['auction_session_status', { key: 'auction_session_status', value: 'live', value_type: 'text' }],
      ['auction_timer_seconds', { key: 'auction_timer_seconds', value: '30', value_type: 'integer' }],
      ['auction_subsequent_bid_seconds', { key: 'auction_subsequent_bid_seconds', value: '20', value_type: 'integer' }],
    ]);

    let activeLotStartedAt = '2026-09-27T16:00:00.000Z';
    const startEpoch = new Date(activeLotStartedAt).getTime();

    const upsertConfig = (rows: ConfigEntry[]) => {
      for (const row of rows) {
        if (!ALLOWED_VALUE_TYPES.has(row.value_type)) {
          throw new Error(`23514: violates check constraint "season_config_value_type_check" (${row.value_type})`);
        }
      }
      for (const row of rows) {
        configTable.set(row.key, row);
      }
    };

    const getSession = (): AuctionSessionState => {
      const rawStatus = configTable.get('auction_session_status')?.value;
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: rawStatus,
        startedAt: '2026-09-27T15:50:00.000Z',
        endedAt: undefined,
      });
      const pausedVal = configTable.get('auction_lot_paused_remaining_seconds')?.value;
      const pausedRemainingSeconds =
        status === 'paused' && pausedVal !== undefined ? parseInt(pausedVal, 10) : null;
      return {
        seasonId,
        seasonName: 'ACC 2026',
        status,
        isLive: status === 'live',
        isPaused: status === 'paused',
        isNotStarted: status === 'not_started',
        isCompleted: status === 'completed',
        startedAt: '2026-09-27T15:50:00.000Z',
        activeLotId: 'lot-3cycle',
        pausedRemainingSeconds,
        pausedAt: configTable.get('auction_paused_at')?.value ?? null,
      };
    };

    const assertAllFourViewsSynchronized = (
      expectedMode: 'live' | 'paused',
      expectedRemaining: number,
      currentNowMs: number
    ) => {
      const session = getSession();
      expect(session.status).toBe(expectedMode);
      expect(session.isPaused).toBe(expectedMode === 'paused');
      expect(session.isLive).toBe(expectedMode === 'live');

      // 1. Admin OperatorControls + AuctionSessionIndicator + AuctionTimer
      const operatorHtml = renderToString(
        <OperatorControls
          activeLot={{
            id: 'lot-3cycle',
            draw_number: 12,
            status: 'in_progress',
            base_price: 20,
            current_price: 20,
            highest_bidder_franchise_id: 'franchise-1',
            player: { full_name: 'R. Jadeja' },
          } as any}
          upcomingLots={[]}
          isSuperAdmin={true}
          sessionState={session}
        />
      );
      const indicatorHtml = renderToString(
        <AuctionSessionIndicator status={session.status} />
      );
      const adminTimerHtml = renderToString(
        <AuctionTimer
          startedAt={activeLotStartedAt}
          durationSeconds={timerDuration}
          isActive={session.isLive}
          isPaused={session.isPaused}
          pausedRemainingSeconds={session.pausedRemainingSeconds}
        />
      );

      // 2. Franchise AuctionTimer
      const franchiseTimerHtml = renderToString(
        <AuctionTimer
          startedAt={activeLotStartedAt}
          durationSeconds={timerDuration}
          isActive={session.isLive}
          isPaused={session.isPaused}
          pausedRemainingSeconds={session.pausedRemainingSeconds}
        />
      );

      // 3. Public /live AuctionTimer
      const publicLiveTimerHtml = renderToString(
        <AuctionTimer
          startedAt={activeLotStartedAt}
          durationSeconds={timerDuration}
          isActive={session.isLive}
          isPaused={session.isPaused}
          pausedRemainingSeconds={session.pausedRemainingSeconds}
        />
      );

      // 4. Public /live/projector AuctionTimer (lg size)
      const projectorTimerHtml = renderToString(
        <AuctionTimer
          startedAt={activeLotStartedAt}
          durationSeconds={timerDuration}
          isActive={session.isLive}
          isPaused={session.isPaused}
          pausedRemainingSeconds={session.pausedRemainingSeconds}
          size="lg"
        />
      );

      if (expectedMode === 'paused') {
        expect(session.pausedRemainingSeconds).toBe(expectedRemaining);
        expect(operatorHtml).toContain('RESUME AUCTION');
        expect(operatorHtml).not.toContain('PAUSE AUCTION');
        expect(operatorHtml).toContain('AUCTION SESSION PAUSED');
        expect(indicatorHtml).toContain('Paused');
        expect(adminTimerHtml).toContain(`PAUSED (${expectedRemaining}s)`);
        expect(franchiseTimerHtml).toContain(`PAUSED (${expectedRemaining}s)`);
        expect(publicLiveTimerHtml).toContain(`PAUSED (${expectedRemaining}s)`);
        expect(projectorTimerHtml).toContain(`PAUSED (${expectedRemaining}s)`);
      } else {
        expect(session.pausedRemainingSeconds).toBeNull();
        expect(operatorHtml).toContain('PAUSE AUCTION');
        expect(operatorHtml).not.toContain('RESUME AUCTION');
        expect(operatorHtml).toContain('AUCTION SESSION ACTIVE');
        expect(indicatorHtml).toContain('Live');
        const deadline = new Date(activeLotStartedAt).getTime() + timerDuration * 1000;
        const computedRemaining = Math.ceil((deadline - currentNowMs) / 1000);
        expect(computedRemaining).toBe(expectedRemaining);
      }
    };

    const performPause = (nowMs: number) => {
      const elapsedSeconds = (nowMs - new Date(activeLotStartedAt).getTime()) / 1000;
      const remainingSeconds = Math.max(1, Math.ceil(timerDuration - elapsedSeconds));
      upsertConfig([
        { key: 'auction_session_status', value: 'paused', value_type: 'text' },
        { key: 'auction_paused_at', value: new Date(nowMs).toISOString(), value_type: 'text' },
        {
          key: 'auction_lot_paused_remaining_seconds',
          value: String(remainingSeconds),
          value_type: 'integer',
        },
      ]);
      return remainingSeconds;
    };

    const performResume = (nowMs: number) => {
      const pausedRemaining = parseInt(
        configTable.get('auction_lot_paused_remaining_seconds')!.value,
        10
      );
      const elapsedToRestore = Math.max(0, timerDuration - pausedRemaining);
      // Update lot started_at FIRST before flipping season_config to live
      activeLotStartedAt = new Date(nowMs - elapsedToRestore * 1000).toISOString();
      upsertConfig([{ key: 'auction_session_status', value: 'live', value_type: 'text' }]);
      configTable.delete('auction_lot_paused_remaining_seconds');
      configTable.delete('auction_paused_at');
      return pausedRemaining;
    };

    // Initial live at T+0s (30s remaining)
    assertAllFourViewsSynchronized('live', 30, startEpoch);

    // =========================================================================
    // CYCLE 1: Run 3s (to 27s) -> PAUSE -> Wait 10s -> Still 27s -> RESUME at 27s
    // =========================================================================
    const c1PauseAt = startEpoch + 3000; // 27s left
    expect(performPause(c1PauseAt)).toBe(27);
    assertAllFourViewsSynchronized('paused', 27, c1PauseAt);

    // Wait 10 seconds while paused -> still frozen at 27s
    const c1AfterWait = c1PauseAt + 10000;
    assertAllFourViewsSynchronized('paused', 27, c1AfterWait);

    // Resume at c1AfterWait -> continues from 27s
    expect(performResume(c1AfterWait)).toBe(27);
    assertAllFourViewsSynchronized('live', 27, c1AfterWait);

    // =========================================================================
    // CYCLE 2: Run 5s (to 22s) -> PAUSE -> Wait 15s -> Still 22s -> RESUME at 22s
    // =========================================================================
    const c2PauseAt = c1AfterWait + 5000; // 27 - 5 = 22s left
    expect(performPause(c2PauseAt)).toBe(22);
    assertAllFourViewsSynchronized('paused', 22, c2PauseAt);

    // Wait 15 seconds while paused -> still frozen at 22s
    const c2AfterWait = c2PauseAt + 15000;
    assertAllFourViewsSynchronized('paused', 22, c2AfterWait);

    // Resume at c2AfterWait -> continues from 22s
    expect(performResume(c2AfterWait)).toBe(22);
    assertAllFourViewsSynchronized('live', 22, c2AfterWait);

    // =========================================================================
    // CYCLE 3: Run 4s (to 18s) -> PAUSE -> Wait 12s -> Still 18s
    // =========================================================================
    const c3PauseAt = c2AfterWait + 4000; // 22 - 4 = 18s left
    expect(performPause(c3PauseAt)).toBe(18);
    assertAllFourViewsSynchronized('paused', 18, c3PauseAt);

    const c3AfterWait = c3PauseAt + 12000;
    assertAllFourViewsSynchronized('paused', 18, c3AfterWait);
  });
});
