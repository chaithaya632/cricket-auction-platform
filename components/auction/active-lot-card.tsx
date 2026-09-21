'use client';

// =============================================================================
// ACC Auction Portal — Components: Active Lot Card
// =============================================================================

import React from 'react';
import type { AuctionLotWithDetails } from '@/lib/auction/types';

interface ActiveLotCardProps {
  lot: AuctionLotWithDetails | null;
  size?: 'normal' | 'projector';
}

export function ActiveLotCard({ lot, size = 'normal' }: ActiveLotCardProps) {
  if (!lot) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-zinc-400">
        <div className="text-5xl mb-4">🏏</div>
        <h3 className="text-xl font-bold text-zinc-200">No Lot Currently In Progress</h3>
        <p className="text-sm mt-2 text-zinc-400 max-w-sm mx-auto">
          The auction operator will select the next player from the queue.
        </p>
      </div>
    );
  }

  const isProjector = size === 'projector';
  const priceDisplay =
    lot.current_price !== null ? `₹${lot.current_price}` : `₹${lot.base_price} (Base)`;

  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-6 md:p-8 shadow-2xl relative overflow-hidden ${
        isProjector ? 'p-10' : ''
      }`}
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header: Lot badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-mono font-bold text-zinc-300">
            LOT #{lot.draw_number}
          </span>
          <span className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
            {lot.bucket}
          </span>
          <span className="rounded-md bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-400">
            Round {lot.round}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              lot.status === 'in_progress'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                : lot.status === 'sold'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {lot.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Player Avatar */}
        <div className="md:col-span-4 flex flex-col items-center text-center">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-zinc-800 border-2 border-zinc-700/60 overflow-hidden flex items-center justify-center shadow-lg relative">
            {lot.player.photo_url ? (
              <img
                src={lot.player.photo_url}
                alt={lot.player.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-4xl md:text-5xl font-bold text-zinc-500">
                {lot.player.full_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <h2
            className={`mt-4 font-bold text-zinc-100 ${
              isProjector ? 'text-3xl' : 'text-2xl'
            }`}
          >
            {lot.player.full_name}
          </h2>

          <p className="text-xs text-zinc-400 mt-1">
            {lot.registration.branch ? `${lot.registration.branch} • ` : ''}
            Year {lot.registration.academic_year} ({lot.registration.programme.toUpperCase()})
          </p>

          {lot.registration.cricheroes_profile_url && (
            <a
              href={lot.registration.cricheroes_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 underline"
            >
              <span>Verified CricHeroes</span> ↗
            </a>
          )}
        </div>

        {/* Pricing & Highest Bidder Column */}
        <div className="md:col-span-8 flex flex-col justify-center space-y-6">
          {/* Current Price Display */}
          <div className="rounded-xl bg-zinc-950/80 border border-zinc-800/80 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {lot.current_price !== null ? 'Current Highest Bid' : 'Opening Base Price'}
            </span>
            <div
              className={`font-mono font-black text-emerald-400 tracking-tight mt-1 ${
                isProjector ? 'text-6xl' : 'text-5xl'
              }`}
            >
              {priceDisplay}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Base Price: ₹{lot.base_price}
            </div>
          </div>

          {/* Highest Bidder Franchise Display */}
          <div className="rounded-xl bg-zinc-950/80 border border-zinc-800/80 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Current Leading Franchise
            </span>

            {lot.highest_bidder ? (
              <div className="flex items-center gap-3 mt-2">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-zinc-900 shadow"
                  style={{
                    backgroundColor: lot.highest_bidder.primary_color || '#10b981',
                  }}
                >
                  {lot.highest_bidder.short_name}
                </div>
                <div>
                  <h4 className="font-bold text-zinc-100 text-lg">
                    {lot.highest_bidder.name}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Holding highest bid at ₹{lot.current_price}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-zinc-400 text-sm italic">
                Waiting for opening bid from any eligible franchise...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
