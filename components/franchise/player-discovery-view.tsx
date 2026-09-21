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

              {/* Card Footer: Base Price & CricHeroes link */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Base: ₹{player.basePrice}
                </span>

                {player.cricheroesUrl ? (
                  <a
                    href={player.cricheroesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                  >
                    CricHeroes Profile ↗
                  </a>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">Unlinked</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
