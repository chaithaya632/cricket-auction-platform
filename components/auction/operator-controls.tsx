'use client';

// =============================================================================
// ACC Auction Portal — Components: Operator Control Console
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  startAuctionAction,
  startAuctionAgainAction,
  pauseAuctionAction,
  resumeAuctionAction,
  endAuctionAction,
  selectLotAction,
  confirmSaleAction,
  markUnsoldAction,
  skipLotAction,
  recallSkippedLotAction,
  undoSaleAction,
  adminProxyBidAction,
  adminStartRoundTwoAction,
  adminAutoAllotLotAction,
  adminRelaxBucketMinimumAction,
  bringDownUnsoldLotAction,
  reAuctionUnsoldLotAction,
  adminAuctionRestartRecoveryAction,
  updateActiveBucketsAction,
  drawRandomLotFromBucketsAction,
  startNextBucketGroupAction,
} from '@/lib/auction/actions';
import { runWithLocalActionTracking } from '@/components/auction/auction-realtime-sync';
import {
  DEFAULT_BUCKET_ORDER,
  type AuctionLotWithDetails,
  type AuctionSessionState,
  type RestoreToMode,
} from '@/lib/auction/types';
import type { BucketScarcityReport } from '@/domain/scarcity';
import { getAudioEnabled, setAudioEnabled } from '@/lib/auction/audio';
import { GuestDrawDialog } from '@/components/auction/guest-draw-dialog';
import {
  Play,
  Pause,
  Square,
  Loader2,
  AlertCircle,
  ShieldAlert,
  Users,
  RotateCcw,
  Award,
  History,
  Volume2,
  VolumeX,
  Shuffle,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';

export interface OperatorSoldLotItem {
  id: string;
  draw_number: number;
  player_name: string;
  franchise_name: string;
  price: number;
  bucket: string;
}

export interface OperatorRecoveryLotItem {
  id: string;
  draw_number: number;
  player_name: string;
  bucket: string;
  status: string;
}

export interface OperatorFranchiseOption {
  id: string;
  name: string;
  short_name: string;
}

interface OperatorControlsProps {
  seasonId?: string;
  activeLot: AuctionLotWithDetails | null;
  upcomingLots: AuctionLotWithDetails[];
  unsoldLots?: AuctionLotWithDetails[];
  lastSoldLotId?: string | null;
  soldLots?: OperatorSoldLotItem[];
  franchises?: OperatorFranchiseOption[];
  sessionState: AuctionSessionState;
  isSuperAdmin?: boolean;
  scarcityReport?: BucketScarcityReport | null;
  recoveryLots?: OperatorRecoveryLotItem[];
  initialActiveBuckets?: string[];
  completedBuckets?: string[];
  bucketStats?: Record<string, { pending: number; total: number; inProgress: boolean }>;
  getCurrentRemaining?: () => number;
  onActiveLotChange?: (lot: AuctionLotWithDetails | null) => void;
  onSessionStateChange?: (state: AuctionSessionState) => void;
}

export function OperatorControls({
  seasonId,
  activeLot,
  upcomingLots,
  unsoldLots = [],
  lastSoldLotId,
  soldLots = [],
  franchises = [],
  sessionState,
  isSuperAdmin = false,
  scarcityReport = null,
  recoveryLots = [],
  initialActiveBuckets,
  completedBuckets = [],
  bucketStats,
  getCurrentRemaining,
  onActiveLotChange,
  onSessionStateChange,
}: OperatorControlsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const isPending = Boolean(pendingAction);
  const isActionPending = (tag: string) => pendingAction === tag;
  const isStateMutationPending = ['start', 'restart', 'pause', 'resume', 'end-auction', 'recovery'].includes(pendingAction ?? '');
  const isFloorMutationPending = ['sold', 'unsold', 'skip', 'select-lot', 'random', 'undo'].includes(pendingAction ?? '');
  const [activeQueueTab, setActiveQueueTab] = useState<'upcoming' | 'unsold' | 'sold'>('unsold');
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /** Detects concurrency-related error strings and returns a friendly message instead. */
  const sanitizeActionError = (error: string | undefined, fallback: string): string => {
    if (
      error?.includes('STALE_BID_PRICE') ||
      error?.includes('no longer in progress') ||
      error?.includes('Mutation rejected') ||
      error?.includes('concurrently')
    ) {
      router.refresh();
      return 'The auction state changed concurrently. The page has been updated.';
    }
    return error || fallback;
  };
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [selectedUndoLotId, setSelectedUndoLotId] = useState<string>(
    lastSoldLotId || (soldLots[0]?.id ?? '')
  );
  const [undoMode, setUndoMode] = useState<RestoreToMode>('resume_bidding');
  const [showEndModal, setShowEndModal] = useState(false);
  const [endLotMode, setEndLotMode] = useState<'hammer' | 'unsold'>('hammer');

  // Super Admin Action states
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyFranchiseId, setProxyFranchiseId] = useState<string>(franchises[0]?.id || '');
  const [proxyBidAmount, setProxyBidAmount] = useState<number>(0);

  const [showRoundTwoModal, setShowRoundTwoModal] = useState(false);
  const [showRelaxBucketModal, setShowRelaxBucketModal] = useState(false);
  const [relaxBucket, setRelaxBucket] = useState<string>('B1');
  const [relaxMinimum, setRelaxMinimum] = useState<number>(1);
  const [relaxReason, setRelaxReason] = useState<string>(
    'Uniform bucket relaxation under endgame procedures'
  );

  // Super Admin Auction Restart & Recovery state (§12.4)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<'full' | 'selective'>('full');
  const [recoveryTargetLotId, setRecoveryTargetLotId] = useState<string>('');
  const [recoveryReason, setRecoveryReason] = useState<string>('');

  // Phase 5 State: Active Buckets, Audio Toggle, and Guest Draw
  const [activeBuckets, setActiveBuckets] = useState<string[]>(
    initialActiveBuckets && initialActiveBuckets.length > 0
      ? initialActiveBuckets
      : [...DEFAULT_BUCKET_ORDER]
  );
  const [isAudioOn, setIsAudioOn] = useState<boolean>(true);
  const [showGuestDrawModal, setShowGuestDrawModal] = useState<boolean>(false);
  const [showStartModeModal, setShowStartModeModal] = useState<boolean>(false);

  useEffect(() => {
    setIsAudioOn(getAudioEnabled());
  }, []);

  useEffect(() => {
    if (initialActiveBuckets && initialActiveBuckets.length > 0) {
      setActiveBuckets(initialActiveBuckets);
    }
  }, [initialActiveBuckets]);

  const handleToggleAudio = () => {
    const next = !isAudioOn;
    setAudioEnabled(next);
    setIsAudioOn(next);
  };

  const handleToggleBucket = (bucket: string) => {
    let next: string[];
    if (activeBuckets.includes(bucket)) {
      if (activeBuckets.length === 1) return; // Prevent empty selection
      next = activeBuckets.filter((b) => b !== bucket);
    } else {
      next = DEFAULT_BUCKET_ORDER.filter((b) => activeBuckets.includes(b) || b === bucket);
    }
    setActiveBuckets(next);
    void runOperatorAction(
      'buckets',
      () => updateActiveBucketsAction(next),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to update active buckets.'));
          setActiveBuckets(activeBuckets);
        } else {
          setSuccessMsg(`Active buckets updated: ${next.join(', ')}`);
        }
      }
    );
  };

  const handleSelectAllBuckets = () => {
    const next = [...DEFAULT_BUCKET_ORDER];
    setActiveBuckets(next);
    void runOperatorAction(
      'buckets',
      () => updateActiveBucketsAction(next),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to update active buckets.'));
        } else {
          setSuccessMsg('All buckets selected.');
        }
      }
    );
  };

  const [selectedRemainingBuckets, setSelectedRemainingBuckets] = useState<string[]>([]);

  const activeBucketsPendingTotal = activeBuckets.reduce(
    (acc, b) => acc + (bucketStats?.[b]?.pending ?? 0),
    0
  );
  const isBucketGroupComplete =
    sessionState.isLive &&
    !activeLot &&
    activeBuckets.length > 0 &&
    activeBucketsPendingTotal === 0;

  const activeUpcomingLots = upcomingLots.filter((lot) => activeBuckets.includes(lot.bucket));

  const handleToggleRemainingBucket = (bucket: string) => {
    setSelectedRemainingBuckets((prev) =>
      prev.includes(bucket) ? prev.filter((item) => item !== bucket) : [...prev, bucket]
    );
  };

  const handleStartNextBucketGroup = () => {
    if (selectedRemainingBuckets.length === 0) return;
    void runOperatorAction(
      'next-bucket-group',
      () => startNextBucketGroupAction(selectedRemainingBuckets),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to start next bucket group.'));
        } else {
          setSuccessMsg(`Next bucket group started: ${selectedRemainingBuckets.join(', ')}`);
          setSelectedRemainingBuckets([]);
          if (res.data?.activeLot && onActiveLotChange) {
            onActiveLotChange(res.data.activeLot);
          }
        }
      }
    );
  };

  const handleDrawRandom = () => {
    void runOperatorAction(
      'random',
      () => drawRandomLotFromBucketsAction(),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to draw random player.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg(
            `Random draw: Player #${res.data?.drawNumber} (Bucket ${res.data?.bucket}) brought to floor!`
          );
        }
      }
    );
  };

  const runOperatorAction = async <T extends { success: boolean }>(
    actionTag: string,
    actionFn: () => Promise<T>,
    onComplete: (res: T) => void
  ) => {
    if (pendingAction) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setPendingAction(actionTag);
    try {
      const res = await runWithLocalActionTracking(actionFn);
      onComplete(res);
    } catch (err: any) {
      setErrorMsg(sanitizeActionError(err?.message, 'Unexpected error executing operator action.'));
    } finally {
      setPendingAction(null);
    }
  };

  const handleOpenRecoveryModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setRecoveryMode('full');
    setRecoveryReason('');
    const firstLotId =
      recoveryLots[0]?.id || upcomingLots[0]?.id || soldLots[0]?.id || unsoldLots[0]?.id || '';
    setRecoveryTargetLotId(firstLotId);
    setShowRecoveryModal(true);
  };

  const handleExecuteRecovery = () => {
    if (!recoveryReason.trim()) {
      setErrorMsg('Administrative reason is required for auction restart and recovery.');
      return;
    }
    if (recoveryMode === 'selective' && !recoveryTargetLotId) {
      setErrorMsg('Please select a target player for selective restart.');
      return;
    }

    void runOperatorAction(
      'recovery',
      () =>
        adminAuctionRestartRecoveryAction({
          mode: recoveryMode,
          targetLotId: recoveryMode === 'selective' ? recoveryTargetLotId : undefined,
          reason: recoveryReason.trim(),
        }),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to execute auction recovery.'));
        } else {
          const modeLabel = recoveryMode === 'full' ? 'Full Restart' : 'Selective Restart';
          setSuccessMsg(
            `Auction recovery successful (${modeLabel}). ${res.data?.affectedLotsCount} lot(s) affected, ${res.data?.reversedSoldLotsCount} sale(s) reversed. Auction is paused; explicitly resume and CALL PLAYER when ready.`
          );
          setShowRecoveryModal(false);
          setRecoveryReason('');
        }
      }
    );
  };

  useEffect(() => {
    if (lastSoldLotId) {
      setSelectedUndoLotId(lastSoldLotId);
    } else if (soldLots.length > 0) {
      setSelectedUndoLotId(soldLots[0].id);
    }
  }, [lastSoldLotId, soldLots]);

  const handleStartAuction = () => {
    const previousState = sessionState;
    const nowIso = new Date().toISOString();

    // OPTIMISTIC UPDATE: Immediate transition to LIVE (<250ms / 0ms)
    // Preserves activeLot if already on floor (from Guest Draw before start)
    const optimisticState: AuctionSessionState = {
      ...sessionState,
      status: 'live',
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: nowIso,
      activeLotId: activeLot?.id || null,
    };
    onSessionStateChange?.(optimisticState);
    if (activeLot) {
      onActiveLotChange?.({
        ...activeLot,
        started_at: nowIso,
      });
    }

    void runOperatorAction(
      'start',
      () => startAuctionAction(activeBuckets),
      (res) => {
        if (!res.success) {
          onSessionStateChange?.(previousState);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to start auction.'));
        } else {
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          setSuccessMsg('Auction is now LIVE! Bidding floor is open.');
        }
      }
    );
  };

  const handleStartAuctionAgain = () => {
    const previousState = sessionState;
    const optimisticState: AuctionSessionState = {
      ...sessionState,
      status: 'live',
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: new Date().toISOString(),
      activeLotId: activeLot?.id || null,
    };
    onSessionStateChange?.(optimisticState);

    void runOperatorAction(
      'restart',
      () => startAuctionAgainAction(),
      (res) => {
        if (!res.success) {
          onSessionStateChange?.(previousState);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to restart auction session.'));
        } else {
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          setSuccessMsg('Auction session RESTARTED and LIVE! Bidding floor is reopened.');
        }
      }
    );
  };

  const handlePauseAuction = () => {
    const currentSeconds = getCurrentRemaining ? getCurrentRemaining() : 20;
    const previousState = sessionState;

    // OPTIMISTIC UPDATE: Freeze visible timer immediately (<250ms / 0ms) at exact displayed value
    const optimisticState: AuctionSessionState = {
      ...sessionState,
      status: 'paused',
      isPaused: true,
      pausedRemainingSeconds: currentSeconds,
      pausedAt: new Date().toISOString(),
    };
    onSessionStateChange?.(optimisticState);

    void runOperatorAction(
      'pause',
      () => pauseAuctionAction(seasonId, currentSeconds),
      (res) => {
        if (!res.success) {
          onSessionStateChange?.(previousState);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to pause auction.'));
        } else {
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg('Auction session PAUSED.');
        }
      }
    );
  };

  const handleResumeAuction = () => {
    const previousState = sessionState;

    // Calculate synthetic started_at optimistically so active lot clock has zero jitter
    const currentRemaining =
      sessionState.pausedRemainingSeconds ?? (getCurrentRemaining ? getCurrentRemaining() : 20);
    const timerDuration = activeLot?.highest_bidder_franchise_id ? 20 : 30;
    const remainingToRestore =
      currentRemaining !== null && currentRemaining !== undefined
        ? Math.min(timerDuration, Math.max(1, currentRemaining))
        : timerDuration;
    const elapsedSeconds = timerDuration - remainingToRestore;
    const syntheticStartedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();

    // OPTIMISTIC UPDATE: Resume live session immediately (<250ms / 0ms)
    const optimisticState: AuctionSessionState = {
      ...sessionState,
      status: 'live',
      isPaused: false,
      startedAt: syntheticStartedAt,
      pausedRemainingSeconds: null,
      pausedAt: null,
    };
    onSessionStateChange?.(optimisticState);
    if (activeLot) {
      onActiveLotChange?.({
        ...activeLot,
        started_at: syntheticStartedAt,
      });
    }

    void runOperatorAction(
      'resume',
      () => resumeAuctionAction(),
      (res) => {
        if (!res.success) {
          onSessionStateChange?.(previousState);
          if (activeLot) {
            onActiveLotChange?.(activeLot);
          }
          setErrorMsg(sanitizeActionError(res.error, 'Failed to resume auction.'));
        } else {
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
            if (activeLot && res.data.sessionState.startedAt) {
              onActiveLotChange?.({
                ...activeLot,
                started_at: res.data.sessionState.startedAt,
              });
            }
          }
          setSuccessMsg('Auction session RESUMED and LIVE.');
        }
      }
    );
  };

  const handleBringDownUnsoldLot = (lotId: string) => {
    void runOperatorAction(
      'bring-down',
      () => bringDownUnsoldLotAction(lotId),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to return player to lot queue.'));
        } else {
          setSuccessMsg('Player moved back to Lot Queue.');
        }
      }
    );
  };

  const handleReAuctionUnsoldLot = (lotId: string) => {
    void runOperatorAction(
      're-auction',
      () => reAuctionUnsoldLotAction(lotId),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to re-auction player.'));
        } else {
          setSuccessMsg(`Player queued for re-auction at base price ₹${res.data?.basePrice}.`);
        }
      }
    );
  };

  const handleEndAuction = () => {
    const prevSessionState = sessionState;
    const prevActiveLot = activeLot;

    // OPTIMISTIC UPDATE: Immediate session completion visual feedback
    const optimisticState: AuctionSessionState = {
      ...sessionState,
      status: 'completed',
      isLive: false,
      isPaused: false,
      isNotStarted: false,
      isCompleted: true,
      activeLotId: null,
    };
    onSessionStateChange?.(optimisticState);
    onActiveLotChange?.(null);
    setShowEndModal(false);

    void runOperatorAction(
      'end-auction',
      () => endAuctionAction({ resolveActiveLotMode: endLotMode }),
      (res) => {
        if (!res.success) {
          onSessionStateChange?.(prevSessionState);
          onActiveLotChange?.(prevActiveLot);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to end auction.'));
        } else {
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          onActiveLotChange?.(null);
          setSuccessMsg('Auction session has officially ENDED and status is COMPLETED.');
        }
      }
    );
  };

  const handleSelectLot = (lotId: string) => {
    void runOperatorAction(
      'select-lot',
      () => selectLotAction(lotId),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to select lot.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg('Player brought to floor successfully.');
        }
      }
    );
  };

  const handleConfirmSale = () => {
    if (!activeLot) return;
    const prevActiveLot = activeLot;

    // OPTIMISTIC UPDATE: Immediate visual sale status (<250ms / 0ms)
    onActiveLotChange?.({
      ...activeLot,
      status: 'sold',
    });

    void runOperatorAction(
      'sold',
      () => confirmSaleAction(activeLot.id),
      (res) => {
        if (!res.success) {
          onActiveLotChange?.(prevActiveLot);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to confirm sale.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg(`Player SOLD for ₹${res.data?.price}!`);
        }
      }
    );
  };

  const handleMarkUnsold = () => {
    if (!activeLot) return;
    const prevActiveLot = activeLot;

    // OPTIMISTIC UPDATE: Immediate visual unsold status (<250ms / 0ms)
    onActiveLotChange?.({
      ...activeLot,
      status: 'unsold',
    });

    void runOperatorAction(
      'unsold',
      () => markUnsoldAction(activeLot.id),
      (res) => {
        if (!res.success) {
          onActiveLotChange?.(prevActiveLot);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to mark unsold.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg('Player passed and marked UNSOLD.');
        }
      }
    );
  };

  const handleSkipLot = () => {
    if (!activeLot) return;
    const prevActiveLot = activeLot;
    const prevSessionState = sessionState;

    // OPTIMISTIC UPDATE: Advance floor immediately to next eligible upcoming lot in active buckets
    const nextCandidate = activeUpcomingLots.find((l) => l.id !== activeLot.id) || null;
    if (nextCandidate) {
      onActiveLotChange?.({
        ...nextCandidate,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        current_price: nextCandidate.base_price,
        highest_bidder_franchise_id: null,
        highest_bidder: null,
      });
    } else {
      onActiveLotChange?.(null);
    }

    void runOperatorAction(
      'skip',
      () => skipLotAction(activeLot.id, 'Skipped by operator'),
      (res) => {
        if (!res.success) {
          onActiveLotChange?.(prevActiveLot);
          onSessionStateChange?.(prevSessionState);
          setErrorMsg(sanitizeActionError(res.error, 'Failed to skip lot.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg(
            `Player #${activeLot.draw_number} (${activeLot.player.full_name}) skipped. Can be recalled at the end of Bucket ${activeLot.bucket}.`
          );
        }
      }
    );
  };

  const handleUndoSale = () => {
    const targetLotId = selectedUndoLotId || lastSoldLotId;
    if (!targetLotId) return;
    void runOperatorAction(
      'undo',
      () => undoSaleAction(targetLotId, undoMode),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to undo sale.'));
        } else {
          if (res.data?.activeLot !== undefined) {
            onActiveLotChange?.(res.data.activeLot);
          }
          if (res.data?.sessionState) {
            onSessionStateChange?.(res.data.sessionState);
          }
          setSuccessMsg(`Sale successfully undone (Mode: ${undoMode}).`);
          setShowUndoModal(false);
        }
      }
    );
  };

  const handleOpenProxyModal = () => {
    if (!activeLot) return;
    const defaultNextBid =
      activeLot.current_price !== null
        ? activeLot.current_price + 5
        : activeLot.base_price;
    setProxyBidAmount(defaultNextBid);
    if (!proxyFranchiseId && franchises.length > 0) {
      setProxyFranchiseId(franchises[0].id);
    }
    setShowProxyModal(true);
  };

  const handleProxyBid = () => {
    if (!activeLot || !proxyFranchiseId || !proxyBidAmount) return;
    void runOperatorAction(
      'proxy-bid',
      () => adminProxyBidAction(activeLot.id, proxyFranchiseId, proxyBidAmount),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Proxy bid failed.'));
        } else {
          setSuccessMsg(`Proxy bid of ₹${proxyBidAmount} placed successfully.`);
          setShowProxyModal(false);
        }
      }
    );
  };

  const handleStartRoundTwo = () => {
    void runOperatorAction(
      'round-two',
      () => adminStartRoundTwoAction(),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to start Round 2.'));
        } else {
          setSuccessMsg(
            `Round 2 activated! Reopened ${res.data?.reopenedCount} unsold player(s) at base price 20 credits.`
          );
          setShowRoundTwoModal(false);
        }
      }
    );
  };

  const handleAutoAllot = () => {
    if (!activeLot) return;
    void runOperatorAction(
      'auto-allot',
      () => adminAutoAllotLotAction(activeLot.id),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Auto-allotment failed.'));
        } else {
          setSuccessMsg(
            `Player ALLOTTED to ${res.data?.franchiseName} at 20 credits under endgame rules.`
          );
        }
      }
    );
  };

  const handleRelaxBucket = () => {
    void runOperatorAction(
      'relax-bucket',
      () => adminRelaxBucketMinimumAction(relaxBucket, relaxMinimum, relaxReason),
      (res) => {
        if (!res.success) {
          setErrorMsg(sanitizeActionError(res.error, 'Failed to relax bucket quota.'));
        } else {
          setSuccessMsg(
            `Bucket ${res.data?.bucket} quota relaxed to ${res.data?.newMinimum} uniformly across all franchises.`
          );
          setShowRelaxBucketModal(false);
        }
      }
    );
  };

  const isFloorActive = sessionState.isLive;
  const hasActiveBids = Boolean(
    activeLot &&
    activeLot.status === 'in_progress' &&
    activeLot.highest_bidder_franchise_id !== null
  );
  const canHammer =
    isFloorActive &&
    activeLot &&
    activeLot.status === 'in_progress' &&
    activeLot.current_price !== null &&
    activeLot.highest_bidder_franchise_id !== null;

  const canPass = isFloorActive && activeLot && activeLot.status === 'in_progress';

  return (
    <div className="space-y-6">
      {/* SCARCITY WARNING BANNER (§12.3) */}
      {scarcityReport?.isWarningActive && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/80 p-5 text-xs text-amber-200 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <span className="font-black uppercase tracking-wider text-amber-300 block text-sm">
                SCARCITY WARNING: Bucket {scarcityReport.bucket}
              </span>
              <p className="text-[11px] text-amber-200/90 mt-0.5">
                {scarcityReport.unsoldSupply} unsold player(s) remaining for {scarcityReport.totalPlayersNeeded} player need(s) across {scarcityReport.franchisesNeedingCount} franchise(s).
                Threshold: <strong>{scarcityReport.threshold}</strong>. Bidding is not blocked.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40 text-xs font-mono">
              SUPPLY: {scarcityReport.unsoldSupply} / NEED: {scarcityReport.totalPlayersNeeded}
            </span>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-4 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span><strong>Action Failed:</strong> {errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-4 text-xs text-emerald-200">
          <strong>Success:</strong> {successMsg}
        </div>
      )}

      {/* 1. SESSION LIFECYCLE CONTROLS */}
      {sessionState.isCompleted ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="size-3 rounded-full bg-blue-500" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Session Status:
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  AUCTION SESSION COMPLETED
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Official hammer floor was closed. You can restart the auction session to continue bidding on remaining lots.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStartModeModal(true)}
            disabled={isActionPending('start') || isActionPending('restart')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActionPending('start') || isActionPending('restart') ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>REOPENING FLOOR...</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                <span>START AUCTION AGAIN</span>
              </>
            )}
          </button>
        </div>
      ) : sessionState.isNotStarted ? (
        <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-zinc-900/90 p-8 text-center space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3.5 py-1 text-xs font-bold text-amber-400 border border-amber-500/30 uppercase tracking-widest">
            <span className="inline-block size-2 rounded-full bg-amber-400" />
            Session Status: NOT STARTED
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-black text-zinc-100 tracking-tight">
              Ready to Open Bidding Floor
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Select which bucket(s) should be active, then click Start Auction. The first player will automatically be brought to the floor in order.
            </p>
          </div>

          {/* Bucket Selection before Start */}
          <div className="max-w-xl mx-auto space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-400">
                Selected Active Buckets:
              </span>
              <button
                type="button"
                onClick={handleSelectAllBuckets}
                disabled={isActionPending('buckets') || activeBuckets.length === DEFAULT_BUCKET_ORDER.length}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer disabled:opacity-40"
              >
                Select All Buckets
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {DEFAULT_BUCKET_ORDER.map((bucket) => {
                const isSelected = activeBuckets.includes(bucket);
                const pendingCount = bucketStats?.[bucket]?.pending ?? 0;
                return (
                  <button
                    key={bucket}
                    type="button"
                    onClick={() => handleToggleBucket(bucket)}
                    disabled={isActionPending('buckets')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-black text-sm">{bucket}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                        isSelected
                          ? 'bg-amber-500/30 text-amber-200 font-bold'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {pendingCount} left
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Floor Player notification if Guest Draw pre-start was used */}
          {activeLot && activeLot.status === 'in_progress' && (
            <div className="max-w-md mx-auto p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-center gap-2">
              <Sparkles className="size-4 shrink-0 text-amber-400" />
              <span>
                Player on floor: <strong>#{activeLot.draw_number} {activeLot.player?.full_name}</strong> (Bucket {activeLot.bucket}). Starting auction will begin bidding for this player.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setShowStartModeModal(true)}
              disabled={isActionPending('start') || activeBuckets.length === 0}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isActionPending('start') ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>STARTING AUCTION...</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>START AUCTION</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowGuestDrawModal(true)}
              disabled={isActionPending('start')}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white shadow-xl shadow-amber-950/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50"
              title="Select a player using Guest Draw before starting the auction"
            >
              <Sparkles className="size-4" />
              <span>Guest Draw</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {sessionState.isLive && !sessionState.isPaused ? (
                <span className="flex size-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
                </span>
              ) : (
                <span className="size-3 rounded-full bg-amber-500" />
              )}
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Session Status:
              </span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                sessionState.isPaused
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {sessionState.isPaused ? 'AUCTION SESSION PAUSED' : 'AUCTION SESSION ACTIVE'}
            </span>
            {activeLot && (
              <span className="hidden sm:inline text-xs text-zinc-400 font-mono">
                Lot #{activeLot.draw_number} ({activeLot.player.full_name})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {sessionState.isPaused ? (
              <button
                type="button"
                onClick={handleResumeAuction}
                disabled={isActionPending('resume')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {pendingAction === 'resume' ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>RESUMING...</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" />
                    <span>RESUME AUCTION</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseAuction}
                disabled={isActionPending('pause')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-xs border border-zinc-700 shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {pendingAction === 'pause' ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>PAUSING...</span>
                  </>
                ) : (
                  <>
                    <Pause className="size-3.5" />
                    <span>PAUSE AUCTION</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              disabled={isActionPending('end-auction')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-white font-bold text-xs border border-red-800 shadow transition-colors cursor-pointer disabled:opacity-50"
            >
              <Square className="size-3.5 fill-current" />
              <span>END AUCTION</span>
            </button>
          </div>
        </div>
      )}

      {/* End Auction Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-red-900/80 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-red-500">🛑</span> Confirm End Auction Session
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Ending the auction completes the tournament season, closes the bidding floor, and disables any further bids or lot selection.
            </p>

            {activeLot && activeLot.status === 'in_progress' && (
              <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                  Active Lot in Progress
                </span>
                <p className="text-xs text-zinc-300">
                  Player: <strong>{activeLot.player.full_name}</strong> (Lot #{activeLot.draw_number})
                </p>
                {activeLot.highest_bidder ? (
                  <p className="text-xs text-zinc-400">
                    Current highest bid: <strong>₹{activeLot.current_price}</strong> by <strong>{activeLot.highest_bidder.name}</strong>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400">No bids placed on this lot yet.</p>
                )}

                <div className="pt-2 space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-300 block">
                    How should this lot be resolved?
                  </label>
                  {activeLot.highest_bidder && (
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="endLotMode"
                        value="hammer"
                        checked={endLotMode === 'hammer'}
                        onChange={() => setEndLotMode('hammer')}
                        className="text-red-500"
                      />
                      <span>Confirm sale to highest bidder (₹{activeLot.current_price})</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="endLotMode"
                      value="unsold"
                      checked={endLotMode === 'unsold' || !activeLot.highest_bidder}
                      onChange={() => setEndLotMode('unsold')}
                      className="text-amber-500"
                    />
                    <span>Pass and mark lot UNSOLD</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndAuction}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Ending Session...' : 'Confirm & End Auction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUCTION BUCKETS & DRAW DISPATCHER */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Active Auction Buckets
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">
              (Filter & Order)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAudio}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isAudioOn
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
              }`}
              title={isAudioOn ? 'Gavel chime enabled' : 'Sound muted'}
            >
              {isAudioOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              <span>{isAudioOn ? 'Sound ON' : 'Sound OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleSelectAllBuckets}
              disabled={isActionPending('buckets') || activeBuckets.length === DEFAULT_BUCKET_ORDER.length}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              All Buckets
            </button>
          </div>
        </div>

        {/* Bucket Pills */}
        <div className="flex flex-wrap gap-2">
          {DEFAULT_BUCKET_ORDER.map((bucket) => {
            const isSelected = activeBuckets.includes(bucket);
            const pendingCount = bucketStats?.[bucket]?.pending ?? 0;
            return (
              <button
                key={bucket}
                type="button"
                onClick={() => handleToggleBucket(bucket)}
                disabled={isActionPending('buckets')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-950/40'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <span className="font-black text-sm">{bucket}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isSelected
                      ? 'bg-amber-500/30 text-amber-200 font-bold'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {pendingCount} left
                </span>
              </button>
            );
          })}
        </div>

        {/* Draw Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800/80">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Draw Controls:
          </span>

          {/* Random Player */}
          <button
            type="button"
            onClick={handleDrawRandom}
            disabled={hasActiveBids || isActionPending('random') || isFloorMutationPending || isStateMutationPending || sessionState.isCompleted || sessionState.isPaused}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            title={hasActiveBids ? 'Bidding in progress on floor' : 'Draw a random player from the active buckets'}
          >
            {pendingAction === 'random' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>DRAWING...</span>
              </>
            ) : (
              <>
                <Shuffle className="size-3.5" />
                <span>Random Player</span>
              </>
            )}
          </button>

          {/* Guest Draw */}
          <button
            type="button"
            onClick={() => setShowGuestDrawModal(true)}
            disabled={isActionPending('guest') || isFloorMutationPending || isStateMutationPending || sessionState.isCompleted}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Open guest card reveal dialog (Available by default)"
          >
            <Sparkles className="size-3.5" />
            <span>Guest Draw</span>
          </button>


        </div>
      </div>

      {/* CURRENT BUCKET GROUP COMPLETE PANEL */}
      {isBucketGroupComplete && (
        <div className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-950/40 via-zinc-950 to-zinc-950 p-6 text-center space-y-5 shadow-2xl">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <span>✓</span>
              <span>CURRENT BUCKET GROUP COMPLETE</span>
            </span>
            <h3 className="text-xl font-black text-white mt-2">All Lots in Active Group Concluded</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              All players in the selected buckets have been auctioned. Completed buckets are locked. Select the next bucket group to proceed.
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
          <div className="pt-2 border-t border-zinc-800/80 max-w-lg mx-auto space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              SELECT REMAINING BUCKETS
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEFAULT_BUCKET_ORDER.map((bucket) => {
                const isCompleted =
                  (completedBuckets || []).includes(bucket) ||
                  (activeBuckets.includes(bucket) && (bucketStats?.[bucket]?.pending ?? 0) === 0);
                const isSelected = selectedRemainingBuckets.includes(bucket);
                const pendingCount = bucketStats?.[bucket]?.pending ?? 0;
                return (
                  <button
                    key={bucket}
                    type="button"
                    disabled={isCompleted || isActionPending('start-buckets') || pendingCount === 0}
                    onClick={() => handleToggleRemainingBucket(bucket)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                      isCompleted
                        ? 'bg-zinc-900/40 text-zinc-600 border-zinc-800/40 cursor-not-allowed'
                        : isSelected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-950/40 cursor-pointer'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 cursor-pointer'
                    }`}
                  >
                    <span className="font-black text-sm">{bucket}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                      {isCompleted ? '✓ Done' : `${pendingCount} left`}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isActionPending('start-buckets') || selectedRemainingBuckets.length === 0}
                onClick={handleStartNextBucketGroup}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isActionPending('start-buckets') ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4 fill-white" />
                )}
                <span>START SELECTED BUCKETS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Manual Fallback: Only visible when floor has no active lot */}
      {!activeLot && activeUpcomingLots.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => activeUpcomingLots[0] && handleSelectLot(activeUpcomingLots[0].id)}
            disabled={isFloorMutationPending || !isFloorActive}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900/50 hover:bg-zinc-900 text-amber-500 border border-dashed border-amber-500/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Manual override: call next player when floor is empty"
          >
            <ArrowRight className="size-3" />
            <span>Manual Recovery</span>
          </button>
        </div>
      )}

      {/* 2. ACTIVE LOT EXECUTION PANEL */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            AUCTION CONTROLS
          </h3>
          {sessionState.isPaused && (
            <span className="text-xs text-amber-400 font-semibold">
              ⏸ Controls paused — click Resume above to proceed
            </span>
          )}
        </div>

        {activeLot?.status === 'unsold' && (
          <div className="rounded-xl border border-red-500/40 bg-zinc-950 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-400" />
                Unsold Player On Floor
              </span>
              <span className="text-xs font-mono font-bold text-zinc-400">
                Base Price: ₹{activeLot.base_price}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Player #{activeLot.draw_number} ({activeLot.player.full_name}) received no bids. Choose an action to proceed:
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleBringDownUnsoldLot(activeLot.id)}
                disabled={isFloorMutationPending || isStateMutationPending}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>⬇️</span>
                <span>RETURN TO QUEUE</span>
              </button>
              <button
                type="button"
                onClick={() => handleReAuctionUnsoldLot(activeLot.id)}
                disabled={isFloorMutationPending || isStateMutationPending}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>🔄</span>
                <span>RE-AUCTION</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {/* HAMMER / SELL */}
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={!canHammer || isFloorMutationPending || isStateMutationPending}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canHammer && !isFloorMutationPending && !isStateMutationPending
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            {pendingAction === 'sold' ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                <span>SELLING...</span>
                <span className="text-[10px] font-normal opacity-80">Recording sale</span>
              </>
            ) : (
              <>
                <span className="text-xl">🔨</span>
                <span>SOLD</span>
                <span className="text-[10px] font-normal opacity-80">
                  {activeLot?.current_price ? `At ₹${activeLot.current_price}` : 'No bids'}
                </span>
              </>
            )}
          </button>

          {/* PASS / UNSOLD */}
          <button
            type="button"
            onClick={handleMarkUnsold}
            disabled={!canPass || isFloorMutationPending || isStateMutationPending}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canPass && !isFloorMutationPending && !isStateMutationPending
                ? 'bg-amber-600/80 hover:bg-amber-600 text-white shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            {pendingAction === 'unsold' ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                <span>PASSING...</span>
                <span className="text-[10px] font-normal opacity-80">Marking unsold</span>
              </>
            ) : (
              <>
                <span className="text-xl">🛑</span>
                <span>UNSOLD</span>
                <span className="text-[10px] font-normal opacity-80">
                  Move lot to unsold
                </span>
              </>
            )}
          </button>

          {/* SKIP LOT (§10) */}
          <button
            type="button"
            onClick={handleSkipLot}
            disabled={!canPass || isFloorMutationPending || isStateMutationPending}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canPass && !isFloorMutationPending && !isStateMutationPending
                ? 'bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700 shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            {pendingAction === 'skip' ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                <span>SKIPPING...</span>
                <span className="text-[10px] font-normal opacity-80">Advancing lot</span>
              </>
            ) : (
              <>
                <span className="text-xl">⏭</span>
                <span>SKIP</span>
                <span className="text-[10px] font-normal opacity-80">
                  Recalled at bucket end
                </span>
              </>
            )}
          </button>
        </div>

        {/* UNDO SALE */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowUndoModal(true)}
            disabled={(!lastSoldLotId && soldLots.length === 0) || isFloorMutationPending || !isFloorActive}
            className={`w-full py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
              (lastSoldLotId || soldLots.length > 0) && !isFloorMutationPending && isFloorActive
                ? 'bg-transparent hover:bg-amber-500/10 text-amber-500 border border-amber-500/50 cursor-pointer active:scale-95'
                : 'bg-transparent text-zinc-600 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-base">↩</span>
            <span>UNDO SALE (Deterministic recovery)</span>
          </button>
        </div>
      </div>

      {/* 2.5 SUPER ADMIN GOVERNANCE CONTROLS */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-amber-500/40 bg-zinc-900/90 shadow-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedControls(!showAdvancedControls)}
            className="w-full flex items-center justify-between p-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors"
          >
            <span className="font-bold text-sm flex items-center gap-2">
              <span>⚠</span> Advanced / Emergency Controls
            </span>
            <span className={`text-xs transition-transform ${showAdvancedControls ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvancedControls && (
            <div className="p-5 space-y-3 border-t border-amber-500/20">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                Super Admin Governance Suite
              </h3>
            </div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30 uppercase">
              Full Authority
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            {/* Proxy Bid on Active Lot */}
            <button
              type="button"
              onClick={handleOpenProxyModal}
              disabled={!activeLot || activeLot.status !== 'in_progress' || isPending || !isFloorActive}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Users className="size-4 text-blue-400" />
              <span>Proxy Bid</span>
              <span className="text-[10px] font-normal text-zinc-400">On behalf of team</span>
            </button>

            {/* Auto-Allot Active Lot */}
            <button
              type="button"
              onClick={handleAutoAllot}
              disabled={!activeLot || isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Award className="size-4 text-emerald-400" />
              <span>Auto-Allot</span>
              <span className="text-[10px] font-normal text-zinc-400">Endgame priority</span>
            </button>

            {/* Start Round 2 */}
            <button
              type="button"
              onClick={() => setShowRoundTwoModal(true)}
              disabled={isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="size-4 text-amber-400" />
              <span>Start Round 2</span>
              <span className="text-[10px] font-normal text-zinc-400">Reopen unsold at ₹20</span>
            </button>

            {/* Uniform Bucket Relaxation */}
            <button
              type="button"
              onClick={() => setShowRelaxBucketModal(true)}
              disabled={isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-purple-300 font-bold text-xs border border-purple-500/30 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-sm">⚖</span>
              <span>Relax Bucket</span>
              <span className="text-[10px] font-normal text-zinc-400">Lower quota</span>
            </button>

            {/* Super Admin Auction Restart & Recovery */}
            <button
              type="button"
              onClick={handleOpenRecoveryModal}
              disabled={isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-red-300 font-bold text-xs border border-red-500/30 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <History className="size-4 text-red-400" />
              <span>Restart Auction</span>
              <span className="text-[10px] font-normal text-zinc-400">Auction recovery</span>
            </button>
          </div>
        </div>
      )}

      {/* Undo Modal */}
      {showUndoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-amber-400">⚠</span> Confirm Undo Sale
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will create an immutable <code>UNDO_SALE</code> event and restore
              the winning franchise&apos;s purse, bucket quota, and squad count without cascading rollbacks.
            </p>

            {soldLots.length > 0 && (
              <div className="space-y-1 text-xs">
                <label className="text-zinc-300 font-semibold block">
                  Select Target Sale to Undo:
                </label>
                <select
                  value={selectedUndoLotId}
                  onChange={(e) => setSelectedUndoLotId(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {soldLots.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      Lot #{sl.draw_number} — {sl.player_name} (₹{sl.price} to {sl.franchise_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <label className="text-zinc-300 font-semibold block">
                Select Restoration Mode:
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-800 hover:bg-zinc-800/60 cursor-pointer">
                <input
                  type="radio"
                  name="undoMode"
                  value="resume_bidding"
                  checked={undoMode === 'resume_bidding'}
                  onChange={() => setUndoMode('resume_bidding')}
                  className="mt-0.5 text-emerald-500"
                />
                <div>
                  <span className="font-bold text-zinc-200 block">
                    Resume Bidding (Recommended)
                  </span>
                  <span className="text-zinc-400 block text-[11px] mt-0.5">
                    Restores lot to <code>in_progress</code> with previous highest bid
                    and restarts the timer.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-800 hover:bg-zinc-800/60 cursor-pointer">
                <input
                  type="radio"
                  name="undoMode"
                  value="return_to_queue"
                  checked={undoMode === 'return_to_queue'}
                  onChange={() => setUndoMode('return_to_queue')}
                  className="mt-0.5 text-amber-500"
                />
                <div>
                  <span className="font-bold text-zinc-200 block">
                    Return to Queue
                  </span>
                  <span className="text-zinc-400 block text-[11px] mt-0.5">
                    Resets lot to <code>pending</code> with cleared prices. Player can
                    be selected again later.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowUndoModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUndoSale}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Processing Undo...' : 'Confirm Undo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proxy Bid Modal */}
      {showProxyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-blue-400">🛡</span> Submit Proxy Bid
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Place a bid on behalf of a franchise that has experienced network disconnection or technical failure on the floor.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Select Franchise:
                </label>
                <select
                  value={proxyFranchiseId}
                  onChange={(e) => setProxyFranchiseId(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.short_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Bid Amount (₹ Credits):
                </label>
                <input
                  type="number"
                  min="20"
                  step="5"
                  value={proxyBidAmount}
                  onChange={(e) => setProxyBidAmount(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProxyBid}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Submitting Proxy...' : 'Submit Proxy Bid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Round 2 Confirmation Modal */}
      {showRoundTwoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-amber-500/60 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-amber-400">🔄</span> Start Round 2
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will reopen all <strong>unsold</strong> and un-recalled <strong>skipped</strong> players from Round 1 and reset their base price to exactly <strong>20 credits</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRoundTwoModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartRoundTwo}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Reopening Lots...' : 'Activate Round 2'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uniform Bucket Relaxation Modal */}
      {showRelaxBucketModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-purple-500/60 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-purple-400">⚖</span> Relax Bucket Minimum
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              If player supply in a bucket is genuinely insufficient, Super Admin may relax the required quota (e.g. from 2 to 1) uniformly for all franchises.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Bucket:
                </label>
                <select
                  value={relaxBucket}
                  onChange={(e) => setRelaxBucket(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => (
                    <option key={b} value={b}>
                      Bucket {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  New Required Minimum:
                </label>
                <select
                  value={relaxMinimum}
                  onChange={(e) => setRelaxMinimum(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 font-mono"
                >
                  <option value={1}>1 Player (Relax from 2)</option>
                  <option value={0}>0 Players (Full Exemption)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Administrative Reason (Logged to Audit Trail):
                </label>
                <input
                  type="text"
                  value={relaxReason}
                  onChange={(e) => setRelaxReason(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRelaxBucketModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRelaxBucket}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Applying Relaxation...' : 'Apply Uniform Relaxation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Auction Restart & Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-red-500/60 bg-zinc-900 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <History className="size-5 text-red-400" />
              <span>Auction Restart & Recovery</span>
            </h3>

            <div className="rounded-xl bg-red-950/40 border border-red-500/30 p-3 text-xs text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-red-400">
                <ShieldAlert className="size-4 shrink-0" />
                <span>Super Admin Floor Recovery</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-300">
                This operation will restore lot statuses to <code>pending</code>, append immutable <code>UNDO_SALE</code> audit events for affected sales, release franchise purses and squad quotas, and leave the auction floor <strong>PAUSED</strong>. Original draw numbers and buckets are strictly preserved.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <label className="text-zinc-300 font-semibold block">
                Recovery Scope:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                  recoveryMode === 'full'
                    ? 'border-red-500/80 bg-red-500/10 text-white'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recoveryMode"
                      value="full"
                      checked={recoveryMode === 'full'}
                      onChange={() => setRecoveryMode('full')}
                      className="text-red-500"
                    />
                    <span className="font-bold text-zinc-200">Full Restart</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    Recovers all lots back to Draw #1. All sold, unsold, skipped, and in-progress lots are reset to pending.
                  </span>
                </label>

                <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                  recoveryMode === 'selective'
                    ? 'border-amber-500/80 bg-amber-500/10 text-white'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recoveryMode"
                      value="selective"
                      checked={recoveryMode === 'selective'}
                      onChange={() => setRecoveryMode('selective')}
                      className="text-amber-500"
                    />
                    <span className="font-bold text-zinc-200">Selective Restart</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    Recovers from a selected player forward (<code>draw_number &gt;= target</code>). Prior lots remain intact.
                  </span>
                </label>
              </div>

              {recoveryMode === 'selective' && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-zinc-300 font-semibold block">
                    Select Target Starting Player:
                  </label>
                  <select
                    value={recoveryTargetLotId}
                    onChange={(e) => setRecoveryTargetLotId(e.target.value)}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 font-mono"
                  >
                    {recoveryLots.length > 0 ? (
                      recoveryLots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          Draw #{lot.draw_number} — {lot.player_name} ({lot.bucket}) [{lot.status.toUpperCase()}]
                        </option>
                      ))
                    ) : (
                      <option value="">No lots available</option>
                    )}
                  </select>
                  <p className="text-[10px] text-zinc-400">
                    Lots prior to this player will NOT be modified. This player and all subsequent lots will be reset to pending.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-zinc-300 font-semibold block">
                  Mandatory Administrative Reason:
                </label>
                <textarea
                  rows={2}
                  value={recoveryReason}
                  onChange={(e) => setRecoveryReason(e.target.value)}
                  placeholder="E.g., Floor malfunction during Lot 5; restarting from Lot 5 per committee approval."
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-300/90 space-y-1">
                <p className="font-semibold">Preflight Invariant:</p>
                <p className="text-zinc-400">
                  If any lot in the affected recovery range has been <code>allotted</code> or <code>scouted</code>, recovery will abort immediately with 0 mutations.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRecovery}
                disabled={isPending || !recoveryReason.trim() || (recoveryMode === 'selective' && !recoveryTargetLotId)}
                className="px-5 py-2.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Executing Recovery...</span>
                  </>
                ) : (
                  <>
                    <History className="size-3.5" />
                    <span>Confirm & Execute Recovery</span>
                  </>
                )}
              </button>
            </div>
          </div>
            </div>
          )}
        </div>
      )}

      {/* 3A. NEXT PLAYERS (READ-ONLY) */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            NEXT PLAYERS
          </h3>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {activeUpcomingLots.length === 0 ? (
            <div className="text-center py-4 text-xs text-zinc-500">
              {isBucketGroupComplete
                ? 'Current bucket group complete. Select remaining buckets above.'
                : 'No pending lots remaining in the active queue.'}
            </div>
          ) : (
            activeUpcomingLots.slice(0, 8).map((lot) => (
              <div
                key={lot.id}
                className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-3 flex items-center gap-3"
              >
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                  {lot.bucket_player_number ? `${lot.bucket_player_number} (#${lot.draw_number})` : `#${lot.draw_number}`}
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                  {lot.bucket}
                </span>
                <h4 className="text-xs font-bold text-zinc-200 truncate flex-1">
                  {lot.player.full_name}
                </h4>
                <span className="text-xs font-mono font-bold text-zinc-400">
                  ₹{lot.base_price}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3B. UNSOLD & SOLD TABS */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveQueueTab('unsold')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeQueueTab === 'unsold'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Unsold Lots</span>
              <span className="rounded-full bg-red-500/30 px-1.5 py-0.2 text-[10px] font-mono">
                {unsoldLots.length}
              </span>
            </button>
            {soldLots.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveQueueTab('sold')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeQueueTab === 'sold'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Sold ({soldLots.length})</span>
              </button>
            )}
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {activeQueueTab === 'unsold'
              ? 'Round 2 Reopening Candidate'
              : 'Completed Floor Sales'}
          </span>
        </div>

        {activeQueueTab === 'unsold' && (
          unsoldLots.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No unsold players recorded.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {unsoldLots.map((lot) => (
                <div
                  key={lot.id}
                  className="rounded-xl bg-zinc-950/70 border border-red-900/30 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                      #{lot.draw_number}
                    </span>
                    <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-800/50">
                      {lot.bucket}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-200 truncate">
                        {lot.player.full_name}
                      </h4>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        Base: ₹{lot.base_price}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleBringDownUnsoldLot(lot.id)}
                      disabled={isFloorMutationPending || !isFloorActive}
                      className="px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-[10px] font-bold shadow disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Queue
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReAuctionUnsoldLot(lot.id)}
                      disabled={isFloorMutationPending || !isFloorActive}
                      className="px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-bold shadow disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Re-Auction
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeQueueTab === 'sold' && (
          soldLots.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No players sold yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {soldLots.map((lot) => (
                <div
                  key={lot.id}
                  className="rounded-xl bg-zinc-950/70 border border-emerald-900/30 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                      #{lot.draw_number}
                    </span>
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-800/50">
                      {lot.bucket}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-200 truncate">
                        {lot.player_name}
                      </h4>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        Sold to <span className="font-bold text-emerald-400">{lot.franchise_name}</span> for ₹{lot.price}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>


      {/* Start Auction Mode Dialog (§2, §3, §4, §5) */}
      {showStartModeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-auction-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="flex flex-col items-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-3 shadow-inner">
                <Play className="size-7 fill-emerald-400 text-emerald-400 ml-1" />
              </span>
              <h2 id="start-auction-title" className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                START AUCTION
              </h2>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Choose how to bring the first player to the floor.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setShowStartModeModal(false);
                  if (sessionState.isCompleted) {
                    handleStartAuctionAgain();
                  } else {
                    handleStartAuction();
                  }
                }}
                disabled={activeBuckets.length === 0 || isFloorMutationPending || isStateMutationPending}
                className="w-full py-4 px-5 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-xl shadow-emerald-950/50 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border border-emerald-400/30"
              >
                <span className="tracking-wide text-sm font-black">START FROM BUCKETS</span>
                <span className="text-[11px] font-normal text-emerald-100 opacity-90">
                  Sequential progression from selected buckets ({activeBuckets.join(', ')})
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStartModeModal(false);
                  setShowGuestDrawModal(true);
                }}
                disabled={activeBuckets.length === 0 || isFloorMutationPending || isStateMutationPending}
                className="w-full py-4 px-5 rounded-2xl font-black text-sm bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-white shadow-xl shadow-amber-950/50 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border border-amber-400/30"
              >
                <span className="flex items-center gap-2 tracking-wide text-sm font-black">
                  <Sparkles className="size-4" />
                  <span>GUEST DRAW</span>
                </span>
                <span className="text-[11px] font-normal text-amber-100 opacity-90">
                  Guest verbally picks number card before moving to floor
                </span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowStartModeModal(false)}
                className="px-5 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guest Draw Dialog */}
      {seasonId && (
        <GuestDrawDialog
          isOpen={showGuestDrawModal}
          onClose={() => setShowGuestDrawModal(false)}
          seasonId={seasonId}
          activeBuckets={activeBuckets}
          initialBucket={activeBuckets[0] || 'B3'}
          hasActiveFloorPlayer={activeLot?.status === 'in_progress'}
          onPlayerDrawn={(_lotId, playerName, drawnActiveLot, drawnSessionState) => {
            setShowGuestDrawModal(false);
            if (drawnActiveLot !== undefined && onActiveLotChange) {
              onActiveLotChange(drawnActiveLot);
            }
            if (drawnSessionState && onSessionStateChange) {
              onSessionStateChange(drawnSessionState);
            }
            setSuccessMsg(`Guest Draw: ${playerName} brought to floor!`);
          }}
        />
      )}
    </div>
  );
}
