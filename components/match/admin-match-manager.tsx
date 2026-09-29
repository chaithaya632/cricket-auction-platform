'use client';

// =============================================================================
// ACC Match System — Admin Match Management & Scheduling Console
// =============================================================================

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Play,
  Calendar,
  MapPin,
  Video,
  Users,
  Award,
  AlertCircle,
  CheckCircle2,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  createMatchAction,
  updateMatchAction,
  assignMatchScorerAction,
  recordTossAction,
  startMatchAction,
  setPlayingXIAction,
} from '@/lib/matches/actions';
import type { DbMatch } from '@/lib/matches/types';

interface AdminMatchManagerProps {
  seasonId: string;
  seasonName: string;
  franchises: Array<{ id: string; name: string; short_name: string }>;
  users: Array<{ id: string; full_name: string; email: string }>;
  matches: Array<
    DbMatch & {
      teamA: { id: string; name: string; short_name: string };
      teamB: { id: string; name: string; short_name: string };
    }
  >;
  squadMap: Record<
    string,
    Array<{
      registrationId: string;
      fullName: string;
      derivedPlayerType: string | null;
    }>
  >;
}

export function AdminMatchManager({
  seasonId,
  seasonName,
  franchises,
  users,
  matches,
  squadMap,
}: AdminMatchManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScorerModal, setShowScorerModal] = useState(false);
  const [showTossModal, setShowTossModal] = useState(false);
  const [showPlayingXIModal, setShowPlayingXIModal] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  // Create Match form
  const [teamAId, setTeamAId] = useState(franchises[0]?.id || '');
  const [teamBId, setTeamBId] = useState(franchises[1]?.id || '');
  const [venue, setVenue] = useState('ACC Stadium, Campus Grounds');
  const [scheduledAt, setScheduledAt] = useState('');
  const [maxOvers, setMaxOvers] = useState(20);
  const [youtubeInput, setYoutubeInput] = useState('');

  // Scorer assignment form
  const [assignedUserId, setAssignedUserId] = useState(users[0]?.id || '');

  // Toss form
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState<'bat' | 'bowl'>('bat');

  // Playing XI form
  const [xiFranchiseId, setXiFranchiseId] = useState('');
  const [selectedPlayerRegIds, setSelectedPlayerRegIds] = useState<string[]>([]);
  const [captainRegId, setCaptainRegId] = useState('');
  const [keeperRegId, setKeeperRegId] = useState('');

  // YouTube modal form
  const [youtubeVideoInput, setYoutubeVideoInput] = useState('');

  // 1. Submit Create Match
  const handleCreateMatch = () => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (teamAId === teamBId) {
      setErrorMsg('Team A and Team B must be different franchises.');
      return;
    }

    startTransition(async () => {
      const res = await createMatchAction({
        seasonId,
        teamAId,
        teamBId,
        venue,
        scheduledAt: scheduledAt || null,
        maxOvers,
        youtubeUrlOrId: youtubeInput || null,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to create match.');
      } else {
        setSuccessMsg('Match fixture created successfully.');
        setShowCreateModal(false);
        router.refresh();
      }
    });
  };

  // 2. Submit Scorer Assignment
  const handleAssignScorer = () => {
    if (!selectedMatch || !assignedUserId || isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await assignMatchScorerAction({
        matchId: selectedMatch.id,
        userId: assignedUserId,
        isActive: true,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to assign scorer.');
      } else {
        setSuccessMsg('Scorer assigned successfully.');
        setShowScorerModal(false);
        router.refresh();
      }
    });
  };

  // 3. Submit Toss
  const handleRecordToss = () => {
    if (!selectedMatch || !tossWinnerId || isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await recordTossAction({
        matchId: selectedMatch.id,
        tossWinnerId,
        tossDecision,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to record toss.');
      } else {
        setSuccessMsg('Toss recorded successfully.');
        setShowTossModal(false);
        router.refresh();
      }
    });
  };

  // 4. Submit Start Match
  const handleStartMatch = (matchId: string) => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await startMatchAction(matchId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start match.');
      } else {
        setSuccessMsg('Match started and Innings 1 initialized!');
        router.refresh();
      }
    });
  };

  // 5. Submit Playing XI
  const handleSavePlayingXI = () => {
    if (!selectedMatch || !xiFranchiseId || isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (selectedPlayerRegIds.length !== 11) {
      setErrorMsg(`Exactly 11 players must be selected. (Currently selected: ${selectedPlayerRegIds.length})`);
      return;
    }
    if (!captainRegId || !selectedPlayerRegIds.includes(captainRegId)) {
      setErrorMsg('Captain must be one of the 11 selected players.');
      return;
    }
    if (!keeperRegId || !selectedPlayerRegIds.includes(keeperRegId)) {
      setErrorMsg('Wicket keeper must be one of the 11 selected players.');
      return;
    }

    startTransition(async () => {
      const res = await setPlayingXIAction({
        matchId: selectedMatch.id,
        franchiseId: xiFranchiseId,
        playerRegistrationIds: selectedPlayerRegIds,
        captainRegistrationId: captainRegId,
        wicketKeeperRegistrationId: keeperRegId,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to set Playing XI.');
      } else {
        setSuccessMsg('Playing XI saved successfully.');
        setShowPlayingXIModal(false);
        router.refresh();
      }
    });
  };

  // 6. Submit YouTube Video Update
  const handleUpdateYouTube = () => {
    if (!selectedMatch || isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await updateMatchAction({
        matchId: selectedMatch.id,
        youtubeUrlOrId: youtubeVideoInput,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to update YouTube live stream.');
      } else {
        setSuccessMsg('YouTube live stream updated successfully.');
        setShowYouTubeModal(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-black text-zinc-100 uppercase tracking-tight">
            Match Management Console
          </h2>
          <p className="text-xs text-zinc-400">
            Season: <strong className="text-zinc-200">{seasonName}</strong> • Schedule fixtures, set Playing XI, and assign official scorers.
          </p>
        </div>

        <Button
          onClick={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setShowCreateModal(true);
          }}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold gap-2 text-xs"
        >
          <Plus className="size-4" />
          Schedule New Match
        </Button>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-4 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-4 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Match List Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            All Matches ({matches.length})
          </h3>
        </div>

        {matches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase bg-zinc-950/50">
                  <th className="py-3 px-4">Teams</th>
                  <th className="py-3 px-4">Schedule & Venue</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Toss</th>
                  <th className="py-3 px-4">Stream</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {matches.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-bold text-zinc-100">
                      <div>
                        {m.teamA.name} <span className="text-zinc-500">vs</span> {m.teamB.name}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                        {m.teamA.short_name} vs {m.teamB.short_name} • Max {m.max_overs} ov
                      </div>
                    </td>

                    <td className="py-3 px-4 text-zinc-300">
                      <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                        <Calendar className="size-3.5 text-zinc-500" />
                        <span>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'TBD'}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-xs">{m.venue || 'Campus Grounds'}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          m.status === 'live' || m.status === 'toss' || m.status === 'innings_break'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : m.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {m.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-zinc-400">
                      {m.toss_winner_id ? (
                        <span className="font-semibold text-zinc-200">
                          {m.toss_winner_id === m.team_a_id ? m.teamA.short_name : m.teamB.short_name} ({m.toss_decision})
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedMatch(m);
                            setTossWinnerId(m.team_a_id);
                            setShowTossModal(true);
                          }}
                          className="underline text-amber-400 font-semibold hover:text-amber-300"
                        >
                          Record Toss
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          setSelectedMatch(m);
                          setYoutubeVideoInput(m.youtube_video_id || '');
                          setShowYouTubeModal(true);
                        }}
                        className={`flex items-center gap-1 font-semibold ${
                          m.youtube_video_id ? 'text-red-400 hover:text-red-300' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <Video className="size-3.5" />
                        <span>{m.youtube_video_id ? 'Configured' : 'Add Stream'}</span>
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Score Button */}
                        <Link href={`/admin/matches/${m.id}/score`}>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8">
                            Scorer Console
                          </Button>
                        </Link>

                        {/* Playing XI */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMatch(m);
                            setXiFranchiseId(m.team_a_id);
                            setSelectedPlayerRegIds([]);
                            setCaptainRegId('');
                            setKeeperRegId('');
                            setShowPlayingXIModal(true);
                          }}
                          className="border-zinc-700 text-zinc-300 text-xs h-8"
                        >
                          Playing XI
                        </Button>

                        {/* Assign Scorer */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMatch(m);
                            setShowScorerModal(true);
                          }}
                          className="border-zinc-700 text-zinc-300 text-xs h-8"
                        >
                          Assign Scorer
                        </Button>

                        {/* Start Match if in toss/scheduled */}
                        {m.status !== 'live' && m.status !== 'completed' && m.toss_winner_id && (
                          <Button
                            size="sm"
                            onClick={() => handleStartMatch(m.id)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
                          >
                            Start Match
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-zinc-500">
            No matches scheduled yet for this season. Click &quot;Schedule New Match&quot; to begin.
          </div>
        )}
      </div>

      {/* CREATE MATCH DIALOG */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-amber-400">
              Schedule New Match
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Team A</label>
                <select
                  value={teamAId}
                  onChange={(e) => setTeamAId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.short_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Team B</label>
                <select
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.short_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase">Venue</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Ground name / Pitch location"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Max Overs</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxOvers}
                  onChange={(e) => setMaxOvers(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase">
                YouTube Live Stream (URL or 11-char ID)
              </label>
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or video ID"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)} className="border-zinc-800 text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleCreateMatch} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              Create Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECORD TOSS DIALOG */}
      <Dialog open={showTossModal} onOpenChange={setShowTossModal}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-amber-400">
              Record Toss
            </DialogTitle>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4 py-2 text-xs">
              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Toss Winner</label>
                <select
                  value={tossWinnerId}
                  onChange={(e) => setTossWinnerId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                >
                  <option value={selectedMatch.team_a_id}>{selectedMatch.teamA.name}</option>
                  <option value={selectedMatch.team_b_id}>{selectedMatch.teamB.name}</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Toss Decision</label>
                <select
                  value={tossDecision}
                  onChange={(e) => setTossDecision(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                >
                  <option value="bat">Elected to Bat</option>
                  <option value="bowl">Elected to Bowl</option>
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowTossModal(false)} className="border-zinc-800 text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleRecordToss} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              Confirm Toss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ASSIGN SCORER DIALOG */}
      <Dialog open={showScorerModal} onOpenChange={setShowScorerModal}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-amber-400">
              Assign Official Scorer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase">Select User</label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-zinc-400 text-[11px]">
              Assigned scorers receive authorization to record deliveries and manage innings for this specific match only.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowScorerModal(false)} className="border-zinc-800 text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleAssignScorer} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              Assign Scorer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PLAYING XI DIALOG */}
      <Dialog open={showPlayingXIModal} onOpenChange={setShowPlayingXIModal}>
        <DialogContent className="sm:max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-amber-400">
              Select Playing XI (11 Players)
            </DialogTitle>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4 py-2 text-xs">
              {/* Franchise Selector */}
              <div>
                <label className="block text-zinc-400 font-bold mb-1 uppercase">Franchise</label>
                <select
                  value={xiFranchiseId}
                  onChange={(e) => {
                    setXiFranchiseId(e.target.value);
                    setSelectedPlayerRegIds([]);
                    setCaptainRegId('');
                    setKeeperRegId('');
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                >
                  <option value={selectedMatch.team_a_id}>{selectedMatch.teamA.name}</option>
                  <option value={selectedMatch.team_b_id}>{selectedMatch.teamB.name}</option>
                </select>
              </div>

              {/* Roster selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-zinc-400 font-bold uppercase">
                    Eligible Roster (Selected: {selectedPlayerRegIds.length} / 11)
                  </label>
                  <span className="text-zinc-500 text-[11px]">Check 11 players</span>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/80 bg-zinc-900/60 p-2">
                  {(squadMap[xiFranchiseId] || []).map((player) => {
                    const isChecked = selectedPlayerRegIds.includes(player.registrationId);
                    return (
                      <label
                        key={player.registrationId}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (selectedPlayerRegIds.length < 11) {
                                setSelectedPlayerRegIds([...selectedPlayerRegIds, player.registrationId]);
                              }
                            } else {
                              setSelectedPlayerRegIds(
                                selectedPlayerRegIds.filter((id) => id !== player.registrationId)
                              );
                              if (captainRegId === player.registrationId) setCaptainRegId('');
                              if (keeperRegId === player.registrationId) setKeeperRegId('');
                            }
                          }}
                          className="size-4 rounded border-zinc-700 bg-zinc-800 text-amber-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-zinc-200">{player.fullName}</span>
                          <span className="text-[10px] text-zinc-500 ml-2 uppercase">
                            ({player.derivedPlayerType || 'All-Rounder'})
                          </span>
                        </div>
                      </label>
                    );
                  })}
                  {(!squadMap[xiFranchiseId] || squadMap[xiFranchiseId].length === 0) && (
                    <div className="p-4 text-center text-zinc-500">No players found in this franchise roster.</div>
                  )}
                </div>
              </div>

              {/* Captain & Wicket Keeper selectors */}
              {selectedPlayerRegIds.length > 0 && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1 uppercase">Captain</label>
                    <select
                      value={captainRegId}
                      onChange={(e) => setCaptainRegId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                    >
                      <option value="">Select Captain...</option>
                      {selectedPlayerRegIds.map((regId) => {
                        const p = (squadMap[xiFranchiseId] || []).find((x) => x.registrationId === regId);
                        return (
                          <option key={regId} value={regId}>
                            {p?.fullName || regId}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1 uppercase">Wicket Keeper</label>
                    <select
                      value={keeperRegId}
                      onChange={(e) => setKeeperRegId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
                    >
                      <option value="">Select Keeper...</option>
                      {selectedPlayerRegIds.map((regId) => {
                        const p = (squadMap[xiFranchiseId] || []).find((x) => x.registrationId === regId);
                        return (
                          <option key={regId} value={regId}>
                            {p?.fullName || regId}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowPlayingXIModal(false)} className="border-zinc-800 text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleSavePlayingXI} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              Save Playing XI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YOUTUBE VIDEO DIALOG */}
      <Dialog open={showYouTubeModal} onOpenChange={setShowYouTubeModal}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
              <Video className="size-4" />
              Configure YouTube Live Stream
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase">
                YouTube URL or 11-char Video ID
              </label>
              <input
                type="text"
                value={youtubeVideoInput}
                onChange={(e) => setYoutubeVideoInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or dQw4w9WgXcQ"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100"
              />
            </div>
            <p className="text-zinc-500 text-[11px]">
              Accepts standard YouTube links, live links, short links, or raw 11-character video IDs.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowYouTubeModal(false)} className="border-zinc-800 text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={handleUpdateYouTube} className="bg-red-600 hover:bg-red-500 text-white font-bold">
              Save Video Stream
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
