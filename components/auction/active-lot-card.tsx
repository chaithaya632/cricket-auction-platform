'use client';

// =============================================================================
// ACC Auction Portal — Components: Active Lot Card
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { AuctionLotWithDetails, AuctionLotFranchiseInfo } from '@/lib/auction/types';
import type { LotStatus } from '@/lib/constants';
import { bringDownUnsoldLotAction, reAuctionUnsoldLotAction } from '@/lib/auction/actions';
import {
  runWithLocalActionTracking,
  subscribeAuctionDelta,
} from '@/components/auction/auction-realtime-sync';
import { playBidGavelChime } from '@/lib/auction/audio';
import { AuctionHammerStamp } from './auction-hammer-stamp';

interface ActiveLotCardProps {
  lot: AuctionLotWithDetails | null;
  size?: 'normal' | 'projector';
  isAdmin?: boolean;
  onBringDown?: () => void;
  onReAuction?: () => void;
  isActionPending?: boolean;
}

export function ActiveLotCard({
  lot: incomingLot,
  size = 'normal',
  isAdmin = false,
  onBringDown,
  onReAuction,
  isActionPending = false,
}: ActiveLotCardProps) {
  const [isPending, setIsPending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [displayedLot, setDisplayedLot] = useState<AuctionLotWithDetails | null>(incomingLot);
  const isRetainingOutcomeRef = useRef(false);
  const pendingNextLotRef = useRef<AuctionLotWithDetails | null>(null);
  const retentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPrice, setCurrentPrice] = useState<number | null>(incomingLot?.current_price ?? null);
  const [highestBidder, setHighestBidder] = useState<AuctionLotFranchiseInfo | null>(incomingLot?.highest_bidder ?? null);
  const [lotStatus, setLotStatus] = useState<LotStatus>(incomingLot?.status ?? 'pending');

  const scheduleTransitionToNextLot = () => {
    isRetainingOutcomeRef.current = true;
    if (retentionTimerRef.current) clearTimeout(retentionTimerRef.current);
    retentionTimerRef.current = setTimeout(() => {
      isRetainingOutcomeRef.current = false;
      const next = pendingNextLotRef.current;
      pendingNextLotRef.current = null;
      if (next !== null) {
        setDisplayedLot(next);
        setCurrentPrice(next?.current_price ?? null);
        setHighestBidder(next?.highest_bidder ?? null);
        setLotStatus(next?.status ?? 'pending');
      }
    }, 2200);
  };

  useEffect(() => {
    // If we are currently holding a completed sold/unsold presentation, buffer any different incoming lot
    if (isRetainingOutcomeRef.current) {
      if (incomingLot?.id !== displayedLot?.id) {
        pendingNextLotRef.current = incomingLot;
      } else if (incomingLot) {
        setCurrentPrice(incomingLot.current_price ?? null);
        setHighestBidder(incomingLot.highest_bidder ?? null);
      }
      return;
    }

    setDisplayedLot(incomingLot);
    setCurrentPrice(incomingLot?.current_price ?? null);
    setHighestBidder(incomingLot?.highest_bidder ?? null);
    setLotStatus(incomingLot?.status ?? 'pending');

    if (incomingLot?.status === 'sold' || incomingLot?.status === 'unsold') {
      scheduleTransitionToNextLot();
    }
  }, [incomingLot?.id, incomingLot?.current_price, incomingLot?.highest_bidder, incomingLot?.status]);

  useEffect(() => {
    if (!displayedLot) return;
    return subscribeAuctionDelta((payload) => {
      if (payload.lotId && payload.lotId !== displayedLot.id) return;

      if (payload.type === 'BID_PLACED') {
        if (payload.currentPrice !== undefined && payload.currentPrice !== null) {
          setCurrentPrice(payload.currentPrice);
        }
        if (payload.highestBidderId) {
          setHighestBidder({
            id: payload.highestBidderId,
            name: payload.highestBidderName || 'Franchise',
            short_name: payload.highestBidderShortName || '',
            primary_color: payload.highestBidderPrimaryColor || '#10b981',
            secondary_color: null,
          });
        }
      } else if (payload.type === 'SALE') {
        if (lotStatus === 'sold' && displayedLot.id === payload.lotId) {
          return;
        }
        setLotStatus('sold');
        if (payload.currentPrice !== undefined && payload.currentPrice !== null) {
          setCurrentPrice(payload.currentPrice);
        }
        if (payload.highestBidderId) {
          setHighestBidder({
            id: payload.highestBidderId,
            name: payload.highestBidderName || 'Franchise',
            short_name: payload.highestBidderShortName || '',
            primary_color: payload.highestBidderPrimaryColor || '#10b981',
            secondary_color: null,
          });
        }
        setDisplayedLot((prev) =>
          prev
            ? {
                ...prev,
                status: 'sold',
                current_price: payload.currentPrice ?? prev.current_price,
                highest_bidder_franchise_id: payload.highestBidderId ?? prev.highest_bidder_franchise_id,
                highest_bidder: payload.highestBidderId
                  ? {
                      id: payload.highestBidderId,
                      name: payload.highestBidderName || 'Franchise',
                      short_name: payload.highestBidderShortName || '',
                      primary_color: payload.highestBidderPrimaryColor || '#10b981',
                      secondary_color: null,
                    }
                  : prev.highest_bidder,
              }
            : null
        );
        scheduleTransitionToNextLot();
        playBidGavelChime(displayedLot.id, payload.currentPrice ?? currentPrice);
      } else if (payload.type === 'UNSOLD') {
        if (lotStatus === 'unsold' && displayedLot.id === payload.lotId) {
          return;
        }
        setLotStatus('unsold');
        setDisplayedLot((prev) => (prev ? { ...prev, status: 'unsold' } : null));
        scheduleTransitionToNextLot();
      }
    });
  }, [displayedLot?.id]);

  useEffect(() => {
    return () => {
      if (retentionTimerRef.current) {
        clearTimeout(retentionTimerRef.current);
      }
    };
  }, []);

  const lot = displayedLot;

  const handleBringDown = async () => {
    if (!lot || isPending || isActionPending) return;
    if (onBringDown) {
      onBringDown();
      return;
    }
    setFeedbackMsg(null);
    setIsPending(true);
    try {
      const res = await runWithLocalActionTracking(() => bringDownUnsoldLotAction(lot.id));
      if (!res.success) {
        setFeedbackMsg({ type: 'error', text: res.error || 'Failed to return player to lot queue.' });
      } else {
        setFeedbackMsg({ type: 'success', text: 'Player moved back to Lot Queue.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || 'Failed to return player to lot queue.' });
    } finally {
      setIsPending(false);
    }
  };

  const handleReAuction = async () => {
    if (!lot || isPending || isActionPending) return;
    if (onReAuction) {
      onReAuction();
      return;
    }
    setFeedbackMsg(null);
    setIsPending(true);
    try {
      const res = await runWithLocalActionTracking(() => reAuctionUnsoldLotAction(lot.id));
      if (!res.success) {
        setFeedbackMsg({ type: 'error', text: res.error || 'Failed to re-auction player.' });
      } else {
        setFeedbackMsg({ type: 'success', text: `Player queued for re-auction at base price ₹${res.data?.basePrice}.` });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || 'Failed to re-auction player.' });
    } finally {
      setIsPending(false);
    }
  };

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
    currentPrice !== null ? `₹${currentPrice}` : `₹${lot.base_price} (Base)`;

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-6 md:p-8 shadow-2xl relative overflow-hidden ${
        lotStatus === 'sold'
          ? 'border-amber-400/80 shadow-2xl shadow-amber-500/25 ring-2 ring-amber-400/40 scale-[1.01]'
          : lotStatus === 'unsold'
          ? 'border-red-500/60 shadow-red-500/20'
          : 'border-zinc-800'
      } ${
        isProjector ? 'p-10' : ''
      }`}
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Realistic Gavel Hammer Strike & Stamp Overlay */}
      <AuctionHammerStamp
        status={lotStatus}
        lotId={lot.id}
        size={size}
      />

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
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              lotStatus === 'in_progress'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                : lotStatus === 'sold'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-extrabold'
                : lotStatus === 'unsold'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {lotStatus === 'in_progress' ? 'LIVE ON FLOOR' : lotStatus.toUpperCase()}
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

          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            {lot.skills?.derived_player_type && (
              <span className="rounded-full bg-blue-500/20 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-blue-300 border border-blue-500/40">
                {lot.skills.derived_player_type.replace(/_/g, ' ')}
              </span>
            )}
            {lot.skills?.is_wicket_keeper && (
              <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-300 border border-purple-500/30">
                WK
              </span>
            )}
            {lot.skills?.experience_years ? (
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400">
                {lot.skills.experience_years} yrs exp
              </span>
            ) : null}
          </div>

          <p className="text-xs text-zinc-400 mt-1">
            {lot.registration.branch ? `${lot.registration.branch} • ` : ''}
            Year {lot.registration.academic_year} ({lot.registration.programme.toUpperCase()})
          </p>

          {(lot.skills?.batting_style || lot.skills?.bowling_style) && (
            <div className="mt-2 text-[11px] text-zinc-400 space-y-0.5">
              {lot.skills.batting_style && (
                <div>
                  🏏 <span className="capitalize">{lot.skills.batting_style.replace(/_/g, ' ')}</span>
                  {lot.skills.batting_order && (
                    <span className="text-zinc-500"> ({lot.skills.batting_order.replace(/_/g, ' ')})</span>
                  )}
                </div>
              )}
              {lot.skills.bowling_style && (
                <div>
                  🎯 <span className="capitalize">{lot.skills.bowling_style.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          )}

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
        <div className="md:col-span-8 flex flex-col justify-center space-y-4">
          {lotStatus === 'sold' ? (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-zinc-950 to-emerald-950/40 border-2 border-amber-400 p-6 md:p-8 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
              {/* Background celebration burst */}
              <div className="absolute -top-12 -right-12 size-40 bg-amber-400/20 rounded-full blur-2xl pointer-events-none animate-pulse" />

              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/25 px-4 py-1.5 text-sm sm:text-base font-black uppercase tracking-widest text-amber-300 border border-amber-400/60 shadow-lg shadow-amber-500/20 animate-bounce">
                  🔨 SOLD!
                </span>
                <span className="font-mono text-xs text-amber-200/80 uppercase tracking-wider font-bold">
                  Official Hammer Price
                </span>
              </div>

              <div
                className={`font-mono font-black text-emerald-400 tracking-tight mt-3 drop-shadow-md ${
                  isProjector ? 'text-7xl' : 'text-6xl'
                }`}
              >
                ₹{currentPrice !== null ? currentPrice : lot.base_price}
              </div>

              <div className="mt-6 pt-5 border-t border-zinc-800/80">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400 block mb-3">
                  ACQUIRED BY
                </span>
                {highestBidder ? (
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/90 border-2 border-amber-400/40 shadow-inner">
                    <div
                      className="size-14 rounded-xl flex items-center justify-center font-black text-xl text-zinc-950 shadow-md shrink-0 border border-white/20"
                      style={{
                        backgroundColor: highestBidder.primary_color || '#eab308',
                      }}
                    >
                      {highestBidder.short_name}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-zinc-100 text-2xl md:text-3xl tracking-tight truncate leading-tight">
                        {highestBidder.name}
                      </h3>
                      <p className="text-xs text-emerald-400 font-mono font-semibold mt-1">
                        Winning Franchise · Final Sale Confirmed at ₹{currentPrice !== null ? currentPrice : lot.base_price}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-zinc-400 italic">
                    Allotted to Franchise
                  </div>
                )}
              </div>
            </div>
          ) : lotStatus === 'unsold' ? (
            <div className="rounded-2xl bg-zinc-950/90 border-2 border-red-500/50 p-6 md:p-8 shadow-xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-4 py-1.5 text-sm font-black uppercase tracking-widest text-red-400 border border-red-500/50 shadow-sm">
                  UNSOLD
                </span>
                <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                  Passed at Opening Price
                </span>
              </div>

              <div
                className={`font-mono font-black text-zinc-400 tracking-tight mt-3 ${
                  isProjector ? 'text-6xl' : 'text-5xl'
                }`}
              >
                ₹{lot.base_price}
              </div>
              <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
                Passed without bids at opening base price. Retains eligibility for future Round 2 re-auction or returning to lot queue.
              </p>

              {isAdmin && (
                <div className="mt-5 pt-4 border-t border-red-500/20 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBringDown}
                    disabled={isPending || isActionPending}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span>⬇️</span>
                    <span>BRING DOWN TO LOT QUEUE</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReAuction}
                    disabled={isPending || isActionPending}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span>🔄</span>
                    <span>RE-AUCTION</span>
                  </button>
                </div>
              )}

              {feedbackMsg && (
                <div
                  className={`mt-3 text-xs font-semibold p-2.5 rounded-lg border ${
                    feedbackMsg.type === 'success'
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                      : 'bg-red-950/60 border-red-500/40 text-red-400'
                  }`}
                >
                  {feedbackMsg.text}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Current Price Display during active bidding */}
              <div className="rounded-xl bg-zinc-950/80 border border-zinc-800/80 p-5">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                  {currentPrice !== null ? 'CURRENT BID' : 'OPENING BASE PRICE'}
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

              {/* Highest Bidder Franchise Display during active bidding */}
              <div className="rounded-xl bg-zinc-950/80 border border-zinc-800/80 p-5">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  HIGHEST BIDDER
                </span>

                {highestBidder ? (
                  <div className="flex items-center gap-3 mt-2">
                    <div
                      className="size-11 rounded-lg flex items-center justify-center font-bold text-zinc-950 shadow shrink-0"
                      style={{
                        backgroundColor: highestBidder.primary_color || '#10b981',
                      }}
                    >
                      {highestBidder.short_name}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-100 text-lg">
                        {highestBidder.name}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        Holding highest bid at ₹{currentPrice}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-zinc-400 text-sm italic">
                    Waiting for opening bid from any eligible franchise...
                  </div>
                )}
              </div>
            </>
          )}

          {/* Self-Declared Career Stats / Questionnaire Summary (§14) */}
          {lot.skills?.parsed_stats && (() => {
            const stats = lot.skills.parsed_stats as Record<string, any>;

            const profileKeys = ['highestLevelPlayed', 'playedPreviousAcc', 'previousAccTeam', 'bowlingRoles', 'fieldingZone'];

            const batKeywords = ['bat', 'runs', 'innings', 'average', 'strike_rate', 'centuries', 'fifties', 'fours', 'sixes', 'highest'];
            const bowlKeywords = ['bowl', 'wickets', 'overs', 'economy', 'maiden'];
            const fieldKeywords = ['field', 'catch', 'stumping', 'run_out'];

            const allKeys = Object.keys(stats);

            const battingKeys = allKeys.filter(k => !profileKeys.includes(k) && batKeywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            const bowlingKeys = allKeys.filter(k => !profileKeys.includes(k) && !battingKeys.includes(k) && bowlKeywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            const fieldingKeys = allKeys.filter(k => !profileKeys.includes(k) && !battingKeys.includes(k) && !bowlingKeys.includes(k) && fieldKeywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));

            const formatLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, str => str.toUpperCase()).trim();
            const formatVal = (v: any) => {
              if (v === null || v === undefined || v === '') return <span className="text-zinc-600 italic">Unavailable</span>;
              if (Array.isArray(v)) return v.join(' • ');
              return String(v).replace(/_/g, ' ');
            };

            const renderSection = (title: string, keys: string[]) => {
              if (keys.length === 0) return null;
              return (
                <div className="rounded bg-zinc-900/80 p-3 text-xs mb-2">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold mb-2 pb-1 border-b border-zinc-800">{title}</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                    {keys.map(k => (
                      <div key={k} className="flex flex-col justify-center bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
                        <span className="text-zinc-400 text-[10px] mb-1">{formatLabel(k)}</span>
                        <span className="text-zinc-200 font-mono capitalize">{formatVal(stats[k])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <div className="mt-4 rounded-xl bg-zinc-950/90 border border-zinc-800/80 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
                  Player Profile & Statistics
                </h4>
                <div className="space-y-1">
                  {renderSection('Profile Info', profileKeys.filter(k => Object.prototype.hasOwnProperty.call(stats, k)))}
                  {renderSection('Batting Stats', battingKeys)}
                  {renderSection('Bowling Stats', bowlingKeys)}
                  {renderSection('Fielding Stats', fieldingKeys)}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
