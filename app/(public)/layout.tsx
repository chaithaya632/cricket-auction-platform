import type { ReactNode } from "react"
import { SiteHeader, SiteFooter } from "@/components/acc/site-header"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}
