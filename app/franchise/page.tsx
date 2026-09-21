// =============================================================================
// ACC Auction Portal — Franchise Dashboard (Live Data)
// =============================================================================

import Link from 'next/link';
import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getFranchiseSquadData } from '@/lib/franchises';

export default async function FranchiseDashboard() {
  const permContext = await requireFranchise();
  const { assignedFranchise, activeSeason } = permContext;

  const supabase = await createClient();

  const squadData = activeSeason
    ? await getFranchiseSquadData(supabase, assignedFranchise.id, activeSeason.id)
    : null;

  const purseState = squadData?.purseState;
  const bucketProgress = squadData?.bucketProgress;
  const squadConstraints = squadData?.squadConstraints;
  const squadPlayers = squadData?.squadPlayers || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {assignedFranchise.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Season: {activeSeason?.name || 'ACC 2026'} • Team Code: {assignedFranchise.short_name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/franchise/squad"
              className="rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              View Full Squad ({squadPlayers.length})
            </Link>
            <Link
              href="/franchise/players"
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Player Catalog
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Purse Metric */}
        <div
          className="rounded-xl border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              💰 Available Purse
            </h3>
            <span className="text-xs text-gray-400">
              Start: ₹{purseState?.startingPurse ?? 1000}
            </span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            ₹{purseState?.remainingPurse ?? 1000}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <span>Spent: ₹{purseState?.totalSpent ?? 0}</span>
            <span>
              {purseState?.allotmentCount ? `Allotted: ${purseState.allotmentCount} ` : ''}
              {purseState?.scoutingCount ? `Scouted: ${purseState.scoutingCount}` : ''}
            </span>
          </div>
        </div>

        {/* 2. Max Permissible Bid Metric */}
        <div
          className="rounded-xl border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              🎯 Max Permissible Bid
            </h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Authoritative (Spec §20)
            </span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            ₹{purseState?.maxBidResult?.maxBid ?? 720}
          </p>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <span>
              Reserve: {purseState?.maxBidResult?.reserveSlots ?? 14} slots (₹
              {purseState?.maxBidResult?.reservedPurse ?? 280})
            </span>
            <div className="mt-1 text-[11px] text-gray-400">
              {purseState?.maxBidResult?.limitingConstraint === 'total_purchases'
                ? 'Limited by total purchase deficit (G)'
                : purseState?.maxBidResult?.limitingConstraint === 'bucket_requirements'
                ? 'Limited by bucket deficit (D)'
                : purseState?.maxBidResult?.limitingConstraint === 'none'
                ? 'All mandatory requirements satisfied'
                : 'Balanced reserve constraint'}
            </div>
          </div>
        </div>

        {/* 3. Squad Count Metric */}
        <div
          className="rounded-xl border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              👥 Squad Size
            </h3>
            <span className="text-xs text-gray-400">Min 17 • Max 22</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {squadPlayers.length} <span className="text-lg font-normal text-gray-400">/ 22</span>
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <span>Auction: {purseState?.auctionPurchasesCount ?? 0} / 15 min</span>
            <span className={squadConstraints?.isBelowMinimum ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}>
              {squadConstraints?.isBelowMinimum
                ? `Need ${17 - squadPlayers.length} more`
                : 'Minimum Met'}
            </span>
          </div>
        </div>
      </div>

      {/* Bucket Quotas Section */}
      <div
        className="rounded-xl border p-6 bg-white dark:bg-gray-900 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              📊 Bucket Quota Progress
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Each franchise must acquire at least 2 players from buckets B1 through B5.
            </p>
          </div>
          {bucketProgress?.allMandatoryFulfilled ? (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              ✓ All Buckets Fulfilled
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              Quota Incomplete ({bucketProgress?.mandatoryDeficitSum ?? 10} needed)
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(bucketProgress?.buckets || []).map((b) => (
            <div
              key={b.bucket}
              className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                b.isFulfilled
                  ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40'
              }`}
            >
              <div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {b.bucket}
                </span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ({b.displayName})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {b.acquiredCount} / {b.minPurchases}
                </span>
                {b.isFulfilled ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    -{b.remainingNeeded}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Squad Preview / Empty State */}
      <div
        className="rounded-xl border p-6 bg-white dark:bg-gray-900 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            🏏 Squad Roster Overview
          </h2>
          <Link
            href="/franchise/squad"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            View Details →
          </Link>
        </div>

        {squadPlayers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center border-gray-200 dark:border-gray-800">
            <div className="text-2xl mb-1">🏏</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              No players acquired yet
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Players acquired during live bidding, auto-allotment, or scouting will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-gray-500 dark:text-gray-400" style={{ borderColor: 'var(--border)' }}>
                <tr>
                  <th className="pb-3 font-semibold">Player</th>
                  <th className="pb-3 font-semibold">Bucket</th>
                  <th className="pb-3 font-semibold">Role</th>
                  <th className="pb-3 font-semibold">Acquisition</th>
                  <th className="pb-3 font-semibold text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {squadPlayers.slice(0, 5).map((player) => (
                  <tr key={player.lotId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="py-3 font-medium text-gray-900 dark:text-gray-100">
                      {player.fullName}
                      {player.isCaptain && (
                        <span className="ml-2 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                          C
                        </span>
                      )}
                      {player.isViceCaptain && (
                        <span className="ml-2 rounded bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                          VC
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {player.bucket}
                    </td>
                    <td className="py-3 text-xs capitalize text-gray-600 dark:text-gray-400">
                      {player.derivedPlayerType?.replace(/_/g, ' ') || 'Player'}
                    </td>
                    <td className="py-3 text-xs capitalize text-gray-500">
                      {player.acquisitionType === 'sold'
                        ? 'Auction'
                        : player.acquisitionType === 'allotted'
                        ? 'Allotment'
                        : 'Scouted'}
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                      ₹{player.acquisitionPrice}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {squadPlayers.length > 5 && (
              <p className="mt-3 text-center text-xs text-gray-500">
                + {squadPlayers.length - 5} more players.{' '}
                <Link href="/franchise/squad" className="text-emerald-600 hover:underline">
                  View complete roster
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
