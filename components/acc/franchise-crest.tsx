import { cn } from "@/lib/utils"
import type { Franchise } from "@/lib/acc/types"

const SIZES = {
  sm: "size-8 text-[10px]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
  xl: "size-20 text-2xl",
}

export function FranchiseCrest({
  franchise,
  size = "md",
  className,
}: {
  franchise: Pick<Franchise, "shortCode" | "colorHex" | "teamName">
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-mono font-bold text-white shadow-sm",
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: franchise.colorHex,
        borderColor: "color-mix(in srgb, white 25%, transparent)",
      }}
      aria-label={franchise.teamName}
    >
      {franchise.shortCode}
    </div>
  )
}
