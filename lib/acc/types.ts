/**
 * ACC Player Auction — domain types.
 *
 * These mirror the existing Supabase schema so mock data can be swapped
 * for real queries / realtime subscriptions without changing components.
 * No business logic lives in the frontend — the backend/domain layer is
 * authoritative for purses, legality, scarcity and winners.
 */

export type Bucket = "B1" | "B2" | "B3" | "B4" | "B5" | "PG"

export type PlayerStatus =
  | "REGISTERED"
  | "DRAFT"
  | "UNDER_REVIEW"
  | "PENDING_VERIFICATION"
  | "PENDING"
  | "APPROVED"
  | "ELIGIBLE"
  | "IN_AUCTION"
  | "UPCOMING"
  | "SOLD"
  | "UNSOLD"
  | "REJECTED"
  | "BLOCKED"

export type PlayerType =
  | "Batter"
  | "Bowler"
  | "All-rounder"
  | "Wicket-keeper"
  | "Wicket-keeper batter"

export type AuctionStatus = "IDLE" | "LIVE" | "PAUSED" | "SOLD" | "UNSOLD"

export interface PlayerStats {
  matches: number
  runs: number
  battingAvg: number
  strikeRate: number
  highestScore: number
  wickets: number
  bowlingAvg: number
  economy: number
  catches: number
  stumpings: number
}

export interface Player {
  id: string
  rollNumber: string
  fullName: string
  photoUrl: string
  course: "UG" | "Diploma" | "PG"
  program: string
  branch: string
  yearOfStudy: number
  isLateral: boolean
  bucket: Bucket
  playerType: PlayerType
  basePrice: number
  status: PlayerStatus
  registeredAt: string
  cricheroesVerified: boolean
  soldTo?: string // franchise id
  soldPrice?: number
  auctionToken?: number
  stats: PlayerStats
  // Explicit workflow & review attributes
  registrationId?: string
  registrationStatus?: string
  paymentStatus?: 'unpaid' | 'paid'
  cricheroesStatus?: string
  cricheroesUrl?: string | null
  cricheroesMobile?: string | null
  mobile?: string | null
  isAuctionEligible?: boolean
  isActive?: boolean
  hasSkillProfile?: boolean
  hasRegistration?: boolean
  yearOverride?: number | null
  yearOverrideReason?: string | null
  eligibilityReasons?: string[]
  skillDetails?: {
    battingStyle?: string | null
    bowlingStyle?: string | null
    battingOrder?: string | null
    isWk?: boolean
  }
}

export interface Franchise {
  id: string
  teamName: string
  shortCode: string
  colorHex: string
  coordinatorName: string
  coordinatorDept: string
  captainName: string
  viceCaptainName: string
  startingPurse: number
  logoUrl?: string
}

export interface SaleRecord {
  saleId: string
  playerId: string
  franchiseId: string
  bucket: Bucket
  finalPrice: number
  auctionToken: number
  createdAt: string
  isUndone: boolean
}

export interface BidEvent {
  id: string
  franchiseId: string
  amount: number
  at: string
}

export interface AuctionState {
  status: AuctionStatus
  lotNumber: number
  totalLots: number
  currentPlayerId: string | null
  currentPrice: number
  leadingFranchiseId: string | null
  timerSeconds: number
  bids: BidEvent[]
}
