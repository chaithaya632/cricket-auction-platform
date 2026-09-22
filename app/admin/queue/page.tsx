import type { Metadata } from "next"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getActiveLot, getAuctionQueue, getEligiblePlayersForLotQueue } from "@/lib/auction/queries"
import { LotQueueManager } from "@/components/acc/admin/lot-queue-manager"

export const metadata: Metadata = { title: "Lot Queue · Admin" }

export default async function AdminQueuePage() {
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const adminClient = createAdminClient()

  const [sessionUser, activeLot, upcomingLots, candidates] = await Promise.all([
    getSessionUser("admin"),
    getActiveLot(adminClient, seasonId),
    getAuctionQueue(adminClient, seasonId, 100),
    getEligiblePlayersForLotQueue(adminClient, seasonId),
  ])

  return (
    <LotQueueManager
      sessionUser={sessionUser}
      activeLot={activeLot}
      upcomingLots={upcomingLots}
      candidates={candidates}
    />
  )
}
