'use client';

// =============================================================================
// ACC Auction Portal — Components: Franchise Bidding Control Panel
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { placeBidAction } from '@/lib/auction/actions';
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
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [optimisticBid, setOptimisticBid] = useState<{ lotId: string; price: number } | null>(null);

  if (!lot || lot.status !== 'in_progress') {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-400">
        <p className="text-sm">Bidding is closed while no lot is in progress.</p>
      </div>
    );
  }

  // Active optimistic state applies if for this lot and not yet reflected in current_price
  const hasOptimisticBid =
    optimisticBid !== null &&
    optimisticBid.lotId === lot.id &&
    (lot.current_price === null || lot.current_price < optimisticBid.price);

  const displayPrice = hasOptimisticBid ? optimisticBid.price : lot.current_price;
  const isHighestBidder = hasOptimisticBid || lot.highest_bidder_franchise_id === franchise.id;

  const nextBid = calculateNextBid(displayPrice, lot.base_price);
  const isSquadFull = franchise.squadCount >= franchise.maxSquadSize;
  const exceedsMaxBid = nextBid > franchise.maxPermissibleBid;

  const canBid = !isHighestBidder && !isSquadFull && !exceedsMaxBid && !isPending;

  const handlePlaceBid = () => {
    setErrorMsg(null);
    const bidTarget = nextBid;
    setOptimisticBid({ lotId: lot.id, price: bidTarget });

    startTransition(async () => {
      const res = await placeBidAction(lot.id, lot.current_price);
      if (!res.success) {
        setOptimisticBid(null);
        setErrorMsg(res.error || 'Failed to place bid.');
      } else {
        router.refresh();
      }
    });
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
        <div className="rounded-lg bg-red-950/80 border border-red-800/80 p-3 text-xs text-red-200 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            onClick={() => {
              setErrorMsg(null);
              router.refresh();
            }}
            className="underline font-semibold hover:text-red-100 shrink-0"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Status Warning Pills */}
      {isHighestBidder && (
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
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.99] cursor-pointer'
            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
        }`}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Submitting ₹{nextBid}...</span>
          </span>
        ) : isHighestBidder ? (
          <span>Leading Bidder (₹{displayPrice})</span>
        ) : exceedsMaxBid ? (
          <span>Bid Exceeds Permissible Limit</span>
        ) : (
          <span>Place Bid for ₹{nextBid}</span>
        )}
      </button>
    </div>
  );
}
