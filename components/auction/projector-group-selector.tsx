'use client';

// =============================================================================
// ACC Auction Portal — Components: Projector Group Selector (Authorized Operator)
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_BUCKET_ORDER } from '@/lib/auction/types';
import { startNextBucketGroupAction } from '@/lib/auction/actions';
import { Play, Loader2 } from 'lucide-react';

interface ProjectorGroupSelectorProps {
  activeBuckets: string[];
  completedBuckets: string[];
  bucketStats: Record<string, { pending: number; total: number; inProgress: boolean }>;
}

export function ProjectorGroupSelector({
  activeBuckets,
  completedBuckets,
  bucketStats,
}: ProjectorGroupSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggleBucket = (bucket: string) => {
    setSelectedBuckets((prev) =>
      prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket]
    );
  };

  const handleStartNextGroup = () => {
    if (selectedBuckets.length === 0) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await startNextBucketGroupAction(selectedBuckets);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start next bucket group.');
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-950/50 via-zinc-950 to-zinc-950 p-8 md:p-12 text-center space-y-6 shadow-2xl max-w-4xl mx-auto">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          <span>✓</span>
          <span>CURRENT BUCKET GROUP COMPLETE</span>
        </span>
        <h2 className="text-3xl font-black text-white">All Lots in Active Group Concluded</h2>
        <p className="text-sm text-zinc-400 max-w-lg mx-auto">
          Completed buckets are locked. As an authorized auction operator, select the next bucket group to proceed with the auction.
        </p>
      </div>

      {/* Completed Buckets Badges */}
      <div className="flex flex-wrap justify-center gap-2">
        {activeBuckets.map((b) => (
          <span
            key={b}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-zinc-800/80 text-zinc-300 border border-zinc-700"
          >
            <span>{b}</span>
            <span className="text-emerald-400 font-bold">✓ COMPLETED</span>
          </span>
        ))}
      </div>

      {/* Remaining Buckets Selector */}
      <div className="pt-4 border-t border-zinc-800/80 max-w-xl mx-auto space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
          SELECT REMAINING BUCKETS
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {DEFAULT_BUCKET_ORDER.map((bucket) => {
            const isCompleted =
              completedBuckets.includes(bucket) ||
              (activeBuckets.includes(bucket) && (bucketStats?.[bucket]?.pending ?? 0) === 0);
            const isSelected = selectedBuckets.includes(bucket);
            const pendingCount = bucketStats?.[bucket]?.pending ?? 0;
            return (
              <button
                key={bucket}
                type="button"
                disabled={isCompleted || isPending || pendingCount === 0}
                onClick={() => handleToggleBucket(bucket)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                  isCompleted
                    ? 'bg-zinc-900/40 text-zinc-600 border-zinc-800/40 cursor-not-allowed'
                    : isSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-lg shadow-amber-950/40 cursor-pointer scale-105'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 cursor-pointer'
                }`}
              >
                <span className="font-black text-base">{bucket}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono">
                  {isCompleted ? '✓ Done' : `${pendingCount} left`}
                </span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>
        )}

        <div className="pt-2">
          <button
            type="button"
            disabled={isPending || selectedBuckets.length === 0}
            onClick={handleStartNextGroup}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4 fill-white" />
            )}
            <span>START SELECTED BUCKETS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
