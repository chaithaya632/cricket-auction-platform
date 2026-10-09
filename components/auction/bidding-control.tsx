'use client';

// =============================================================================
// ACC Auction Portal — Components: Franchise Bidding Control Panel
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { placeBidAction } from '@/lib/auction/actions';
import {
  runWithLocalActionTracking,
  subscribeAuctionDelta,
} from '@/components/auction/auction-realtime-sync';
import { calculateNextBid } from '@/domain/auction/bid-increment';
import type { AuctionLotWithDetails } from '@/lib/auction/types';

interface BiddingControlProps {
  lot: AuctionLotWithDetails | null;
  franchise: {
    id: string;
    name: string;
    shortName: string;
    remainingPurse: number;
    squadCount: number;
    maxSquadSize: number;
    maxPermissibleBid: number;
  };
}

export function BiddingControl({ lot, franchise }: BiddingControlProps) {
  const router = useRouter();
  const [liveLot, setLiveLot] = useState<AuctionLotWithDetails | null>(lot);
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [optimisticBid, setOptimisticBid] = useState<{ lotId: string; price: number } | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setLiveLot((prev) => {
      if (!lot) return null;
      if (!prev || prev.id !== lot.id) return lot;
      // Anti-stale guard: never downgrade current price if an in-memory broadcast has a higher price
      if (
        prev.current_price !== null &&
        (lot.current_price === null || lot.current_price < prev.current_price)
      ) {
        return prev;
      }
      return lot;
    });
  }, [lot?.id, lot?.current_price, lot?.highest_bidder_franchise_id, lot?.status]);

  useEffect(() => {
    return subscribeAuctionDelta((payload) => {
      if (payload.type === 'BID_PLACED') {
        if (payload.lotId && (!liveLot || liveLot.id === payload.lotId)) {
          setLiveLot((prev) => {
            const base = prev || (lot && lot.id === payload.lotId ? lot : null);
            if (!base || base.id !== payload.lotId) return base;
            return {
              ...base,
              current_price: payload.currentPrice ?? base.current_price,
              highest_bidder_franchise_id:
                payload.highestBidderId ?? base.highest_bidder_franchise_id,
              started_at: payload.startedAt || base.started_at,
            };
          });
          setOptimisticBid(null);
        }
      } else if (payload.type === 'PLAYER_SELECTED') {
        if (payload.activeLot) {
          setLiveLot(payload.activeLot as AuctionLotWithDetails);
          setOptimisticBid(null);
          setErrorMsg(null);
        } else if (payload.isEmptyFloor) {
          setLiveLot(null);
          setOptimisticBid(null);
        }
      } else if (payload.type === 'SALE' || payload.type === 'UNSOLD') {
        if (payload.lotId && liveLot && liveLot.id === payload.lotId) {
          setLiveLot((prev) =>
            prev ? { ...prev, status: payload.type === 'SALE' ? 'sold' : 'unsold' } : prev
          );
        }
      }
    });
  }, [liveLot?.id]);

  const activeLot = liveLot || lot;

  if (!activeLot || activeLot.status !== 'in_progress') {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-400">
        <p className="text-sm">Bidding is closed while no lot is in progress.</p>
      </div>
    );
  }

  // Authoritative server status vs. optimistic pending provisional state
  const isConfirmedLeader = activeLot.highest_bidder_franchise_id === franchise.id;
  const isProvisionalPending = Boolean(
    optimisticBid !== null &&
    optimisticBid.lotId === activeLot.id &&
    !isConfirmedLeader &&
    (activeLot.current_price === null || activeLot.current_price < optimisticBid.price)
  );

  const displayPrice = isProvisionalPending
    ? optimisticBid!.price
    : activeLot.current_price;
  const isHighestBidder = isConfirmedLeader || isProvisionalPending;

  const nextBid = calculateNextBid(displayPrice, activeLot.base_price);
  const isSquadFull = franchise.squadCount >= franchise.maxSquadSize;
  const exceedsMaxBid = nextBid > franchise.maxPermissibleBid;

  const canBid = !isHighestBidder && !isSquadFull && !exceedsMaxBid && !isPending;

  const handlePlaceBid = async () => {
    // Immediate anti-duplicate guard: reject secondary clicks synchronously before React rerenders
    if (isSubmittingRef.current || isPending || !activeLot) return;
    isSubmittingRef.current = true;

    setErrorMsg(null);
    const bidTarget = nextBid;
    setOptimisticBid({ lotId: activeLot.id, price: bidTarget });
    setIsPending(true);

    try {
      const res = await runWithLocalActionTracking(() =>
        placeBidAction(activeLot.id, activeLot.current_price)
      );
      if (!res.success) {
        // Revert provisional pending state immediately upon rejection
        setOptimisticBid(null);
        const isStale =
          res.error?.includes('STALE_BID_PRICE') ||
          res.error?.includes('no longer in progress') ||
          res.error?.includes('concurrent') ||
          res.error?.includes('expected price') ||
          res.error?.includes('expired');
        if (isStale) {
          router.refresh();
          setErrorMsg('Another franchise placed a bid first. The auction has been updated.');
        } else {
          setErrorMsg(res.error || 'Failed to place bid.');
        }
      } else if (res.data) {
        // Server confirmed: update local floor immediately if broadcast hasn't already arrived
        setLiveLot((prev) => {
          const base = prev || activeLot;
          return {
            ...base,
            current_price: res.data!.newPrice,
            highest_bidder_franchise_id: franchise.id,
          };
        });
        setOptimisticBid(null);
      }
    } catch (err: any) {
      // Revert provisional pending state on network or unexpected error
      setOptimisticBid(null);
      setErrorMsg(err?.message || 'Failed to place bid.');
    } finally {
      isSubmittingRef.current = false;
      setIsPending(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-5">
      {/* Header with Franchise Info */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-zinc-100">{franchise.name}</h3>
          <span className="text-xs text-zinc-400 font-mono">
            {franchise.shortName} • Squad: {franchise.squadCount}/{franchise.maxSquadSize}
          </span>
        </div>

        <div className="text-right">
          <span className="text-xs uppercase text-zinc-500 font-semibold block">
            Purse Available
          </span>
          <span className="font-mono text-lg font-bold text-emerald-400">
            ₹{franchise.remainingPurse}
          </span>
        </div>
      </div>

      {/* Constraints Indicator */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-950 p-3 border border-zinc-800/80">
          <span className="text-zinc-500 block font-medium">Max Permissible Bid</span>
          <span className="text-amber-400 font-mono font-bold text-sm mt-0.5 block">
            ₹{franchise.maxPermissibleBid}
          </span>
        </div>

        <div className="rounded-lg bg-zinc-950 p-3 border border-zinc-800/80">
          <span className="text-zinc-500 block font-medium">Next Legal Bid</span>
          <span className="text-emerald-400 font-mono font-bold text-sm mt-0.5 block">
            ₹{nextBid}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="rounded-lg bg-red-950/80 border border-red-800/80 p-3 text-xs text-red-200 flex items-center gap-2">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Status Warning Pills */}
      {isProvisionalPending && (
        <div className="rounded-lg bg-amber-950/60 border border-amber-800/60 p-3 text-xs text-amber-300 text-center font-medium flex items-center justify-center gap-2 animate-pulse">
          <span className="inline-block size-2 rounded-full bg-amber-400 animate-ping" />
          <span>✓ Your franchise currently holds the highest bid at ₹{displayPrice} (Pending Confirmation...)</span>
        </div>
      )}

      {isConfirmedLeader && !isProvisionalPending && (
        <div className="rounded-lg bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs text-emerald-300 text-center font-medium">
          ✓ Your franchise currently holds the highest bid at ₹{displayPrice}
        </div>
      )}

      {isSquadFull && (
        <div className="rounded-lg bg-amber-950/60 border border-amber-800/60 p-3 text-xs text-amber-300 text-center font-medium">
          ⚠ Squad limit reached (22/22 players). You cannot bid on further players.
        </div>
      )}

      {exceedsMaxBid && !isSquadFull && (
        <div className="rounded-lg bg-amber-950/60 border border-amber-800/60 p-3 text-xs text-amber-300 text-center font-medium">
          ⚠ Next bid of ₹{nextBid} exceeds your maximum permissible bid of ₹
          {franchise.maxPermissibleBid}. Funds must be reserved for mandatory squad slots.
        </div>
      )}

      {/* Single-Click Bidding Button */}
      <button
        type="button"
        onClick={handlePlaceBid}
        disabled={!canBid}
        className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-150 shadow-lg flex items-center justify-center gap-2 touch-manipulation select-none ${
          canBid
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] cursor-pointer'
            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
        }`}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Submitting ₹{optimisticBid?.price || nextBid} (Pending)...</span>
          </span>
        ) : isConfirmedLeader ? (
          <span>Leading Bidder (₹{displayPrice})</span>
        ) : isProvisionalPending ? (
          <span>Provisional Bid ₹{displayPrice} Pending</span>
        ) : exceedsMaxBid ? (
          <span>Bid Exceeds Permissible Limit</span>
        ) : (
          <span>Place Bid for ₹{nextBid}</span>
        )}
      </button>
    </div>
  );
}
