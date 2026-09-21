// =============================================================================
// ACC Auction Portal — Application Layer: Auction Types
// =============================================================================

import type { LotStatus, AuctionEventType } from '@/lib/constants';

export interface AuctionLotPlayerInfo {
  id: string;
  full_name: string;
  photo_url: string | null;
}

export interface AuctionLotRegistrationInfo {
  id: string;
  branch: string;
  academic_year: number;
  programme: string;
  cricheroes_profile_url: string | null;
}

export interface AuctionLotFranchiseInfo {
  id: string;
  name: string;
  short_name: string;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface AuctionLotWithDetails {
  id: string;
  season_id: string;
  registration_id: string;
  bucket: string;
  draw_number: number;
  base_price: number;
  round: number;
  status: LotStatus;
  current_price: number | null;
  highest_bidder_franchise_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  player: AuctionLotPlayerInfo;
  registration: AuctionLotRegistrationInfo;
  highest_bidder: AuctionLotFranchiseInfo | null;
}

export interface AuctionEventDTO {
  id: string;
  season_id: string;
  auction_lot_id: string;
  event_type: AuctionEventType;
  actor_user_id: string;
  franchise_id: string | null;
  price: number | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  sequence_number: number | string;
  created_at: string;
  franchise?: AuctionLotFranchiseInfo | null;
}

export interface AuctionConfigDTO {
  firstBidTimerSeconds: number;
  subsequentBidTimerSeconds: number;
  minAuctionPurchases: number;
  maxSquadSize: number;
  minSquadSize: number;
  defaultPurse: number;
}

export interface AuctionActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type RestoreToMode = 'resume_bidding' | 'return_to_queue';
