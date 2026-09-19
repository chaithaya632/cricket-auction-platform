// =============================================================================
// ACC Auction Portal — Shared TypeScript Types
// =============================================================================
// Domain-level types used across the application.
// These are NOT database row types (those come from Supabase codegen in Phase 2).
// These are the business-domain shapes used by domain logic and UI.
// =============================================================================

import type {
  Role,
  Bucket,
  AuctionEventType,
  BasePrice,
  CricHeroesStatus,
  RegistrationStatus,
  LotStatus,
  PlayerType,
} from './constants';

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------
export interface Season {
  id: string;
  name: string;           // e.g. "ACC 2026"
  year: number;
  startingPurse: number;  // configurable per season
  maxFranchises: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Season Role Assignment
// ---------------------------------------------------------------------------
export interface SeasonRole {
  userId: string;
  seasonId: string;
  role: Role;
  franchiseId?: string; // set when role === 'franchise'
}

// ---------------------------------------------------------------------------
// Player (permanent identity — spec §8)
// ---------------------------------------------------------------------------
export interface Player {
  id: string;
  rollNumber: string;   // globally unique
  name: string;
  mobile: string;       // private — never in public APIs
  photoUrl?: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Player Season Registration (spec §8)
// ---------------------------------------------------------------------------
export interface PlayerSeasonRegistration {
  id: string;
  playerId: string;
  seasonId: string;
  basePrice: BasePrice;
  bucket: Bucket | 'PG';
  academicYear: number;
  branch?: string;
  programme: 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';
  playerType: PlayerType;
  cricHeroesStatus: CricHeroesStatus;
  cricHeroesProfileUrl?: string;
  registrationStatus: RegistrationStatus;
  paymentStatus: 'unpaid' | 'paid';
  isAuctionEligible: boolean;
  yearOverride?: number;  // manual override for detained students
  yearOverrideReason?: string;
}

// ---------------------------------------------------------------------------
// Franchise
// ---------------------------------------------------------------------------
export interface Franchise {
  id: string;
  seasonId: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Franchise Member
// ---------------------------------------------------------------------------
export interface FranchiseMember {
  id: string;
  franchiseId: string;
  userId: string;
  role: 'owner' | 'captain' | 'vice_captain' | 'coordinator';
  playerRegistrationId?: string; // links captain/vc to their player record
}

// ---------------------------------------------------------------------------
// Referral (spec §14)
// ---------------------------------------------------------------------------
export interface FranchiseReferral {
  id: string;
  franchiseId: string;
  playerRegistrationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'conflict';
  verifiedBy?: string;
  verifiedAt?: string;
}

// ---------------------------------------------------------------------------
// Auction Lot
// ---------------------------------------------------------------------------
export interface AuctionLot {
  id: string;
  seasonId: string;
  playerRegistrationId: string;
  bucket: Bucket | 'PG';
  drawNumber: number;
  basePrice: number;
  status: LotStatus;
  currentPrice?: number;
  currentBidderId?: string;  // franchise ID
  round: 1 | 2;
}

// ---------------------------------------------------------------------------
// Auction Event (spec §23 — event-sourced)
// ---------------------------------------------------------------------------
export interface AuctionEvent {
  id: string;
  lotId: string;
  seasonId: string;
  eventType: AuctionEventType;
  franchiseId?: string;
  price?: number;
  actorId: string;        // user who triggered the event
  reason?: string;        // for undo, skip, etc.
  metadata?: Record<string, unknown>;
  timestamp: string;
  sequenceNumber: number; // monotonic within a lot
}

// ---------------------------------------------------------------------------
// Franchise Auction State (projected/derived — NOT source of truth)
// ---------------------------------------------------------------------------
export interface FranchiseAuctionState {
  franchiseId: string;
  seasonId: string;
  currentPurse: number;
  auctionPurchases: number;
  bucketPurchases: Record<Bucket, number>;
  remainingSlots: number;
  maxPermissibleBid: number;
  canBidOnCurrentLot: boolean;
}

// ---------------------------------------------------------------------------
// Scarcity Info (spec §22)
// ---------------------------------------------------------------------------
export interface BucketScarcity {
  bucket: Bucket | 'PG';
  availableSupply: number;  // unsold eligible players in this bucket
  totalDemand: number;      // sum of all franchises' remaining need
  isScarcity: boolean;      // supply <= demand
}

// ---------------------------------------------------------------------------
// Audit Log Entry (spec §37)
// ---------------------------------------------------------------------------
export interface AuditLogEntry {
  id: string;
  actor: string;
  actorRole: Role;
  action: string;
  target: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}
