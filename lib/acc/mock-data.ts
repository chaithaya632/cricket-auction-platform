import type {
  Player,
  Franchise,
  SaleRecord,
  AuctionState,
  Bucket,
  PlayerType,
  PlayerStatus,
} from "./types"

/**
 * Typed mock data for visual generation only.
 * Replace these exports with Supabase queries / Server Components / realtime
 * subscriptions during integration. Component boundaries do not depend on the
 * data source.
 */

function avatar(seed: string) {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1e293b`
}

function teamLogo(code: string, color: string) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(code)}&backgroundColor=${color.replace("#", "")}`
}

export const FRANCHISES: Franchise[] = [
  ["f1", "Avanthi Strikers", "AS", "#e63946", "Dr. K. V. Raman", "ECE", "Rohit Varma", "Suresh Kumar"],
  ["f2", "Makavarapalem Mavericks", "MM", "#1d3557", "Prof. P. Suresh", "CSE", "Kiran Royal", "Venkatesh P"],
  ["f3", "Tamaram Titans", "TT", "#457b9d", "Dr. G. Srinivas", "ME", "Naveen Babu", "Raju Naidu"],
  ["f4", "Narsipatnam Knights", "NK", "#2a9d8f", "Prof. M. Prasad", "EEE", "Ajay Dev", "Bhanu Prakash"],
  ["f5", "Godavari Gladiators", "GG", "#e76f51", "Dr. S. Chaitanya", "AI & ML", "Sai Teja", "Chandra Sekhar"],
  ["f6", "Visakha Voyagers", "VV", "#f4a261", "Prof. B. Apparao", "Data Science", "Harsha Vardhan", "Manoj K"],
  ["f7", "Polytechnic Panthers", "PP", "#6d597a", "Dr. D. Ramesh", "Polytechnic", "Pradeep Kumar", "Santosh Reddy"],
  ["f8", "Eastern Eagles", "EE", "#355070", "Prof. K. Satish", "ECE", "Dinesh Karthik", "Tarun G"],
  ["f9", "Carnival Challengers", "CC", "#b56576", "Dr. T. Venkat", "CSE", "Rakesh Roshan", "Ganesh V"],
  ["f10", "Coastal Cobras", "CCO", "#3d5a80", "Prof. N. Murthy", "ME", "Vijay Krishna", "Abhishek S"],
  ["f11", "Royal Rangers", "RR", "#9b5de5", "Dr. R. Jagadeesh", "EEE", "Siva Rama", "Deepak Chowdary"],
].map(([id, teamName, shortCode, colorHex, coordinatorName, coordinatorDept, captainName, viceCaptainName]) => ({
  id,
  teamName,
  shortCode,
  colorHex,
  coordinatorName,
  coordinatorDept,
  captainName,
  viceCaptainName,
  startingPurse: 1000,
  logoUrl: teamLogo(shortCode, colorHex),
}))

let tokenCounter = 100

function mkPlayer(
  id: string,
  rollNumber: string,
  fullName: string,
  program: string,
  branch: string,
  yearOfStudy: number,
  bucket: Bucket,
  basePrice: number,
  playerType: PlayerType,
  status: PlayerStatus,
  stats: Partial<Player["stats"]>,
  extra?: { soldTo?: string; soldPrice?: number },
): Player {
  const course = bucket === "PG" ? "PG" : bucket === "B5" ? "Diploma" : "UG"
  return {
    id,
    rollNumber,
    fullName,
    photoUrl: avatar(fullName),
    course,
    program,
    branch,
    yearOfStudy,
    isLateral: rollNumber.includes("815"),
    bucket,
    playerType,
    basePrice,
    status,
    registeredAt: "2026-01-12",
    cricheroesVerified: true,
    auctionToken: tokenCounter++,
    soldTo: extra?.soldTo,
    soldPrice: extra?.soldPrice,
    stats: {
      matches: 0,
      runs: 0,
      battingAvg: 0,
      strikeRate: 0,
      highestScore: 0,
      wickets: 0,
      bowlingAvg: 0,
      economy: 0,
      catches: 0,
      stumpings: 0,
      ...stats,
    },
  }
}

export const PLAYERS: Player[] = [
  // B3
  mkPlayer("p1", "24811A0401", "Kalyan Ram", "B.Tech", "ECE", 3, "B3", 50, "All-rounder", "SOLD", { matches: 14, runs: 380, battingAvg: 29.2, strikeRate: 142, highestScore: 78, wickets: 18, bowlingAvg: 16.4, economy: 6.8, catches: 9 }, { soldTo: "f1", soldPrice: 180 }),
  mkPlayer("p2", "25815A0403", "Vamsi Krishna", "B.Tech", "ECE", 3, "B3", 40, "Batter", "SOLD", { matches: 12, runs: 410, battingAvg: 34.1, strikeRate: 138.5, highestScore: 84, catches: 6 }, { soldTo: "f3", soldPrice: 150 }),
  mkPlayer("p3", "24811A0502", "Srinivas Rao", "B.Tech", "CSE", 3, "B3", 60, "Bowler", "IN_AUCTION", { matches: 16, runs: 85, battingAvg: 12, strikeRate: 110, wickets: 25, bowlingAvg: 14.2, economy: 5.9, catches: 4 }),
  mkPlayer("p4", "24811A4205", "Pavan Kalyan", "B.Tech", "CSM", 3, "B3", 40, "Wicket-keeper batter", "APPROVED", { matches: 10, runs: 260, battingAvg: 26, strikeRate: 130, highestScore: 56, catches: 12, stumpings: 7 }),
  mkPlayer("p5", "24811A0201", "Manish Varma", "B.Tech", "EEE", 3, "B3", 30, "All-rounder", "APPROVED", { matches: 8, runs: 150, battingAvg: 21.4, strikeRate: 125, wickets: 9, bowlingAvg: 21, economy: 7.2, catches: 5 }),
  mkPlayer("p6", "24811A0304", "Nikhil Kumar", "B.Tech", "ME", 3, "B3", 50, "Bowler", "UNDER_REVIEW", { matches: 15, runs: 60, wickets: 22, bowlingAvg: 15.1, economy: 6.1, catches: 3 }),

  // B4
  mkPlayer("p7", "23811A4201", "Anand Mohan", "B.Tech", "CSM", 4, "B4", 80, "All-rounder", "SOLD", { matches: 22, runs: 620, battingAvg: 36.4, strikeRate: 152, highestScore: 95, wickets: 28, bowlingAvg: 17.5, economy: 6.5, catches: 14 }, { soldTo: "f2", soldPrice: 320 }),
  mkPlayer("p8", "23811A0510", "Dileep Chakravarthy", "B.Tech", "CSE", 4, "B4", 70, "Batter", "SOLD", { matches: 20, runs: 580, battingAvg: 38.6, strikeRate: 145, highestScore: 92, catches: 8 }, { soldTo: "f1", soldPrice: 260 }),
  mkPlayer("p9", "23811A0415", "Govind Raj", "B.Tech", "ECE", 4, "B4", 60, "Bowler", "APPROVED", { matches: 18, runs: 45, wickets: 26, bowlingAvg: 13.8, economy: 5.8, catches: 5 }),
  mkPlayer("p10", "23811A0301", "Prashanth N", "B.Tech", "ME", 4, "B4", 40, "Wicket-keeper", "APPROVED", { matches: 14, runs: 180, battingAvg: 20, strikeRate: 115, catches: 15, stumpings: 9 }),
  mkPlayer("p11", "23811A4402", "Balaram Reddy", "B.Tech", "CSD", 4, "B4", 50, "All-rounder", "SOLD", { matches: 19, runs: 340, battingAvg: 28.3, strikeRate: 134, wickets: 15, bowlingAvg: 19.2, economy: 6.9, catches: 10 }, { soldTo: "f4", soldPrice: 190 }),

  // B2
  mkPlayer("p12", "25811A0505", "Teja Sai", "B.Tech", "CSE", 2, "B2", 40, "Batter", "APPROVED", { matches: 9, runs: 290, battingAvg: 32.2, strikeRate: 140, highestScore: 71, catches: 4 }),
  mkPlayer("p13", "25811A0410", "Rahul Dev", "B.Tech", "ECE", 2, "B2", 30, "Bowler", "SOLD", { matches: 11, runs: 30, wickets: 17, bowlingAvg: 16, economy: 6.2, catches: 3 }, { soldTo: "f5", soldPrice: 90 }),
  mkPlayer("p14", "25811A0206", "Karthik S", "B.Tech", "EEE", 2, "B2", 30, "All-rounder", "APPROVED", { matches: 8, runs: 160, battingAvg: 22.8, strikeRate: 128, wickets: 8, bowlingAvg: 22, economy: 7.4, catches: 6 }),
  mkPlayer("p15", "25811A4208", "Yogesh R", "B.Tech", "CSM", 2, "B2", 30, "Wicket-keeper batter", "APPROVED", { matches: 7, runs: 210, battingAvg: 30, strikeRate: 133, catches: 9, stumpings: 5 }),
  mkPlayer("p16", "25811A0312", "Aravind K", "B.Tech", "ME", 2, "B2", 20, "Batter", "UNDER_REVIEW", { matches: 6, runs: 140, battingAvg: 23.3, strikeRate: 121, catches: 2 }),

  // B5 (Diploma)
  mkPlayer("p17", "24597-CM-021", "Suraj Patnaik", "Polytechnic", "Computer Engineering", 3, "B5", 40, "All-rounder", "SOLD", { matches: 17, runs: 320, battingAvg: 26.6, strikeRate: 136, wickets: 14, bowlingAvg: 18.5, economy: 6.6, catches: 8 }, { soldTo: "f3", soldPrice: 140 }),
  mkPlayer("p18", "24597-EC-014", "Ramana Murthy", "Polytechnic", "ECE", 3, "B5", 30, "Bowler", "APPROVED", { matches: 15, runs: 40, wickets: 21, bowlingAvg: 14.9, economy: 5.7, catches: 4 }),
  mkPlayer("p19", "25597-M-008", "Bhaskar Rao", "Polytechnic", "Mechanical", 2, "B5", 30, "Batter", "APPROVED", { matches: 10, runs: 240, battingAvg: 27, strikeRate: 129, highestScore: 62, catches: 5 }),
  mkPlayer("p20", "25597-EE-019", "Naidu Prakash", "Polytechnic", "EEE", 2, "B5", 20, "All-rounder", "APPROVED", { matches: 9, runs: 130, battingAvg: 18.5, strikeRate: 118, wickets: 7, bowlingAvg: 23, economy: 7.6, catches: 6 }),
  mkPlayer("p21", "24597-CM-033", "Lokesh Varma", "Polytechnic", "Computer Engineering", 3, "B5", 30, "Wicket-keeper", "REGISTERED", { matches: 12, runs: 150, battingAvg: 17, strikeRate: 112, catches: 11, stumpings: 6 }),

  // B1
  mkPlayer("p22", "26811A0507", "Charan Teja", "B.Tech", "CSE", 1, "B1", 30, "Batter", "APPROVED", { matches: 5, runs: 180, battingAvg: 36, strikeRate: 144, highestScore: 66, catches: 3 }),
  mkPlayer("p23", "26811A0402", "Deepak Raj", "B.Tech", "ECE", 1, "B1", 20, "Bowler", "SOLD", { matches: 6, runs: 20, wickets: 12, bowlingAvg: 15.8, economy: 6, catches: 2 }, { soldTo: "f2", soldPrice: 70 }),
  mkPlayer("p24", "26811A0205", "Vikas Reddy", "B.Tech", "EEE", 1, "B1", 20, "All-rounder", "APPROVED", { matches: 4, runs: 90, battingAvg: 22.5, strikeRate: 126, wickets: 5, bowlingAvg: 20, economy: 7, catches: 3 }),
  mkPlayer("p25", "26811A4211", "Sandeep Kumar", "B.Tech", "CSM", 1, "B1", 20, "Wicket-keeper batter", "REGISTERED", { matches: 3, runs: 70, battingAvg: 23.3, strikeRate: 130, catches: 4, stumpings: 2 }),
  mkPlayer("p26", "26811A0309", "Ganesh Babu", "B.Tech", "ME", 1, "B1", 20, "Batter", "UNSOLD", { matches: 4, runs: 60, battingAvg: 15, strikeRate: 108, catches: 1 }),

  // PG
  mkPlayer("p27", "25MCA0012", "Ravi Teja", "MCA", "Computer Applications", 2, "PG", 40, "All-rounder", "SOLD", { matches: 18, runs: 360, battingAvg: 30, strikeRate: 138, wickets: 16, bowlingAvg: 18, economy: 6.7, catches: 9 }, { soldTo: "f5", soldPrice: 160 }),
  mkPlayer("p28", "25MBA0021", "Kishore Kumar", "MBA", "Management", 2, "PG", 30, "Batter", "APPROVED", { matches: 12, runs: 300, battingAvg: 33.3, strikeRate: 141, highestScore: 74, catches: 5 }),
  mkPlayer("p29", "24MTech0405", "Arun Kumar", "M.Tech", "VLSI", 2, "PG", 30, "Bowler", "APPROVED", { matches: 14, runs: 35, wickets: 19, bowlingAvg: 15.2, economy: 5.9, catches: 4 }),
  mkPlayer("p30", "25MCA0034", "Praveen Sai", "MCA", "Computer Applications", 1, "PG", 20, "Wicket-keeper batter", "REGISTERED", { matches: 8, runs: 190, battingAvg: 27.1, strikeRate: 132, catches: 8, stumpings: 4 }),
]

// Derive sales from sold players
export const SALES: SaleRecord[] = PLAYERS.filter((p) => p.status === "SOLD" && p.soldTo).map((p, i) => ({
  saleId: `sale_${i + 1}`,
  playerId: p.id,
  franchiseId: p.soldTo!,
  bucket: p.bucket,
  finalPrice: p.soldPrice!,
  auctionToken: p.auctionToken!,
  createdAt: "2026-02-10",
  isUndone: false,
}))

// Live auction state — current player p3 in progress
export const AUCTION_STATE: AuctionState = {
  status: "LIVE",
  lotNumber: 12,
  totalLots: 30,
  currentPlayerId: "p3",
  currentPrice: 120,
  leadingFranchiseId: "f3",
  timerSeconds: 18,
  bids: [
    { id: "b1", franchiseId: "f1", amount: 60, at: "12:04:02" },
    { id: "b2", franchiseId: "f3", amount: 80, at: "12:04:10" },
    { id: "b3", franchiseId: "f5", amount: 90, at: "12:04:18" },
    { id: "b4", franchiseId: "f1", amount: 100, at: "12:04:27" },
    { id: "b5", franchiseId: "f3", amount: 120, at: "12:04:35" },
  ],
}

// ---- Derived selectors (presentation helpers; backend authoritative) ----

export function getFranchise(id: string | null | undefined): Franchise | undefined {
  if (!id) return undefined
  return FRANCHISES.find((f) => f.id === id)
}

export function getPlayer(id: string | null | undefined): Player | undefined {
  if (!id) return undefined
  return PLAYERS.find((p) => p.id === id)
}

export function franchiseSquad(franchiseId: string): Player[] {
  return PLAYERS.filter((p) => p.status === "SOLD" && p.soldTo === franchiseId)
}

export function franchiseSpend(franchiseId: string): number {
  return franchiseSquad(franchiseId).reduce((sum, p) => sum + (p.soldPrice ?? 0), 0)
}

export function franchisePurse(franchiseId: string): number {
  const f = getFranchise(franchiseId)
  return (f?.startingPurse ?? 1000) - franchiseSpend(franchiseId)
}

export function bucketCounts(franchiseId: string): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0, PG: 0 }
  for (const p of franchiseSquad(franchiseId)) counts[p.bucket]++
  return counts
}

// The signed-in franchise used for the franchise portal mock views.
export const CURRENT_FRANCHISE_ID = "f1"
// The signed-in player used for the player portal mock views.
export const CURRENT_PLAYER_ID = "p4"
