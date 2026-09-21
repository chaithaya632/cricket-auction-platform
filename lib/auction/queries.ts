// =============================================================================
// ACC Auction Portal — Application Layer: Auction Queries
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuctionLotWithDetails,
  AuctionEventDTO,
  AuctionConfigDTO,
  AuctionSessionState,
} from './types';
import type { LotStatus, AuctionEventType } from '@/lib/constants';

/**
 * Fetches the single active auction lot currently 'in_progress' for the season.
 * Combines lot projection with public player and franchise views.
 */
export async function getActiveLot(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionLotWithDetails | null> {
  const { data: lot, error: lotErr } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (lotErr || !lot) {
    return null;
  }

  // Fetch player details safely via public_players_view
  const { data: playerView } = await supabase
    .from('public_players_view')
    .select('player_id, full_name, photo_url, programme, academic_year, branch, cricheroes_url')
    .eq('registration_id', lot.registration_id)
    .maybeSingle();

  // Fetch highest bidder franchise if exists
  let highestBidder = null;
  if (lot.highest_bidder_franchise_id) {
    const { data: franchiseView } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .eq('franchise_id', lot.highest_bidder_franchise_id)
      .maybeSingle();

    if (franchiseView) {
      highestBidder = {
        id: franchiseView.franchise_id,
        name: franchiseView.name,
        short_name: franchiseView.short_name,
        primary_color: franchiseView.color_primary,
        secondary_color: franchiseView.color_secondary,
      };
    }
  }

  return {
    id: lot.id,
    season_id: lot.season_id,
    registration_id: lot.registration_id,
    bucket: lot.bucket,
    draw_number: lot.draw_number,
    base_price: lot.base_price,
    round: lot.round,
    status: lot.status as LotStatus,
    current_price: lot.current_price,
    highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
    started_at: lot.started_at,
    ended_at: lot.ended_at,
    created_at: lot.created_at,
    updated_at: lot.updated_at,
    player: {
      id: playerView?.player_id || lot.registration_id,
      full_name: playerView?.full_name || 'Unknown Player',
      photo_url: playerView?.photo_url || null,
    },
    registration: {
      id: lot.registration_id,
      branch: playerView?.branch || '',
      academic_year: playerView?.academic_year || 1,
      programme: playerView?.programme || '',
      cricheroes_profile_url: playerView?.cricheroes_url || null,
    },
    highest_bidder: highestBidder,
  };
}

/**
 * Fetches upcoming lots in the queue for a given season.
 */
export async function getAuctionQueue(
  supabase: SupabaseClient,
  seasonId: string,
  limit = 25
): Promise<AuctionLotWithDetails[]> {
  const { data: lots, error } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'pending')
    .order('round', { ascending: true })
    .order('draw_number', { ascending: true })
    .limit(limit);

  if (error || !lots || lots.length === 0) {
    return [];
  }

  const registrationIds = lots.map((l) => l.registration_id);
  const { data: playersView } = await supabase
    .from('public_players_view')
    .select('registration_id, player_id, full_name, photo_url, programme, academic_year, branch, cricheroes_url')
    .in('registration_id', registrationIds);

  const playerMap = new Map<string, any>();
  if (playersView) {
    for (const p of playersView) {
      playerMap.set(p.registration_id, p);
    }
  }

  return lots.map((lot) => {
    const playerView = playerMap.get(lot.registration_id);
    return {
      id: lot.id,
      season_id: lot.season_id,
      registration_id: lot.registration_id,
      bucket: lot.bucket,
      draw_number: lot.draw_number,
      base_price: lot.base_price,
      round: lot.round,
      status: lot.status as LotStatus,
      current_price: lot.current_price,
      highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
      started_at: lot.started_at,
      ended_at: lot.ended_at,
      created_at: lot.created_at,
      updated_at: lot.updated_at,
      player: {
        id: playerView?.player_id || lot.registration_id,
        full_name: playerView?.full_name || 'Upcoming Player',
        photo_url: playerView?.photo_url || null,
      },
      registration: {
        id: lot.registration_id,
        branch: playerView?.branch || '',
        academic_year: playerView?.academic_year || 1,
        programme: playerView?.programme || '',
        cricheroes_profile_url: playerView?.cricheroes_url || null,
      },
      highest_bidder: null,
    };
  });
}

/**
 * Fetches the chronological event history for a specific auction lot.
 */
export async function getLotHistory(
  supabase: SupabaseClient,
  lotId: string
): Promise<AuctionEventDTO[]> {
  const { data: events, error } = await supabase
    .from('auction_events')
    .select('*')
    .eq('auction_lot_id', lotId)
    .order('sequence_number', { ascending: true });

  if (error || !events) {
    return [];
  }

  // Fetch franchise short names for bids
  const franchiseIds = Array.from(
    new Set(events.map((e) => e.franchise_id).filter(Boolean))
  ) as string[];

  const franchiseMap = new Map<string, any>();
  if (franchiseIds.length > 0) {
    const { data: franchises } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .in('franchise_id', franchiseIds);

    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.franchise_id, {
          id: f.franchise_id,
          name: f.name,
          short_name: f.short_name,
          primary_color: f.color_primary,
          secondary_color: f.color_secondary,
        });
      }
    }
  }

  return events.map((e) => ({
    id: e.id,
    season_id: e.season_id,
    auction_lot_id: e.auction_lot_id,
    event_type: e.event_type as AuctionEventType,
    actor_user_id: e.actor_user_id,
    franchise_id: e.franchise_id,
    price: e.price,
    reason: e.reason,
    payload: e.payload,
    sequence_number: e.sequence_number,
    created_at: e.created_at,
    franchise: e.franchise_id ? franchiseMap.get(e.franchise_id) || null : null,
  }));
}

/**
 * Fetches recent auction events across the entire season for real-time stream.
 */
export async function getRecentAuctionEvents(
  supabase: SupabaseClient,
  seasonId: string,
  limit = 20
): Promise<AuctionEventDTO[]> {
  const { data: events, error } = await supabase
    .from('auction_events')
    .select('*')
    .eq('season_id', seasonId)
    .order('sequence_number', { ascending: false })
    .limit(limit);

  if (error || !events) {
    return [];
  }

  const franchiseIds = Array.from(
    new Set(events.map((e) => e.franchise_id).filter(Boolean))
  ) as string[];

  const franchiseMap = new Map<string, any>();
  if (franchiseIds.length > 0) {
    const { data: franchises } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .in('franchise_id', franchiseIds);

    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.franchise_id, {
          id: f.franchise_id,
          name: f.name,
          short_name: f.short_name,
          primary_color: f.color_primary,
          secondary_color: f.color_secondary,
        });
      }
    }
  }

  return events.map((e) => ({
    id: e.id,
    season_id: e.season_id,
    auction_lot_id: e.auction_lot_id,
    event_type: e.event_type as AuctionEventType,
    actor_user_id: e.actor_user_id,
    franchise_id: e.franchise_id,
    price: e.price,
    reason: e.reason,
    payload: e.payload,
    sequence_number: e.sequence_number,
    created_at: e.created_at,
    franchise: e.franchise_id ? franchiseMap.get(e.franchise_id) || null : null,
  }));
}

/**
 * Fetches season auction configuration values.
 */
export async function getSeasonAuctionConfig(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionConfigDTO> {
  const { data: rows } = await supabase
    .from('season_config')
    .select('key, value')
    .eq('season_id', seasonId);

  const configMap: Record<string, string> = {};
  if (rows) {
    for (const r of rows as { key: string; value: string }[]) {
      configMap[r.key] = r.value;
    }
  }

  return {
    firstBidTimerSeconds: parseInt(configMap['first_bid_timer_seconds'] || '30', 10),
    subsequentBidTimerSeconds: parseInt(configMap['subsequent_bid_timer_seconds'] || '20', 10),
    minAuctionPurchases: parseInt(configMap['min_auction_purchases'] || '15', 10),
    maxSquadSize: parseInt(configMap['max_squad_size'] || '22', 10),
    minSquadSize: parseInt(configMap['min_squad_size'] || '17', 10),
    defaultPurse: parseInt(configMap['default_purse'] || '1000', 10),
  };
}

/**
 * Retrieves the authoritative session lifecycle state of the auction.
 * Evaluates seasons.status ('draft', 'registration', 'auction', 'completed'),
 * season_config ('auction_session_status' = 'live' | 'paused'),
 * and current active lot in progress.
 */
export async function getAuctionSessionState(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionSessionState> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .eq('id', seasonId)
    .maybeSingle();

  const { data: configRows } = await supabase
    .from('season_config')
    .select('key, value')
    .eq('season_id', seasonId)
    .in('key', ['auction_session_status', 'auction_started_at']);

  const configMap: Record<string, string> = {};
  if (configRows) {
    for (const r of configRows as { key: string; value: string }[]) {
      configMap[r.key] = r.value;
    }
  }

  const { data: activeLot } = await supabase
    .from('auction_lots')
    .select('id')
    .eq('season_id', seasonId)
    .eq('status', 'in_progress')
    .maybeSingle();

  const seasonStatus = season?.status || 'draft';
  const sessionStatusConfig = configMap['auction_session_status'];
  const startedAt = configMap['auction_started_at'] || null;

  let computedStatus: 'not_started' | 'live' | 'paused' | 'completed' = 'not_started';

  if (seasonStatus === 'completed' || seasonStatus === 'archived' || sessionStatusConfig === 'completed') {
    computedStatus = 'completed';
  } else if (seasonStatus === 'auction') {
    if (sessionStatusConfig === 'paused') {
      computedStatus = 'paused';
    } else {
      computedStatus = 'live';
    }
  } else {
    computedStatus = 'not_started';
  }

  return {
    status: computedStatus,
    seasonId,
    seasonName: season?.name || 'ACC 2026',
    isLive: computedStatus === 'live',
    isPaused: computedStatus === 'paused',
    isNotStarted: computedStatus === 'not_started',
    isCompleted: computedStatus === 'completed',
    startedAt,
    activeLotId: activeLot?.id || null,
  };
}

