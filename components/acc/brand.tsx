import { cn } from "@/lib/utils"

export function AccLogo({
  className,
  showText = true,
  subtitle,
}: {
  className?: string
  showText?: boolean
  subtitle?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground shadow-sm"
      >
        ACC
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Avanthi Cricket</span>
          <span className="text-xs font-medium text-muted-foreground">
            {subtitle ?? "Championship"}
          </span>
        </div>
      )}
    </div>
  )
}
