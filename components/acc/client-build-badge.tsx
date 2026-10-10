'use client';

// =============================================================================
// ACC Auction Portal — Client Build Hash Indicator
// =============================================================================
// Displays the compiled client bundle commit SHA to definitively detect whether
// a long-lived browser session is running stale in-memory cached JavaScript.
// =============================================================================

import React from 'react';

export function ClientBuildBadge({ className = '' }: { className?: string }) {
  const hash = process.env.NEXT_PUBLIC_BUILD_HASH;
  if (!hash) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-400 bg-zinc-900/90 border border-zinc-800/80 px-2 py-0.5 rounded shadow-sm select-none ${className}`}
      title={`Compiled client bundle: ${hash}`}
    >
      <span className="size-1.5 rounded-full bg-emerald-500/80" />
      <span>build:{hash}</span>
    </span>
  );
}
