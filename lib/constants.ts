// =============================================================================
// ACC Auction Portal — Application Constants
// =============================================================================
// These are specification constants derived from the ACC rules document.
// They are NOT business logic — just named values.
// The domain layer imports these; they do not import anything.
// =============================================================================

// ---------------------------------------------------------------------------
// User Roles (spec §6)
// ---------------------------------------------------------------------------
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR: 'operator',
  FRANCHISE: 'franchise',
  PLAYER: 'player',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ---------------------------------------------------------------------------
// Auction Buckets (spec §10)
// ---------------------------------------------------------------------------
export const BUCKETS = {
  B1: 'B1', // B.Tech Year 1
  B2: 'B2', // B.Tech Year 2
  B3: 'B3', // B.Tech Year 3
  B4: 'B4', // B.Tech Year 4
  B5: 'B5', // Diploma
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

// PG players do not belong to a mandatory bucket
export const PG_CATEGORY = 'PG' as const;

// ---------------------------------------------------------------------------
// Default Auction Bucket Order (spec §16)
// ---------------------------------------------------------------------------
export const DEFAULT_BUCKET_ORDER = ['B3', 'B4', 'B2', 'B5', 'B1', 'PG'] as const;

// ---------------------------------------------------------------------------
// Base Price Ladder (spec §11)
// ---------------------------------------------------------------------------
export const BASE_PRICE_LADDER = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 230, 250,
] as const;

export type BasePrice = (typeof BASE_PRICE_LADDER)[number];

// ---------------------------------------------------------------------------
// Bid Increment Rules (spec §17)
// ---------------------------------------------------------------------------
// Below 100: +10
// 100–199:   +20
// 200+:      +30
export const BID_INCREMENT_RULES = [
  { maxExclusive: 100, increment: 10 },
  { maxExclusive: 200, increment: 20 },
  { maxExclusive: Infinity, increment: 30 },
] as const;

// ---------------------------------------------------------------------------
// Timer Durations in seconds (spec §18)
// ---------------------------------------------------------------------------
export const TIMER = {
  FIRST_BID_SECONDS: 30,
  SUBSEQUENT_BID_SECONDS: 20,
} as const;

// ---------------------------------------------------------------------------
// Squad / Franchise Rules (spec §15)
// ---------------------------------------------------------------------------
export const SQUAD_RULES = {
  MIN_AUCTION_PURCHASES: 15,
  MIN_BUCKET_PURCHASES: 2,   // per bucket B1–B5
  MAX_SQUAD_SIZE: 22,
  MIN_SQUAD_SIZE: 17,
  MAX_REFERRALS: 5,
  MIN_BASE_PRICE: 20,        // used in max-bid reserve calculation
} as const;

// ---------------------------------------------------------------------------
// Branch Codes (spec §9)
// ---------------------------------------------------------------------------
export const BRANCH_CODES: Record<string, string> = {
  '02': 'EEE',
  '03': 'ME',
  '04': 'ECE',
  '05': 'CSE',
  '42': 'CSM',
  '44': 'CSD',
};

// ---------------------------------------------------------------------------
// Academic Rollover Date (spec §9) — 1 July
// ---------------------------------------------------------------------------
export const ACADEMIC_ROLLOVER_MONTH = 7; // 1-indexed (July)
export const ACADEMIC_ROLLOVER_DAY = 1;

// ---------------------------------------------------------------------------
// Roll Number Patterns (spec §9)
// ---------------------------------------------------------------------------
// B.Tech regular: YY811Abbnn
// B.Tech lateral:  YY815Abbnn
// Diploma:         YY597-BB-nnn
export const ROLL_PATTERNS = {
  BTECH_REGULAR: /^(\d{2})811A(\d{2})(\d{2})$/,
  BTECH_LATERAL: /^(\d{2})815A(\d{2})(\d{2})$/,
  DIPLOMA: /^(\d{2})597-([A-Z]{1,2})-(\d{3})$/,
} as const;

// ---------------------------------------------------------------------------
// Auction Event Types (spec §23)
// ---------------------------------------------------------------------------
export const AUCTION_EVENT_TYPES = [
  'LOT_CREATED',
  'PLAYER_SELECTED',
  'BID_PLACED',
  'PASS',
  'RE_ENTER',
  'HAMMER',
  'SALE',
  'UNSOLD',
  'SKIP',
  'UNDO_SALE',
  'ALLOTMENT',
  'SCOUTING',
  'BUCKET_RELAXATION',
  'PAUSE',
  'RESUME',
] as const;

export type AuctionEventType = (typeof AUCTION_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// CricHeroes Status (spec §13)
// ---------------------------------------------------------------------------
export const CRICHEROES_STATUS = {
  PROFILE_CREATION_PENDING: 'profile_creation_pending',
  VERIFICATION_PENDING: 'verification_pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  UNVERIFIED: 'unverified',
} as const;

export type CricHeroesStatus = (typeof CRICHEROES_STATUS)[keyof typeof CRICHEROES_STATUS];

// ---------------------------------------------------------------------------
// Registration Status
// ---------------------------------------------------------------------------
export const REGISTRATION_STATUS = {
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  PENDING_VERIFICATION: 'pending_verification',
  ELIGIBLE: 'eligible',
  INELIGIBLE: 'ineligible',
} as const;

export type RegistrationStatus =
  (typeof REGISTRATION_STATUS)[keyof typeof REGISTRATION_STATUS];

// ---------------------------------------------------------------------------
// Auction Lot Status
// ---------------------------------------------------------------------------
export const LOT_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SOLD: 'sold',
  UNSOLD: 'unsold',
  SKIPPED: 'skipped',
  RECALLED: 'recalled',
  ALLOTTED: 'allotted',
  SCOUTED: 'scouted',
} as const;

export type LotStatus = (typeof LOT_STATUS)[keyof typeof LOT_STATUS];

// ---------------------------------------------------------------------------
// Player Types / Derived Roles (spec §12)
// ---------------------------------------------------------------------------
export const PLAYER_TYPES = [
  'batter',
  'bowler',
  'all_rounder',
  'wicket_keeper',
  'wicket_keeper_batter',
  'fielder',
] as const;

export type PlayerType = (typeof PLAYER_TYPES)[number];
