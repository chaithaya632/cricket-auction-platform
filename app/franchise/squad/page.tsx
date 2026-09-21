// =============================================================================
// ACC Auction Portal — Franchise Squad Roster Page (Live Data)
// =============================================================================

import Link from 'next/link';
import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getFranchiseSquadData } from '@/lib/franchises';

export default async function FranchiseSquadPage() {
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
              {assignedFranchise.name} — Squad Roster
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Official squad roster, player acquisitions, and bucket allocations for{' '}
              {activeSeason?.name || 'ACC 2026'}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/franchise/players"
              className="rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Scout Available Players
            </Link>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className="rounded-xl border p-5 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Available Purse
          </span>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            ₹{purseState?.remainingPurse ?? 1000}
          </p>
          <span className="text-[11px] text-gray-400">
            Spent: ₹{purseState?.totalSpent ?? 0}
          </span>
        </div>

        <div
          className="rounded-xl border p-5 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Total Squad
          </span>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {squadPlayers.length}{' '}
            <span className="text-sm font-normal text-gray-400">/ 22</span>
          </p>
          <span
            className={`text-[11px] font-medium ${
              squadConstraints?.isBelowMinimum ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {squadConstraints?.isBelowMinimum
              ? `Need ${17 - squadPlayers.length} for minimum 17`
              : 'Minimum 17 Reached'}
          </span>
        </div>

        <div
          className="rounded-xl border p-5 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Auction Purchases
          </span>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {purseState?.auctionPurchasesCount ?? 0}{' '}
            <span className="text-sm font-normal text-gray-400">/ 15 min</span>
          </p>
          <span className="text-[11px] text-gray-400">
            Allotted: {purseState?.allotmentCount ?? 0} • Scouted: {purseState?.scoutingCount ?? 0}
          </span>
        </div>

        <div
          className="rounded-xl border p-5 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Mandatory Buckets
          </span>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {bucketProgress?.buckets.filter((b) => b.isMandatory && b.isFulfilled).length ?? 0}{' '}
            <span className="text-sm font-normal text-gray-400">/ 5</span>
          </p>
          <span
            className={`text-[11px] font-medium ${
              bucketProgress?.allMandatoryFulfilled ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {bucketProgress?.allMandatoryFulfilled
              ? '✓ All Quotas Met'
              : `${bucketProgress?.mandatoryDeficitSum ?? 10} players needed`}
          </span>
        </div>
      </div>

      {/* Squad Roster Table */}
      <div
        className="rounded-xl border bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Acquired Player Roster ({squadPlayers.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real operational acquisitions projected from the live auction.
          </p>
        </div>

        {squadPlayers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-2xl">
              🏏
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              No Players Acquired Yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
              Players will be added automatically to your squad when won in the live auction,
              auto-allotted in the endgame, or signed via scouting.
            </p>
            <div className="mt-4">
              <Link
                href="/franchise/players"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Explore eligible player catalog →
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50/50 dark:bg-gray-800/40 text-xs text-gray-500 dark:text-gray-400" style={{ borderColor: 'var(--border)' }}>
                <tr>
                  <th className="py-3 px-4 font-semibold">#</th>
                  <th className="py-3 px-4 font-semibold">Player</th>
                  <th className="py-3 px-4 font-semibold">Academic Profile</th>
                  <th className="py-3 px-4 font-semibold">Bucket</th>
                  <th className="py-3 px-4 font-semibold">Role & Style</th>
                  <th className="py-3 px-4 font-semibold">Acquisition</th>
                  <th className="py-3 px-4 font-semibold text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {squadPlayers.map((player, idx) => (
                  <tr key={player.lotId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="py-3.5 px-4 text-xs text-gray-400">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {player.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={player.photoUrl}
                            alt={player.fullName}
                            className="h-8 w-8 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {player.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {player.fullName}
                          </span>
                          {player.isCaptain && (
                            <span className="ml-2 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                              Captain
                            </span>
                          )}
                          {player.isViceCaptain && (
                            <span className="ml-2 rounded bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800">
                              Vice Captain
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-400">
                      {player.programme === 'diploma'
                        ? 'Diploma'
                        : `B.Tech Yr ${player.academicYear}`}
                      {player.branch ? ` • ${player.branch}` : ''}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        {player.bucket}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="capitalize font-medium text-gray-800 dark:text-gray-200">
                        {player.derivedPlayerType?.replace(/_/g, ' ') || 'Player'}
                      </span>
                      {(player.battingStyle || player.bowlingStyle) && (
                        <div className="text-[11px] text-gray-400 capitalize">
                          {[player.battingStyle, player.bowlingStyle]
                            .filter(Boolean)
                            .map((s) => s?.replace(/_/g, ' '))
                            .join(' • ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
                          player.acquisitionType === 'sold'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : player.acquisitionType === 'allotted'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {player.acquisitionType === 'sold'
                          ? 'Auction'
                          : player.acquisitionType === 'allotted'
                          ? 'Allotment'
                          : 'Scouted'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-900 dark:text-gray-100">
                      ₹{player.acquisitionPrice}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
