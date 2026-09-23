// =============================================================================
// ACC Auction Portal — Referral Queries (Spec §5, §6, §22)
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FranchiseReferralItem {
  id: string;
  franchiseId: string;
  registrationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'conflict';
  notes: string | null;
  verifiedAt: string | null;
  playerName: string;
  rollNumber: string;
  programme: string;
  academicYear: number;
  branch: string | null;
  bucket: string;
  hasConflict: boolean;
}

/**
 * Retrieves all declared referrals for a given franchise (§6).
 */
export async function getFranchiseReferrals(
  supabase: SupabaseClient,
  franchiseId: string
): Promise<FranchiseReferralItem[]> {
  try {
    const { data, error } = await supabase
      .from('franchise_referrals')
      .select(`
        id,
        franchise_id,
        registration_id,
        status,
        notes,
        verified_at,
        player_season_registrations (
          id,
          programme,
          academic_year,
          branch,
          bucket,
          players (
            full_name,
            roll_number
          )
        )
      `)
      .eq('franchise_id', franchiseId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((r: any) => {
      const reg = r.player_season_registrations;
      const player = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;

      return {
        id: r.id,
        franchiseId: r.franchise_id,
        registrationId: r.registration_id,
        status: r.status,
        notes: r.notes,
        verifiedAt: r.verified_at,
        playerName: player?.full_name || 'Player',
        rollNumber: player?.roll_number || '',
        programme: reg?.programme || '',
        academicYear: reg?.academic_year || 1,
        branch: reg?.branch || null,
        bucket: reg?.bucket || 'B1',
        hasConflict: r.status === 'conflict',
      };
    });
  } catch (err) {
    console.error('Failed to get franchise referrals:', err);
    return [];
  }
}

/**
 * Retrieves all tournament referrals across all franchises for Super Admin review (§6).
 */
export async function getAllSeasonReferrals(
  supabase: SupabaseClient,
  seasonId: string
): Promise<Array<FranchiseReferralItem & { franchiseName: string }>> {
  try {
    const { data, error } = await supabase
      .from('franchise_referrals')
      .select(`
        id,
        franchise_id,
        registration_id,
        status,
        notes,
        verified_at,
        franchises!inner (
          id,
          name,
          season_id
        ),
        player_season_registrations (
          id,
          programme,
          academic_year,
          branch,
          bucket,
          players (
            full_name,
            roll_number
          )
        )
      `)
      .eq('franchises.season_id', seasonId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((r: any) => {
      const reg = r.player_season_registrations;
      const player = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;

      return {
        id: r.id,
        franchiseId: r.franchise_id,
        franchiseName: r.franchises?.name || 'Franchise',
        registrationId: r.registration_id,
        status: r.status,
        notes: r.notes,
        verifiedAt: r.verified_at,
        playerName: player?.full_name || 'Player',
        rollNumber: player?.roll_number || '',
        programme: reg?.programme || '',
        academicYear: reg?.academic_year || 1,
        branch: reg?.branch || null,
        bucket: reg?.bucket || 'B1',
        hasConflict: r.status === 'conflict',
      };
    });
  } catch (err) {
    console.error('Failed to get all season referrals:', err);
    return [];
  }
}
