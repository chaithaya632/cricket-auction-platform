import { Card, CardContent } from "@/components/ui/card"
import { BUCKET_ORDER, CATEGORY_CONFIG } from "@/lib/acc/config"
import { cn } from "@/lib/utils"
import type { Bucket } from "@/lib/acc/types"

export function CategoryShowcase({ counts }: { counts: Record<Bucket, number> }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Six player categories</h2>
        <p className="max-w-2xl text-muted-foreground">
          Every registrant is bucketed by course and year of study. Franchises must build a balanced
          squad across all six categories.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {BUCKET_ORDER.map((bucket) => {
          const cfg = CATEGORY_CONFIG[bucket]
          return (
            <Card key={bucket} className={cn("gap-0 overflow-hidden py-0", cfg.borderClass)}>
              <div className="h-1.5 w-full" style={{ backgroundColor: cfg.token }} />
              <CardContent className="flex flex-col gap-1 p-4">
                <span
                  className={cn(
                    "inline-flex w-fit items-center rounded-md px-2 py-0.5 font-mono text-lg font-bold",
                    cfg.bgClass,
                    cfg.textClass,
                  )}
                >
                  {cfg.label}
                </span>
                <span className="mt-1 text-sm font-medium">{cfg.description}</span>
                <span className="text-xs text-muted-foreground">
                  {counts[bucket]} registered
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
