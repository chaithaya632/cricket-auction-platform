import type { Metadata } from "next"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getActiveLot, getAuctionQueue, getUnsoldLots, getCompletedLots, getEligiblePlayersForLotQueue } from "@/lib/auction/queries"
import { autoQueueEligiblePlayers } from "@/lib/auction/actions"
import { LotQueueManager } from "@/components/acc/admin/lot-queue-manager"

export const metadata: Metadata = { title: "Lot Queue · Admin" }

export default async function AdminQueuePage() {
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const adminClient = createAdminClient()

  // Ensure any newly eligible registered players are automatically placed in the queue
  await autoQueueEligiblePlayers(adminClient, seasonId, adminContext.user.id)

  const [sessionUser, activeLot, upcomingLots, unsoldLots, completedLots, candidates] = await Promise.all([
    getSessionUser("admin"),
    getActiveLot(adminClient, seasonId),
    getAuctionQueue(adminClient, seasonId, 100),
    getUnsoldLots(adminClient, seasonId, 100),
    getCompletedLots(adminClient, seasonId, 100),
    getEligiblePlayersForLotQueue(adminClient, seasonId),
  ])

  return (
    <LotQueueManager
      sessionUser={sessionUser}
      activeLot={activeLot}
      upcomingLots={upcomingLots}
      unsoldLots={unsoldLots}
      completedLots={completedLots}
      candidates={candidates}
    />
  )
}
