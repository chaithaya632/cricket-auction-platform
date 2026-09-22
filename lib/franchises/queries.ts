// =============================================================================
// ACC Auction Portal — Franchise Application Queries
// =============================================================================

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbFranchise, DbBucketRule, DbSeasonConfig } from '@/lib/db/types';
import {
  calculatePurseState,
  calculateBucketProgress,
  evaluateSquadConstraints,
  type AcquiredLotSummary,
  type BucketRuleSummary,
  type AcquisitionType,
} from '@/domain/franchises';
import type {
  FranchiseSquadSummary,
  SquadPlayerItem,
  PlayerDiscoveryItem,
  PlayerDiscoveryFilters,
} from './types';
import { parseCareerStats } from '@/lib/players/queries';
import { PLAYERS } from '@/lib/acc/mock-data';

/**
 * Retrieves the complete squad, financial state, bucket progress, and roster
 * for an authenticated franchise in a specific season.
 * Memoized per server render cycle with React cache().
 */
export const getFranchiseSquadData = cache(async (
  supabase: SupabaseClient,
  franchiseId: string,
  seasonId: string
): Promise<FranchiseSquadSummary | null> => {
  // 1-5. Concurrently fetch franchise, config, bucket rules, acquired lots, and leadership
  const [
    franchiseResult,
    configRowsResult,
    bucketRulesResult,
    lotsResult,
    membersResult,
  ] = await Promise.all([
    supabase.from('franchises').select('*').eq('id', franchiseId).maybeSingle(),
    supabase.from('season_config').select('key, value').eq('season_id', seasonId),
    supabase
      .from('bucket_rules')
      .select('*')
      .eq('season_id', seasonId)
      .order('auction_order', { ascending: true }),
    supabase
      .from('auction_lots')
      .select('id, registration_id, bucket, status, current_price, base_price')
      .eq('season_id', seasonId)
      .eq('highest_bidder_franchise_id', franchiseId)
      .in('status', ['sold', 'allotted', 'scouted']),
    supabase
      .from('franchise_members')
      .select('role, player_registration_id')
      .eq('franchise_id', franchiseId)
      .eq('is_active', true),
  ]);

  const franchise = franchiseResult.data as DbFranchise | null;
  if (!franchise) {
    return null;
  }

  const configMap: Record<string, string> = {};
  if (configRowsResult.data) {
    for (const c of configRowsResult.data as { key: string; value: string }[]) {
      configMap[c.key] = c.value;
    }
  }

  const startingPurse = parseInt(configMap['default_purse'] || '1000', 10);
  const minSquadSize = parseInt(configMap['min_squad_size'] || '17', 10);
  const maxSquadSize = parseInt(configMap['max_squad_size'] || '22', 10);
  const minAuctionPurchases = parseInt(configMap['min_auction_purchases'] || '15', 10);
  const minBasePrice = 20;

  const bucketRules: DbBucketRule[] = (bucketRulesResult.data as DbBucketRule[]) || [];

  const rawLots = (lotsResult.data || []) as {
    id: string;
    registration_id: string;
    bucket: string;
    status: AcquisitionType;
    current_price: number | null;
    base_price: number;
  }[];

  // Map to AcquiredLotSummary for domain calculations
  const acquiredLots: AcquiredLotSummary[] = rawLots.map((lot) => {
    let effectivePrice = lot.current_price;
    if (effectivePrice === null || effectivePrice === undefined) {
      effectivePrice = lot.status === 'sold' ? lot.base_price : 20;
    }
    return {
      lotId: lot.id,
      registrationId: lot.registration_id,
      bucket: lot.bucket,
      status: lot.status,
      price: effectivePrice,
    };
  });

  const membersData = membersResult.data;
  const captainRegId = membersData?.find((m) => m.role === 'captain')?.player_registration_id;
  const viceCaptainRegId = membersData?.find(
    (m) => m.role === 'vice_captain'
  )?.player_registration_id;

  // 6. Fetch player profile projections via public_players_view (strictly privacy-safe)
  const registrationIds = rawLots.map((l) => l.registration_id);
  const playerMap = new Map<string, any>();

  if (registrationIds.length > 0) {
    const { data: playersData } = await supabase
      .from('public_players_view')
      .select('*')
      .in('registration_id', registrationIds);

    if (playersData) {
      for (const p of playersData) {
        playerMap.set(p.registration_id, p);
      }
    }
  }

  // 7. Assemble SquadPlayerItems
  const squadPlayers: SquadPlayerItem[] = acquiredLots.map((lot) => {
    const p = playerMap.get(lot.registrationId);
    return {
      lotId: lot.lotId,
      registrationId: lot.registrationId,
      playerId: p?.player_id || '',
      fullName: p?.full_name || 'Player',
      photoUrl: p?.photo_url || null,
      rollNumber: '', // Excluded from public_players_view to preserve privacy
      programme: p?.programme || '',
      academicYear: p?.academic_year || 1,
      branch: p?.branch || null,
      bucket: lot.bucket,
      derivedPlayerType: p?.derived_player_type || null,
      battingStyle: p?.batting_style || null,
      bowlingStyle: p?.bowling_style || null,
      acquisitionType: lot.status,
      acquisitionPrice: lot.price,
      isCaptain: captainRegId === lot.registrationId,
      isViceCaptain: viceCaptainRegId === lot.registrationId,
    };
  });

  // 8. Execute domain calculations
  const bucketRuleSummaries: BucketRuleSummary[] = bucketRules.map((r) => ({
    bucket: r.bucket,
    minPurchases: r.min_purchases,
    isMandatory: r.is_mandatory,
  }));

  const purseState = calculatePurseState({
    startingPurse,
    acquiredLots,
    bucketRules: bucketRuleSummaries,
    minAuctionPurchases,
    minBasePrice,
  });

  const bucketProgress = calculateBucketProgress(
    bucketRules.map((r) => ({
      bucket: r.bucket,
      displayName: r.display_name,
      minPurchases: r.min_purchases,
      isMandatory: r.is_mandatory,
    })),
    acquiredLots
  );

  const squadConstraints = evaluateSquadConstraints({
    currentSquadSize: acquiredLots.length,
    minSquadSize,
    maxSquadSize,
    allMandatoryBucketsFulfilled: bucketProgress.allMandatoryFulfilled,
    auctionPurchasesCount: purseState.auctionPurchasesCount,
    minAuctionPurchases,
  });

  return {
    franchise: franchise as DbFranchise,
    purseState,
    bucketProgress,
    squadConstraints,
    squadPlayers,
  };
});

/**
 * Discovers auction-eligible players for franchise scouting. Projections sourced via
 * public_players_view and authoritative database tables. Strictly excludes private mobile numbers.
 * Never falls back to mock players.
 * Memoized per server render cycle with React cache().
 */
export const getSeasonPlayerDiscovery = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  filters?: PlayerDiscoveryFilters
): Promise<PlayerDiscoveryItem[]> => {
  try {
    let query = supabase
      .from('public_players_view')
      .select('*')
      .eq('season_id', seasonId)
      .eq('is_auction_eligible', true);

    if (filters?.bucket && filters.bucket !== 'ALL') {
      query = query.eq('bucket', filters.bucket);
    }

    if (filters?.derivedPlayerType && filters.derivedPlayerType !== 'ALL') {
      query = query.eq('derived_player_type', filters.derivedPlayerType);
    }

    if (filters?.searchQuery) {
      query = query.ilike('full_name', `%${filters.searchQuery.trim()}%`);
    }

    const { data, error } = await query.order('full_name', { ascending: true });

    if (error || !data || data.length === 0) {
      return [];
    }

    const regIds = (data as any[]).map((p) => p.registration_id).filter(Boolean);
    const playerIds = (data as any[]).map((p) => p.player_id).filter(Boolean);

    // Parallel fetch: skill profiles, non-sensitive roll numbers, and live auction lots
    const [profilesResult, rollNumbersResult, lotsResult] = await Promise.all([
      regIds.length > 0
        ? supabase
            .from('player_skill_profiles')
            .select('registration_id, experience_description, fielding_position')
            .in('registration_id', regIds)
        : Promise.resolve({ data: [] }),
      playerIds.length > 0
        ? supabase
            .from('players')
            .select('id, roll_number')
            .in('id', playerIds)
        : Promise.resolve({ data: [] }),
      regIds.length > 0
        ? supabase
            .from('auction_lots')
            .select('registration_id, status, current_price, highest_bidder_franchise_id')
            .eq('season_id', seasonId)
            .in('registration_id', regIds)
        : Promise.resolve({ data: [] }),
    ]);

    const statsMap = new Map<string, any>();
    const fieldingMap = new Map<string, string | null>();
    for (const prof of profilesResult.data || []) {
      statsMap.set(prof.registration_id, parseCareerStats(prof.experience_description));
      fieldingMap.set(prof.registration_id, prof.fielding_position || null);
    }

    const rollMap = new Map<string, string>();
    for (const pl of rollNumbersResult.data || []) {
      rollMap.set(pl.id, pl.roll_number);
    }

    const lotMap = new Map<string, any>();
    for (const lot of lotsResult.data || []) {
      lotMap.set(lot.registration_id, lot);
    }

    return (data as any[]).map((p) => {
      const parsedStats = statsMap.get(p.registration_id);
      const lotInfo = lotMap.get(p.registration_id);

      let effectiveAuctionStatus = 'available';
      if (lotInfo?.status) {
        effectiveAuctionStatus = lotInfo.status;
      }

      return {
        registrationId: p.registration_id,
        seasonId: p.season_id,
        playerId: p.player_id,
        fullName: p.full_name,
        rollNumber: rollMap.get(p.player_id) || undefined,
        photoUrl: p.photo_url,
        programme: p.programme,
        academicYear: p.academic_year,
        branch: p.branch,
        bucket: p.bucket,
        basePrice: p.base_price,
        registrationStatus: p.registration_status,
        cricheroesStatus: p.cricheroes_status,
        cricheroesUrl: p.cricheroes_url,
        isAuctionEligible: p.is_auction_eligible,
        derivedPlayerType: p.derived_player_type,
        isBatter: p.is_batter,
        isBowler: p.is_bowler,
        isWicketKeeper: p.is_wicket_keeper,
        battingStyle: p.batting_style,
        bowlingStyle: p.bowling_style,
        experienceYears: p.experience_years,
        fieldingPosition: fieldingMap.get(p.registration_id) || null,
        auctionStatus: effectiveAuctionStatus,
        highestBidderFranchiseId: lotInfo?.highest_bidder_franchise_id || null,
        careerStats: parsedStats,
        notes: parsedStats?.notes || null,
      };
    });
  } catch {
    return [];
  }
});

import type { Franchise } from '@/lib/acc/types';
import { FRANCHISES } from '@/lib/acc/mock-data';

/**
 * Retrieves the unified franchise list for admin and public consoles.
 * Connects to PostgreSQL `franchises` table and maps team attributes.
 * Memoized per server render cycle with React cache().
 */
export const getAdminFranchisesList = cache(async (
  supabase: SupabaseClient,
  seasonId?: string
): Promise<Franchise[]> => {
  try {
    let query = supabase
      .from('franchises')
      .select(`
        id,
        name,
        short_name,
        logo_url,
        color_primary,
        color_secondary,
        faculty_coordinator_name,
        is_active,
        franchise_members (
          role,
          is_active,
          users (
            full_name
          )
        )
      `)
      .eq('is_active', true);

    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

    const { data: dbFranchises, error } = await query;

    if (error || !dbFranchises || dbFranchises.length === 0) {
      return FRANCHISES;
    }

    const parsed: Franchise[] = dbFranchises.map((f: any) => {
      const members = Array.isArray(f.franchise_members) ? f.franchise_members : [];
      const captain = members.find((m: any) => m.role === 'captain' && m.is_active);
      const vc = members.find((m: any) => m.role === 'vice_captain' && m.is_active);

      return {
        id: f.id,
        teamName: f.name,
        shortCode: f.short_name,
        colorHex: f.color_primary || '#0284c7',
        coordinatorName: f.faculty_coordinator_name || 'Faculty Coordinator',
        coordinatorDept: 'Sports Committee',
        captainName: captain?.users?.full_name || 'TBD',
        viceCaptainName: vc?.users?.full_name || 'TBD',
        startingPurse: 1000,
        logoUrl: f.logo_url || undefined,
      };
    });

    return parsed;
  } catch {
    return FRANCHISES;
  }
});
