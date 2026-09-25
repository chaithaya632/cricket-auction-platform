import Image from "next/image"
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
    <div className={cn("flex items-center gap-3", className)}>
      <div
        aria-hidden
        className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5 shadow-sm border border-border/40"
      >
        <Image
          src="/images/avanthi-logo.png"
          alt="Avanthi Institute of Engineering & Technology"
          width={40}
          height={40}
          className="h-full w-full object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight text-foreground">
            Avanthi Cricket
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {subtitle ?? "Championship"}
          </span>
        </div>
      )}
    </div>
  )
}

export { AccBrandingPanel } from "./branding-panel"
