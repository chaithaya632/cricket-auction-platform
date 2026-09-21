"use client"

// =============================================================================
// ACC Auction Portal — Components: Live & Projector Operator Exit Navigation
// =============================================================================

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Maximize, Minimize, LogOut } from "lucide-react"

interface LiveExitBarProps {
  mode: "live_room" | "projector"
  destinationHref?: string
  destinationLabel?: string
}

export function LiveExitBar({
  mode,
  destinationHref = "/admin/auction",
  destinationLabel = "Operator Console",
}: LiveExitBarProps) {
  const router = useRouter()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)

  // Sync fullscreen state via fullscreenchange event (handles browser Esc key)
  const handleFullscreenChange = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement)
  }, [])

  useEffect(() => {
    setCanFullscreen(typeof document !== "undefined" && !!document.documentElement.requestFullscreen)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [handleFullscreenChange])

  // Exit fullscreen safely if active, then navigate
  const handleExit = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // Ignore fullscreen exit errors (e.g. already exited)
    }
    router.push(destinationHref)
  }

  // Toggle fullscreen mode
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // Browser permissions or user gesture failure
    }
  }

  if (mode === "projector") {
    return (
      <nav aria-label="Projector exit controls" className="relative z-50 flex items-center justify-between gap-3 bg-zinc-950/95 border-b border-zinc-800/80 px-4 py-2.5 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 font-semibold text-zinc-200 border border-zinc-700 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            title={`Exit projector and return to ${destinationLabel}`}
          >
            <ArrowLeft className="size-3.5" />
            <span>← {destinationLabel}</span>
          </button>

          <Link
            href={destinationHref}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 underline underline-offset-2 ml-1"
          >
            Exit Projector
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-300">
            {isFullscreen ? "Press Esc or click to exit fullscreen" : "Auditorium Mode"}
          </span>

          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 border border-zinc-800 cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize className="size-3" />
                  <span>Windowed</span>
                </>
              ) : (
                <>
                  <Maximize className="size-3" />
                  <span>Fullscreen</span>
                </>
              )}
            </button>
          )}
        </div>
      </nav>
    )
  }

  // Live Room Mode
  return (
    <nav aria-label="Live room navigation bar" className="relative z-50 flex flex-wrap items-center justify-between gap-2 bg-zinc-900/90 border-b border-zinc-800 px-4 py-2 text-xs text-zinc-300 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-600 px-3 py-1.5 font-bold text-white shadow-sm transition-colors cursor-pointer"
          title={`Return to ${destinationLabel}`}
        >
          <ArrowLeft className="size-3.5" />
          <span>← {destinationLabel}</span>
        </button>

        <Link
          href={destinationHref}
          className="hidden sm:inline text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Exit Live Room
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 font-medium text-zinc-300 border border-zinc-700 cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize className="size-3" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize className="size-3" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        )}

        <Link
          href="/admin"
          className="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 px-2.5 py-1 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
        >
          <LogOut className="size-3" />
          <span>Dashboard</span>
        </Link>
      </div>
    </nav>
  )
}
