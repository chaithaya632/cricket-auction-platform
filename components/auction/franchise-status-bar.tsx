'use client';

// =============================================================================
// ACC Auction Portal — Components: Franchise Status Bar & Live Leaderboard
// (Spec §14 Auditorium Projector 11-Franchise Bar & §15 Public Leaderboard)
// =============================================================================

import React from 'react';
import type { FranchiseLiveSummaryItem } from '@/lib/auction/types';

interface FranchiseStatusBarProps {
  franchises: FranchiseLiveSummaryItem[];
  activeLotDrawNumber?: number | null;
}

/**
 * 11-Franchise Live Status Bar (§14) for the Projector View.
 * Displays each franchise's real-time eligibility: IN PLAY (green), LEADING (gold),
 * or BLOCKED (red with reason like Max Bid or Bucket Deficit).
 */
export function FranchiseStatusBar({
  franchises,
  activeLotDrawNumber,
}: FranchiseStatusBarProps) {
  if (!franchises || franchises.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-zinc-950/95 border-t border-zinc-800/80 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
            11-Franchise Live Telemetry
          </span>
          {activeLotDrawNumber && (
            <span className="text-[11px] font-mono text-zinc-500">
              • Evaluating for Lot #{activeLotDrawNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-amber-400">Leading Bid</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-400">In Play</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-500" />
            <span className="text-red-400">Blocked</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2.5">
        {franchises.map((f) => {
          const isLeading = f.status === 'leading';
          const isBlocked = f.status === 'blocked';

          return (
            <div
              key={f.id}
              className={`rounded-xl p-2.5 flex flex-col justify-between border transition-all duration-200 text-center relative overflow-hidden ${
                isLeading
                  ? 'bg-amber-950/60 border-amber-500 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400'
                  : isBlocked
                  ? 'bg-red-950/30 border-red-900/60 opacity-80'
                  : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Top: Franchise Identification */}
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: f.primaryColor || '#10b981' }}
                />
                <span className="text-xs font-black tracking-tight text-zinc-100 truncate">
                  {f.shortName || f.name}
                </span>
              </div>

              {/* Middle: Financial & Squad Pulse */}
              <div className="space-y-0.5 my-1 font-mono text-[10px]">
                <div className="text-zinc-400">
                  Purse: <strong className="text-zinc-200 font-bold">₹{f.remainingPurse}</strong>
                </div>
                <div className="text-zinc-500">
                  Max: <strong className="text-emerald-400 font-bold">₹{f.maxPermissibleBid}</strong>
                </div>
                <div className="text-zinc-500">
                  Squad: <strong className="text-zinc-300 font-bold">{f.squadCount}/{f.maxSquadSize}</strong>
                </div>
              </div>

              {/* Bottom: Real-time Status Badge */}
              <div className="mt-1 pt-1.5 border-t border-zinc-800/80">
                {isLeading ? (
                  <span className="inline-block w-full py-0.5 rounded bg-amber-500 text-zinc-950 text-[10px] font-black uppercase tracking-wider animate-pulse">
                    LEADING
                  </span>
                ) : isBlocked ? (
                  <span
                    className="inline-block w-full py-0.5 rounded bg-red-950/90 text-red-400 border border-red-800/80 text-[9px] font-bold uppercase truncate px-1"
                    title={f.blockReason || 'Blocked'}
                  >
                    {f.blockReason || 'BLOCKED'}
                  </span>
                ) : (
                  <span className="inline-block w-full py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-[10px] font-bold uppercase tracking-wider">
                    IN PLAY
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FranchiseLeaderboardProps {
  franchises: FranchiseLiveSummaryItem[];
}

/**
 * Public Live View Leaderboard Table (§15).
 * Comprehensive table displaying all franchises, purse balance, max permissible bid,
 * squad progress, and bucket quotas (B1..B5).
 */
export function FranchiseLeaderboardTable({ franchises }: FranchiseLeaderboardProps) {
  if (!franchises || franchises.length === 0) {
    return null;
  }

  const buckets = ['B1', 'B2', 'B3', 'B4', 'B5', 'PG'];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-2xl overflow-hidden">
      <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 flex items-center gap-2">
            <span>🛡</span> Franchise Live Leaderboard & Quotas
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Authoritative real-time balance, maximum permissible bids, and mandatory bucket completion
          </p>
        </div>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-mono font-bold text-zinc-300">
          {franchises.length} Franchises Competing
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
            <tr>
              <th className="py-3 px-4">Franchise</th>
              <th className="py-3 px-3 text-right">Remaining Purse</th>
              <th className="py-3 px-3 text-right">Max Bid</th>
              <th className="py-3 px-3 text-center">Squad (Min 17)</th>
              {buckets.map((b) => (
                <th key={b} className="py-3 px-2 text-center">
                  {b} {b !== 'PG' ? '(Min 2)' : ''}
                </th>
              ))}
              <th className="py-3 px-4 text-center">Lot Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-200">
            {franchises.map((f) => {
              const isLeading = f.status === 'leading';
              const isBlocked = f.status === 'blocked';

              return (
                <tr
                  key={f.id}
                  className={`hover:bg-zinc-800/40 transition-colors ${
                    isLeading ? 'bg-amber-950/20' : ''
                  }`}
                >
                  {/* Franchise Name & Dot */}
                  <td className="py-3 px-4 font-sans font-bold flex items-center gap-2.5">
                    <span
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: f.primaryColor || '#10b981' }}
                    />
                    <div>
                      <span className="text-zinc-100">{f.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono ml-1.5 uppercase">
                        [{f.shortName}]
                      </span>
                    </div>
                  </td>

                  {/* Remaining Purse */}
                  <td className="py-3 px-3 text-right font-black text-zinc-100">
                    ₹{f.remainingPurse}
                  </td>

                  {/* Max Permissible Bid */}
                  <td className="py-3 px-3 text-right font-black text-emerald-400">
                    ₹{f.maxPermissibleBid}
                  </td>

                  {/* Squad Count */}
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                        f.squadCount >= 17
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {f.squadCount} / {f.maxSquadSize}
                    </span>
                  </td>

                  {/* Buckets B1..B5, PG */}
                  {buckets.map((b) => {
                    const count = f.bucketCounts[b] || 0;
                    const isMandatory = b !== 'PG';
                    const isMet = isMandatory ? count >= 2 : count > 0;

                    return (
                      <td key={b} className="py-3 px-2 text-center">
                        <span
                          className={`inline-block min-w-[24px] py-0.5 px-1 rounded text-[11px] font-bold ${
                            isMet
                              ? 'bg-emerald-950/60 text-emerald-400'
                              : isMandatory && count > 0
                              ? 'bg-amber-950/60 text-amber-300'
                              : isMandatory
                              ? 'bg-red-950/40 text-red-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {count}
                        </span>
                      </td>
                    );
                  })}

                  {/* Live Status on Active Lot */}
                  <td className="py-3 px-4 text-center font-sans">
                    {isLeading ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-zinc-950 animate-pulse">
                        LEADING
                      </span>
                    ) : isBlocked ? (
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-950 text-red-400 border border-red-800/80"
                        title={f.blockReason}
                      >
                        {f.blockReason || 'BLOCKED'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        IN PLAY
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
