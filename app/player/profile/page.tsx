import type { Metadata } from 'next';
import { requirePlayer } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getPlayerFullData } from '@/lib/players/queries';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { PageHeader } from '@/components/acc/page-header';
import { PlayerStatsBlock } from '@/components/acc/player-stats';
import { CategoryBadge } from '@/components/acc/category-badge';
import { SkillBadges } from '@/components/acc/skill-badges';
import { PlayerStatusBadge } from '@/components/acc/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getSessionUser } from '@/lib/acc/server-session';
import { CURRENT_PLAYER_ID, getPlayer } from '@/lib/acc/mock-data';
import type { Bucket, PlayerType, PlayerStatus } from '@/lib/acc/types';

export const metadata: Metadata = { title: 'My Profile · Player' };

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function PlayerProfilePage() {
  const permContext = await requirePlayer();
  const supabase = await createClient();

  const seasonId = permContext.activeSeason?.id;
  const fullData = seasonId
    ? await getPlayerFullData(supabase, permContext.user.id, seasonId)
    : { player: null, registration: null, skillProfile: null };

  const fallback = getPlayer(CURRENT_PLAYER_ID)!;

  const displayName = fullData.player?.full_name || permContext.user.full_name || 'Player';
  const rollNumber = fullData.player?.roll_number || 'Pending Registration';
  const photoUrl = fullData.player?.photo_url || permContext.user.avatar_url || null;
  const bucket = (fullData.registration?.bucket || fallback.bucket) as Bucket;
  const regStatus = fullData.registration?.registration_status;
  let status: PlayerStatus = 'UNDER_REVIEW';
  if (fullData.registration?.is_auction_eligible || regStatus === 'eligible') {
    status = 'APPROVED';
  } else if (regStatus === 'pending_verification' || regStatus === 'pending_payment') {
    status = 'UNDER_REVIEW';
  } else if (regStatus === 'draft') {
    status = 'REGISTERED';
  } else if (regStatus === 'ineligible') {
    status = 'REJECTED';
  } else if (fallback?.status) {
    status = fallback.status;
  }
  const playerType = (fullData.skillProfile
    ? fullData.skillProfile.is_wicket_keeper
      ? 'Wicket-keeper'
      : fullData.skillProfile.is_batter && fullData.skillProfile.is_bowler
      ? 'All-rounder'
      : fullData.skillProfile.is_batter
      ? 'Batter'
      : fullData.skillProfile.is_bowler
      ? 'Bowler'
      : fallback.playerType
    : fallback.playerType) as PlayerType;

  const sessionUser = await getSessionUser('player');
  sessionUser.name = displayName;
  sessionUser.sub = rollNumber;
  sessionUser.avatarUrl = photoUrl || undefined;

  return (
    <DashboardShell role="player" user={sessionUser} breadcrumb="My Profile">
      <PageHeader
        eyebrow="Player Portal"
        title="My profile"
        description="Your registered details and career record."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <Avatar className="size-24 rounded-2xl border-2">
                <AvatarImage src={photoUrl || '/placeholder.svg'} alt={displayName} />
                <AvatarFallback className="rounded-2xl text-2xl">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-lg font-bold">{displayName}</h2>
              <p className="font-mono text-sm text-muted-foreground">{rollNumber}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <CategoryBadge bucket={bucket} withLabel />
                <PlayerStatusBadge status={status} />
              </div>
              <SkillBadges playerType={playerType} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registration details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field
                label="Course"
                value={fullData.registration?.programme || fallback.course}
              />
              <Field
                label="Program"
                value={fullData.registration?.programme || fallback.program}
              />
              <Field
                label="Branch"
                value={fullData.registration?.branch || fallback.branch}
              />
              <Field
                label="Year of study"
                value={`Year ${fullData.registration?.academic_year || fallback.yearOfStudy}`}
              />
              <Field
                label="Base Price"
                value={`₹${fullData.registration?.base_price || fallback.basePrice}`}
              />
              <Field label="Player type" value={playerType} />
              <Field
                label="CricHeroes"
                value={
                  fullData.registration?.cricheroes_status === 'verified'
                    ? 'Verified'
                    : fullData.registration?.cricheroes_url
                    ? 'Submitted'
                    : 'Not Linked'
                }
              />
              <Field
                label="Status"
                value={status.replace('_', ' ')}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Career statistics</h2>
          <PlayerStatsBlock stats={fallback.stats} />
        </div>
      </div>
    </DashboardShell>
  );
}
