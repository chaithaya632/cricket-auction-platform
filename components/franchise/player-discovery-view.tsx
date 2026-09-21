'use client';

// =============================================================================
// ACC Auction Portal — Player Discovery Component (Franchise Scouting)
// =============================================================================

import { useState, useMemo } from 'react';
import type { PlayerDiscoveryItem } from '@/lib/franchises/types';

interface PlayerDiscoveryViewProps {
  initialPlayers: PlayerDiscoveryItem[];
  seasonName: string;
}

export function PlayerDiscoveryView({ initialPlayers, seasonName }: PlayerDiscoveryViewProps) {
  const [search, setSearch] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('ALL');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDiscoveryItem | null>(null);

  const filteredPlayers = useMemo(() => {
    return initialPlayers.filter((p) => {
      if (selectedBucket !== 'ALL' && p.bucket !== selectedBucket) {
        return false;
      }
      if (selectedRole !== 'ALL' && p.derivedPlayerType !== selectedRole) {
        return false;
      }
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = p.fullName.toLowerCase().includes(query);
        const matchesBranch = p.branch?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesBranch) {
          return false;
        }
      }
      return true;
    });
  }, [initialPlayers, selectedBucket, selectedRole, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Player Scouting Catalog</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Browse verified, auction-eligible players registered for {seasonName}.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by player name or branch..."
            className="w-full rounded-md border px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bucket Filter */}
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="ALL">All Buckets</option>
            <option value="B1">Bucket B1 (Year 1)</option>
            <option value="B2">Bucket B2 (Year 2)</option>
            <option value="B3">Bucket B3 (Year 3)</option>
            <option value="B4">Bucket B4 (Year 4)</option>
            <option value="B5">Bucket B5 (Diploma)</option>
            <option value="PG">Category PG</option>
          </select>

          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="ALL">All Roles</option>
            <option value="batter">Batters</option>
            <option value="bowler">Bowlers</option>
            <option value="all_rounder">All-Rounders</option>
            <option value="wicket_keeper">Wicket Keepers</option>
            <option value="wicket_keeper_batter">WK-Batters</option>
            <option value="fielder">Fielders</option>
          </select>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          Showing {filteredPlayers.length} of {initialPlayers.length} eligible players
        </span>
      </div>

      {/* Player Grid */}
      {filteredPlayers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center border-gray-300 dark:border-gray-700">
          <div className="text-3xl mb-2">🔍</div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            No matching players found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your search query or filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPlayers.map((player) => (
            <div
              key={player.registrationId}
              className="rounded-lg border p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {player.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={player.photoUrl}
                        alt={player.fullName}
                        className="h-11 w-11 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 font-semibold text-emerald-700 dark:text-emerald-400 text-sm border border-emerald-300 dark:border-emerald-800">
                        {player.fullName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {player.fullName}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {player.programme === 'diploma'
                          ? 'Diploma'
                          : `B.Tech Yr ${player.academicYear}`}
                        {player.branch ? ` • ${player.branch}` : ''}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    {player.bucket}
                  </span>
                </div>

                {/* Skill & Style Badges */}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {player.derivedPlayerType && (
                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-300 capitalize font-medium">
                      {player.derivedPlayerType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {player.battingStyle && (
                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-600 dark:text-gray-400 capitalize">
                      {player.battingStyle.replace(/_/g, ' ')}
                    </span>
                  )}
                  {player.bowlingStyle && (
                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-600 dark:text-gray-400 capitalize">
                      {player.bowlingStyle.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

                {/* Card Footer: Base Price, CricHeroes, & Inspect Stats */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    Base: ₹{player.basePrice}
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(player)}
                      className="font-semibold text-primary hover:underline cursor-pointer text-xs"
                    >
                      Inspect Stats 📊
                    </button>

                    {player.cricheroesUrl ? (
                      <a
                        href={player.cricheroesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                      >
                        CricHeroes ↗
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Unlinked</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Player Stats Inspection Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl text-zinc-100 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                {selectedPlayer.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedPlayer.photoUrl}
                    alt={selectedPlayer.fullName}
                    className="size-12 rounded-full object-cover border border-zinc-700"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-bold text-lg border border-amber-500/30">
                    {selectedPlayer.fullName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-black text-zinc-100">{selectedPlayer.fullName}</h3>
                  <p className="text-xs text-zinc-400">
                    {selectedPlayer.programme === 'diploma'
                      ? 'Diploma'
                      : `B.Tech Year ${selectedPlayer.academicYear}`} • {selectedPlayer.branch}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-amber-500/20 px-3 py-1 font-bold text-amber-400 border border-amber-500/30">
                Bucket {selectedPlayer.bucket}
              </span>
              <span className="rounded-full bg-zinc-800 px-3 py-1 font-bold text-zinc-200 capitalize">
                {selectedPlayer.derivedPlayerType?.replace(/_/g, ' ') || 'Player'}
              </span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-bold text-emerald-400 border border-emerald-500/30">
                Base Price: ₹{selectedPlayer.basePrice}
              </span>
            </div>

            {/* Career Stats Grid */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Tournament Career Statistics
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Matches</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.matches ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Total Runs</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.runs ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Batting Avg</span>
                  <span className="text-base font-black text-amber-400">
                    {selectedPlayer.careerStats?.battingAvg ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Strike Rate</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.strikeRate ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Highest</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.highestScore ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Wickets</span>
                  <span className="text-base font-black text-emerald-400">
                    {selectedPlayer.careerStats?.wickets ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Bowling Avg</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.bowlingAvg ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Economy</span>
                  <span className="text-base font-black text-zinc-100">
                    {selectedPlayer.careerStats?.economy ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Catches</span>
                  <span className="text-base font-black text-sky-400">
                    {selectedPlayer.careerStats?.catches ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-center">
                  <span className="text-[10px] text-zinc-400 block">Stumpings</span>
                  <span className="text-base font-black text-sky-400">
                    {selectedPlayer.careerStats?.stumpings ?? 0}
                  </span>
                </div>
              </div>

              {selectedPlayer.notes && (
                <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800 text-xs text-zinc-300 italic">
                  &ldquo;{selectedPlayer.notes}&rdquo;
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
