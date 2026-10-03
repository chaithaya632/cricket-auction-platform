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

  // Ensure any newly eligible registered players are automatically placed in the queue without generating redundant audit events on page read
  await autoQueueEligiblePlayers(adminClient, seasonId)

  const [sessionUser, activeLot, upcomingLots, unsoldLots, completedLots, candidates] = await Promise.all([
    getSessionUser("admin"),
    getActiveLot(adminClient, seasonId),
    getAuctionQueue(adminClient, seasonId, 100),
    getUnsoldLots(adminClient, seasonId, 100),
    getCompletedLots(adminClient, seasonId, 100),
    getEligiblePlayersForLotQueue(adminClient, seasonId),
  ])

  return (
    <div className="space-y-4">
      <div className="bg-emerald-950/80 border border-emerald-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙</span>
          <span>
            <strong>Unified Workflow Available:</strong> The Lot Queue and Live Console are now unified in the new <strong>Auction Control Center</strong>.
          </span>
        </div>
        <a
          href="/admin/auction"
          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-all"
        >
          Open Auction Control Center →
        </a>
      </div>
      <LotQueueManager
        sessionUser={sessionUser}
        activeLot={activeLot}
        upcomingLots={upcomingLots}
        unsoldLots={unsoldLots}
        completedLots={completedLots}
        candidates={candidates}
      />
    </div>
  )
}
