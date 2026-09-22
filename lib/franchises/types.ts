// =============================================================================
// ACC Auction Portal — Franchise Application Types
// =============================================================================

import type { DbFranchise } from '@/lib/db/types';
import type {
  PurseState,
  BucketProgressSummary,
  SquadConstraintStatus,
  AcquisitionType,
} from '@/domain/franchises';

export interface SquadPlayerItem {
  lotId: string;
  registrationId: string;
  playerId: string;
  fullName: string;
  photoUrl: string | null;
  rollNumber: string;
  programme: string;
  academicYear: number;
  branch: string | null;
  bucket: string;
  derivedPlayerType: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  acquisitionType: AcquisitionType;
  acquisitionPrice: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  // NOTE: Private contact fields (players.mobile, etc.) are strictly excluded
}

export interface FranchiseSquadSummary {
  franchise: DbFranchise;
  purseState: PurseState;
  bucketProgress: BucketProgressSummary;
  squadConstraints: SquadConstraintStatus;
  squadPlayers: SquadPlayerItem[];
}

import type { PlayerCareerStats } from '@/lib/players/types';

export interface PlayerDiscoveryItem {
  registrationId: string;
  seasonId: string;
  playerId: string;
  fullName: string;
  photoUrl: string | null;
  programme: string;
  academicYear: number;
  branch: string | null;
  bucket: string;
  basePrice: number;
  registrationStatus: string;
  cricheroesStatus: string;
  cricheroesUrl: string | null;
  isAuctionEligible: boolean;
  derivedPlayerType: string | null;
  isBatter: boolean | null;
  isBowler: boolean | null;
  isWicketKeeper: boolean | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  experienceYears: number | null;
  rollNumber?: string;
  auctionStatus?: string;
  fieldingPosition?: string | null;
  highestBidderFranchiseId?: string | null;
  careerStats?: PlayerCareerStats;
  notes?: string | null;
  // NOTE: Mobile numbers and private credentials are strictly absent
}

export interface PlayerDiscoveryFilters {
  bucket?: string;
  derivedPlayerType?: string;
  searchQuery?: string;
}
