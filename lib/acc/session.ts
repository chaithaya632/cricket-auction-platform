import { getFranchise, getPlayer, CURRENT_FRANCHISE_ID, CURRENT_PLAYER_ID } from "@/lib/acc/mock-data"
import type { Role } from "@/lib/acc/nav"

export interface SessionUser {
  name: string
  sub: string
  avatarUrl?: string
}

/**
 * Presentation-only mock session resolver. During integration this is replaced
 * by the Supabase auth session + role lookup. Component boundaries stay the same.
 */
export function mockUser(role: Role): SessionUser {
  if (role === "franchise") {
    const f = getFranchise(CURRENT_FRANCHISE_ID)
    return {
      name: f?.coordinatorName ?? "Franchise Owner",
      sub: f?.teamName ?? "Franchise",
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
        f?.coordinatorName ?? "franchise",
      )}&backgroundColor=1e293b`,
    }
  }
  if (role === "player") {
    const p = getPlayer(CURRENT_PLAYER_ID)
    return {
      name: p?.fullName ?? "Player",
      sub: p?.rollNumber ?? "—",
      avatarUrl: p?.photoUrl,
    }
  }
  return {
    name: "Auction Admin",
    sub: "admin@auction.local",
    avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=admin&backgroundColor=1e293b",
  }
}

