import type { ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

export interface AccBrandingPanelProps {
  /** Optional custom title (defaults to "Avanthi Cricket Championship") */
  title?: ReactNode
  /** Optional supporting description text */
  description?: string | ReactNode
  /** Optional action buttons (e.g. Home CTAs) */
  actions?: ReactNode
  /** Optional main card content rendered below the branding (e.g. Login / Signup card) */
  children?: ReactNode
  /** Optional custom footer (defaults to canonical footer string) */
  footer?: ReactNode
  /** Hide footer entirely */
  hideFooter?: boolean
  /** Additional container styling */
  className?: string
}

/**
 * Unified, canonical ACC Centered Branding Component.
 * Used identically across Home (/), Login (/login), and Signup (/signup).
 *
 * Strict Centered Visual Hierarchy:
 * 1. Centered Official Avanthi College Logo (avanthi-logo.png)
 * 2. Product Identity: Avanthi Cricket Championship
 * 3. Institutional Identity (Exactly once as readable foreground text):
 *    Avanthi Institute of Engineering & Technology (Autonomous)
 *    Makavarapalem, NAAC A+ Grade
 * 4. Optional description / CTA buttons / Auth Card
 * 5. Centered Footer: "Avanthi Institutions · Secure auction operations"
 */
export function AccBrandingPanel({
  title,
  description,
  actions,
  children,
  footer,
  hideFooter = false,
  className,
}: AccBrandingPanelProps) {
  return (
    <div
      className={cn(
        "relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center text-white gap-6",
        className
      )}
    >
      {/* 1. Centered Official Avanthi College Logo */}
      <Link
        href="/"
        className="group inline-flex items-center justify-center transition-transform hover:scale-[1.03]"
      >
        <div className="relative flex size-16 sm:size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl ring-2 ring-white/30">
          <Image
            src="/images/avanthi-logo.png"
            alt="Avanthi Institute of Engineering & Technology Logo"
            width={80}
            height={80}
            priority
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      </Link>

      {/* 2. Tournament & Institutional Identity — Centered */}
      <div className="flex flex-col items-center gap-2.5">
        <h1 className="text-balance text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
          {title ?? (
            <>
              Avanthi Cricket <span className="text-amber-400">Championship</span>
            </>
          )}
        </h1>

        {/* Institutional Identity — RENDERED ONLY ONCE */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <p className="text-base sm:text-lg md:text-xl font-bold text-zinc-100 leading-snug drop-shadow">
            Avanthi Institute of Engineering &amp; Technology (Autonomous)
          </p>
          <p className="text-sm sm:text-base font-semibold text-amber-400 tracking-wide drop-shadow">
            Makavarapalem, NAAC A+ Grade
          </p>
        </div>

        {/* Optional Supporting Copy */}
        {description && (
          <div className="max-w-xl pt-1 text-sm sm:text-base text-zinc-200/90 leading-relaxed drop-shadow">
            {typeof description === "string" ? <p>{description}</p> : description}
          </div>
        )}

        {/* Optional Action Buttons (Home CTAs) */}
        {actions && <div className="pt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>

      {/* 3. Centered Card Content (e.g., Login / Signup Form Card) */}
      {children && (
        <div className="w-full max-w-[460px] rounded-2xl border border-white/15 bg-zinc-950/85 p-6 sm:p-8 text-left text-zinc-100 shadow-2xl backdrop-blur-md">
          {children}
        </div>
      )}

      {/* 4. Centered Canonical Footer */}
      {!hideFooter && (
        <div className="pt-2 text-center text-xs sm:text-sm text-zinc-300/90 font-medium drop-shadow">
          {footer ?? <p>Avanthi Institutions · Secure auction operations</p>}
        </div>
      )}
    </div>
  )
}
