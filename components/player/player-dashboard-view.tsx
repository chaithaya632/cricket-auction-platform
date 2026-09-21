'use client';

// =============================================================================
// ACC Auction Portal — Player Dashboard View
// =============================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlayerFullData, PlayerCareerStats } from '@/lib/players/types';
import type { AuctionSessionState } from '@/lib/auction/types';
import { CareerStatsDialog } from './career-stats-dialog';
import {
  User,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Shield,
  Gavel,
  ArrowRight,
  ExternalLink,
  Edit,
  Flame,
} from 'lucide-react';

interface PlayerDashboardViewProps {
  fullData: PlayerFullData;
  careerStats: PlayerCareerStats;
  auctionLot: any | null;
  sessionState: AuctionSessionState;
  seasonName: string;
}

export function PlayerDashboardView({
  fullData,
  careerStats: initialCareerStats,
  auctionLot,
  sessionState,
  seasonName,
}: PlayerDashboardViewProps) {
  const router = useRouter();
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [careerStats, setCareerStats] = useState<PlayerCareerStats>(initialCareerStats);

  const { player, registration, skillProfile } = fullData;

  const isEligible = registration?.is_auction_eligible ?? false;
  const regStatus = registration?.registration_status ?? 'not_started';
  const bucket = registration?.bucket ?? 'Unassigned';
  const basePrice = registration?.base_price ?? 20;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. Live Auction Alert Banner (if auction is currently LIVE) */}
      {sessionState.isLive && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-5 shadow-xl text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full size-3 bg-white" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-wider text-xs uppercase bg-white/20 px-2 py-0.5 rounded">
                  AUCTION IS LIVE
                </span>
                <span className="text-xs font-semibold opacity-90">{seasonName}</span>
              </div>
              <p className="text-xs opacity-90 mt-0.5">
                Bidding is currently underway on the live hammer floor.
              </p>
            </div>
          </div>
          <Link
            href="/player/auction"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-black text-emerald-800 shadow-md hover:bg-emerald-50 transition-transform active:scale-95 cursor-pointer"
          >
            <Flame className="size-4 text-emerald-600" />
            <span>WATCH LIVE AUCTION</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {/* 2. Top Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Profile Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-start gap-4">
            {player?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.photo_url}
                alt={player.full_name}
                className="size-16 rounded-2xl object-cover border border-border shadow-sm"
              />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary font-black text-xl border border-primary/20">
                {player?.full_name ? player.full_name.charAt(0).toUpperCase() : <User />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black tracking-tight truncate text-foreground">
                {player?.full_name || 'Incomplete Profile'}
              </h2>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                {player?.roll_number || 'Roll number pending'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
                  {registration?.programme === 'diploma'
                    ? 'Diploma'
                    : `B.Tech Yr ${registration?.academic_year || 1}`}
                </span>
                {registration?.branch && (
                  <span className="rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    {registration.branch}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Contact: {player?.mobile || 'Unregistered'}</span>
            <Link
              href="/player/registration"
              className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <Edit className="size-3" />
              <span>Edit</span>
            </Link>
          </div>
        </div>

        {/* Tournament & Eligibility Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Auction Eligibility
              </span>
              {isEligible ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-3" />
                  ELIGIBLE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="size-3" />
                  ACTION REQUIRED
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Registration Status:</span>
                <span className="font-semibold capitalize text-foreground">{regStatus}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Assigned Bucket:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{bucket}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Base Price:</span>
                <span className="font-bold text-foreground">₹{basePrice}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CricHeroes:</span>
                <span className="font-medium text-foreground">
                  {registration?.cricheroes_url ? (
                    <a
                      href={registration.cricheroes_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span>Linked</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    'Not Linked'
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            {!isEligible ? (
              <Link
                href="/player/registration"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-2 text-xs font-bold text-zinc-950 transition-colors"
              >
                <span>Complete Registration Steps</span>
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center">
                All credentials verified. Your profile is active in the pool.
              </p>
            )}
          </div>
        </div>

        {/* Live Auction Floor Status Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Auction Lot Status
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold text-foreground">
                {auctionLot ? `#${auctionLot.draw_number}` : 'Unassigned'}
              </span>
            </div>

            <div className="mt-4">
              {auctionLot ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Current Status:</span>
                    <span
                      className={`font-black uppercase tracking-wider px-2 py-0.5 rounded text-[10px] ${
                        auctionLot.status === 'sold'
                          ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                          : auctionLot.status === 'in_progress'
                          ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30 animate-pulse'
                          : auctionLot.status === 'unsold'
                          ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {auctionLot.status.replace('_', ' ')}
                    </span>
                  </div>

                  {auctionLot.status === 'sold' && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Sold To:</span>
                        <span className="font-bold text-foreground">
                          {auctionLot.franchises?.name || 'Franchise'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Winning Bid:</span>
                        <span className="font-black text-emerald-500">
                          ₹{auctionLot.current_price}
                        </span>
                      </div>
                    </>
                  )}

                  {auctionLot.status === 'in_progress' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Active Floor Bid:</span>
                      <span className="font-black text-blue-400">
                        ₹{auctionLot.current_price || auctionLot.base_price}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  <p>Your lot has not been drawn to the floor yet.</p>
                  <p className="mt-1 text-[11px]">It will appear once the auctioneer begins your bucket round.</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <Link
              href="/player/auction"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 hover:bg-primary/20 py-2 text-xs font-bold text-primary transition-colors cursor-pointer"
            >
              <Gavel className="size-3.5" />
              <span>Enter Auction Spectator Room</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Skills & Questionnaire Section */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Skill Profile & Role</h3>
              <p className="text-xs text-muted-foreground">
                Evaluated discipline: {skillProfile?.derived_player_type?.replace(/_/g, ' ') || 'Unspecified'}
              </p>
            </div>
          </div>
          <Link
            href="/player/registration"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5"
          >
            <Edit className="size-3" />
            <span>Update Skills</span>
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-muted/50 p-3.5">
            <span className="block text-[11px] text-muted-foreground">Role Discipline</span>
            <span className="font-bold text-sm text-foreground capitalize">
              {skillProfile?.derived_player_type?.replace(/_/g, ' ') || 'Pending'}
            </span>
          </div>

          <div className="rounded-xl bg-muted/50 p-3.5">
            <span className="block text-[11px] text-muted-foreground">Batting Style</span>
            <span className="font-bold text-sm text-foreground capitalize">
              {skillProfile?.batting_style?.replace(/_/g, ' ') || 'N/A'}
            </span>
          </div>

          <div className="rounded-xl bg-muted/50 p-3.5">
            <span className="block text-[11px] text-muted-foreground">Bowling Style</span>
            <span className="font-bold text-sm text-foreground capitalize">
              {skillProfile?.bowling_style?.replace(/_/g, ' ') || 'N/A'}
            </span>
          </div>

          <div className="rounded-xl bg-muted/50 p-3.5">
            <span className="block text-[11px] text-muted-foreground">Playing Experience</span>
            <span className="font-bold text-sm text-foreground">
              {skillProfile?.experience_years ? `${skillProfile.experience_years} Years` : 'Amateur / College'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Career Statistics Section */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Trophy className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Official Career Statistics</h3>
              <p className="text-xs text-muted-foreground">
                Matches, averages, strike rates, and tournament highlights
              </p>
            </div>
          </div>

          {registration && (
            <button
              type="button"
              onClick={() => setShowStatsDialog(true)}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-black text-zinc-950 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Edit className="size-3" />
              <span>Update Career Stats</span>
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Matches</span>
            <span className="text-xl font-black text-foreground">{careerStats.matches}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Total Runs</span>
            <span className="text-xl font-black text-foreground">{careerStats.runs}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Batting Avg</span>
            <span className="text-xl font-black text-amber-500">{careerStats.battingAvg}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Strike Rate</span>
            <span className="text-xl font-black text-foreground">{careerStats.strikeRate}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Highest Score</span>
            <span className="text-xl font-black text-foreground">{careerStats.highestScore}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Wickets</span>
            <span className="text-xl font-black text-emerald-500">{careerStats.wickets}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Bowling Avg</span>
            <span className="text-xl font-black text-foreground">{careerStats.bowlingAvg}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Economy</span>
            <span className="text-xl font-black text-foreground">{careerStats.economy}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Catches</span>
            <span className="text-xl font-black text-sky-500">{careerStats.catches}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <span className="text-[11px] text-muted-foreground block">Stumpings</span>
            <span className="text-xl font-black text-sky-500">{careerStats.stumpings}</span>
          </div>
        </div>

        {careerStats.notes && (
          <div className="rounded-xl bg-muted/40 p-4 border border-border">
            <span className="text-xs font-bold text-muted-foreground block mb-1 uppercase tracking-wider">
              Player Highlights & Notes
            </span>
            <p className="text-xs text-foreground italic">{careerStats.notes}</p>
          </div>
        )}
      </div>

      {/* Career Stats Dialog */}
      {registration && (
        <CareerStatsDialog
          registrationId={registration.id}
          initialStats={careerStats}
          isOpen={showStatsDialog}
          onClose={() => setShowStatsDialog(false)}
          onSaved={(updated) => setCareerStats(updated)}
        />
      )}
    </div>
  );
}
