import type { Metadata } from "next"
import { getSessionUser } from "@/lib/acc/server-session"
import { LotQueueManager } from "@/components/acc/admin/lot-queue-manager"

export const metadata: Metadata = { title: "Lot Queue · Admin" }

export default async function AdminQueuePage() {
  const sessionUser = await getSessionUser("admin")
  return <LotQueueManager sessionUser={sessionUser} />
}
