'use client';

// =============================================================================
// ACC Auction Portal — Player Portal Form Component
// =============================================================================

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePlayerProfileAction,
  registerPlayerSeasonAction,
  savePlayerSkillProfileAction,
} from '@/lib/players/actions';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';
import { derivePlayerType, validateSkills } from '@/domain/players';
import { BASE_PRICE_LADDER, type BasePrice } from '@/lib/constants';
import type { PlayerFullData } from '@/lib/players/types';

interface PlayerPortalFormProps {
  initialData: PlayerFullData;
  activeSeasonName: string;
}

export function PlayerPortalForm({ initialData, activeSeasonName }: PlayerPortalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<'profile' | 'registration' | 'skills'>(
    !initialData.player
      ? 'profile'
      : !initialData.registration
      ? 'registration'
      : 'skills'
  );

  // ---------------------------------------------------------------------------
  // 1. Personal Profile State
  // ---------------------------------------------------------------------------
  const [fullName, setFullName] = useState(initialData.player?.full_name || '');
  const [rollNumber, setRollNumber] = useState(initialData.player?.roll_number || '');
  const [mobile, setMobile] = useState(initialData.player?.mobile || '');
  const [photoUrl, setPhotoUrl] = useState(initialData.player?.photo_url || '');

  // ---------------------------------------------------------------------------
  // 2. Season Registration State
  // ---------------------------------------------------------------------------
  const [regRollNumber, setRegRollNumber] = useState(
    initialData.registration ? rollNumber : rollNumber
  );
  const [programme, setProgramme] = useState<
    'btech_regular' | 'btech_lateral' | 'diploma' | 'pg'
  >((initialData.registration?.programme as any) || 'btech_regular');
  const [academicYear, setAcademicYear] = useState<number>(
    initialData.registration?.academic_year || 1
  );
  const [branch, setBranch] = useState<string>(
    initialData.registration?.branch || 'CSE'
  );
  const [basePrice, setBasePrice] = useState<BasePrice>(
    (initialData.registration?.base_price as BasePrice) || 20
  );
  const [cricheroesUrl, setCricheroesUrl] = useState(
    initialData.registration?.cricheroes_url || ''
  );
  const [cricheroesMobile, setCricheroesMobile] = useState(
    initialData.registration?.cricheroes_registered_mobile || ''
  );

  const derivedBucket = useMemo(() => {
    return deriveBucket(programme, academicYear);
  }, [programme, academicYear]);

  const handleRegRollChange = (val: string) => {
    const upper = val.toUpperCase();
    setRegRollNumber(upper);
    const parsed = parseRollNumber(upper);
    if (parsed.isValid && parsed.programme) {
      setProgramme(parsed.programme);
      if (parsed.admissionYear) {
        setAcademicYear(calculateAcademicYear(parsed.admissionYear, parsed.programme));
      }
      if (parsed.branchName) {
        setBranch(parsed.branchName);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 3. Registration Extras (CricHeroes Pending, Discrepancy, Referral)
  // ---------------------------------------------------------------------------
  const [isCricheroesPending, setIsCricheroesPending] = useState(false);
  const [hasYearDiscrepancy, setHasYearDiscrepancy] = useState(false);
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [isAccReferred, setIsAccReferred] = useState(false);
  const [referredFranchise, setReferredFranchise] = useState('');

  // ---------------------------------------------------------------------------
  // 4. Skill Profile & Branching Questionnaire State (§5.1)
  // ---------------------------------------------------------------------------
  const [isBatter, setIsBatter] = useState(initialData.skillProfile?.is_batter ?? false);
  const [battingArm, setBattingArm] = useState<'right' | 'left'>('right');
  const [battingStyleCustom, setBattingStyleCustom] = useState<string>('aggressive');
  const [battingOrderCustom, setBattingOrderCustom] = useState<string>('top_order');

  const [isBowler, setIsBowler] = useState(initialData.skillProfile?.is_bowler ?? false);
  const [bowlingArm, setBowlingArm] = useState<'right' | 'left'>('right');
  const [bowlingType, setBowlingType] = useState<'fast' | 'spin'>('fast');
  const [paceVariety, setPaceVariety] = useState<string>('seam');
  const [spinVariety, setSpinVariety] = useState<string>('off_spin');
  const [bowlingRoles, setBowlingRoles] = useState<string[]>(['Economical bowler']);

  const [isWicketKeeper, setIsWicketKeeper] = useState(
    initialData.skillProfile?.is_wicket_keeper ?? false
  );
  const [fieldingZone, setFieldingZone] = useState<'infield' | 'outfield'>('infield');
  const [preferredFieldingPosition, setPreferredFieldingPosition] = useState<string>('Cover');

  const [highestLevelPlayed, setHighestLevelPlayed] = useState<string>('inter_college');
  const [playedPreviousAcc, setPlayedPreviousAcc] = useState<boolean>(false);
  const [previousAccTeam, setPreviousAccTeam] = useState<string>('');

  const [isFielderOnly, setIsFielderOnly] = useState(
    initialData.skillProfile?.is_fielder_only ?? false
  );
  const [confirmedFielderOnly, setConfirmedFielderOnly] = useState(
    initialData.skillProfile?.is_fielder_only ?? false
  );

  const [experienceYears, setExperienceYears] = useState<number | ''>(
    initialData.skillProfile?.experience_years ?? ''
  );
  const [experienceDesc, setExperienceDesc] = useState(
    initialData.skillProfile?.experience_description || ''
  );

  // Notifications
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // ---------------------------------------------------------------------------
  // Dynamic Derivations (Pure Client-side Preview)
  // ---------------------------------------------------------------------------
  const rollPreview = useMemo(() => {
    const parsed = parseRollNumber(regRollNumber || rollNumber);
    if (!parsed.isValid || !parsed.programme || !parsed.admissionYear) {
      return null;
    }
    const year = calculateAcademicYear(parsed.admissionYear, parsed.programme);
    const bucket = deriveBucket(parsed.programme, year);
    return {
      programme: parsed.programme,
      branch: parsed.branchName,
      academicYear: year,
      bucket,
    };
  }, [regRollNumber, rollNumber]);

  const derivedRolePreview = useMemo(() => {
    return derivePlayerType({
      is_batter: isBatter,
      is_bowler: isBowler,
      is_wicket_keeper: isWicketKeeper,
      is_fielder_only: isFielderOnly,
    });
  }, [isBatter, isBowler, isWicketKeeper, isFielderOnly]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const res = await savePlayerProfileAction({
        full_name: fullName,
        roll_number: rollNumber,
        mobile,
        photo_url: photoUrl,
      });

      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Failed to save profile' });
      } else {
        setMessage({ type: 'success', text: 'Personal profile saved successfully!' });
        router.refresh();
      }
    });
  }

  async function handleRegisterSeason(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const res = await registerPlayerSeasonAction({
        roll_number: regRollNumber || rollNumber,
        programme,
        academic_year: academicYear,
        branch: branch.trim() || null,
        base_price: basePrice,
        cricheroes_url: cricheroesUrl,
        cricheroes_registered_mobile: cricheroesMobile,
      });

      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Season registration failed' });
      } else {
        setMessage({ type: 'success', text: 'Registered for season successfully!' });
        router.refresh();
        setActiveTab('skills');
      }
    });
  }

  async function handleSaveSkills(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!initialData.registration) {
      setMessage({
        type: 'error',
        text: 'Please submit your season registration before completing your skill questionnaire.',
      });
      return;
    }

    const effectiveFielderOnly = !isBatter && !isBowler && !isWicketKeeper;
    if (effectiveFielderOnly && !confirmedFielderOnly) {
      setMessage({
        type: 'error',
        text: 'You have not selected batting, bowling, or wicket-keeping. Please confirm registration as a Fielder only before saving (§5.1).',
      });
      return;
    }

    const validation = validateSkills({
      is_batter: isBatter,
      is_bowler: isBowler,
      is_wicket_keeper: isWicketKeeper,
      is_fielder_only: effectiveFielderOnly,
    });

    if (!validation.isValid) {
      setMessage({ type: 'error', text: validation.error || 'Invalid skill questionnaire' });
      return;
    }

    const structuredProfile = {
      batting: isBatter ? {
        arm: battingArm,
        style: battingStyleCustom,
        position: battingOrderCustom,
      } : null,
      bowling: isBowler ? {
        arm: bowlingArm,
        type: bowlingType,
        paceVariety: bowlingType === 'fast' ? paceVariety : null,
        spinVariety: bowlingType === 'spin' ? spinVariety : null,
        roles: bowlingRoles,
      } : null,
      fielding: !isWicketKeeper ? {
        zone: fieldingZone,
        position: preferredFieldingPosition,
      } : { zone: 'wicket_keeper', position: 'Wicket-Keeper' },
      experience: {
        highestLevel: highestLevelPlayed,
        playedPreviousAcc,
        previousAccTeam: playedPreviousAcc ? previousAccTeam : null,
        notes: experienceDesc,
      },
      referral: isAccReferred ? {
        referredByFranchise: referredFranchise,
      } : null,
      discrepancy: hasYearDiscrepancy ? discrepancyNote : null,
      cricHeroesPending: isCricheroesPending,
    };

    const mappedBattingStyle = isBatter ? (battingArm === 'left' ? 'left_hand' : 'right_hand') : null;
    const mappedBattingOrder = isBatter ? (battingOrderCustom === 'finisher' ? 'lower_order' : (battingOrderCustom as any)) : null;
    const mappedBowlingStyle = isBowler
      ? (bowlingArm === 'left'
          ? (bowlingType === 'fast' ? 'left_arm_fast' : 'left_arm_orthodox')
          : (bowlingType === 'fast' ? 'right_arm_medium' : 'right_arm_off_spin'))
      : null;

    startTransition(async () => {
      const res = await savePlayerSkillProfileAction(initialData.registration!.id, {
        is_batter: isBatter,
        batting_style: mappedBattingStyle,
        batting_order: mappedBattingOrder,
        is_bowler: isBowler,
        bowling_style: mappedBowlingStyle,
        is_wicket_keeper: isWicketKeeper,
        is_fielder_only: effectiveFielderOnly,
        fielding_position: !isWicketKeeper ? preferredFieldingPosition : 'Wicket-Keeper',
        experience_years: typeof experienceYears === 'number' ? experienceYears : null,
        experience_description: JSON.stringify(structuredProfile),
      });

      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Failed to save skill profile' });
      } else {
        setMessage({
          type: 'success',
          text: 'Skill questionnaire saved! Auction eligibility is now active. Redirecting to your Player Dashboard...',
        });
        router.refresh();
        setTimeout(() => {
          router.push('/player');
        }, 1200);
      }
    });
  }

  return (
    <div>
      {/* Return to Dashboard link */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/player')}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
        >
          <span>← Return to Player Dashboard</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => {
            setActiveTab('profile');
            setMessage(null);
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'profile'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          1. Player Profile {initialData.player ? '✓' : ''}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('registration');
            setMessage(null);
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'registration'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          2. Season Registration {initialData.registration ? '✓' : ''}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('skills');
            setMessage(null);
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'skills'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          3. Skills Questionnaire {initialData.skillProfile ? '✓' : ''}
        </button>
      </div>

      {/* Status Messages */}
      {message && (
        <div
          role="alert"
          aria-live="assertive"
          className={`mb-6 rounded-md p-4 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* TAB 1: Profile Form */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-lg border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold mb-1">Permanent Player Identity</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Your permanent student cricket identity. Your roll number and contact mobile remain private.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="full_name" className="block text-xs font-semibold mb-1">
                Full Name *
              </label>
              <input
                id="full_name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <div>
              <label htmlFor="roll_number" className="block text-xs font-semibold mb-1">
                College Roll Number *
              </label>
              <input
                id="roll_number"
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                placeholder="e.g. 23811A0501 or 23597-EC-001"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm uppercase dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <div>
              <label htmlFor="mobile" className="block text-xs font-semibold mb-1">
                Mobile Number (Private) *
              </label>
              <input
                id="mobile"
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile (e.g. 9876543210)"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm dark:bg-gray-800 dark:border-gray-700"
              />
              <span className="text-[11px] text-gray-500">
                Never shared with other franchises or in public views.
              </span>
            </div>

            <div>
              <label htmlFor="photo_url" className="block text-xs font-semibold mb-1">
                Player Photo URL (Optional)
              </label>
              <input
                id="photo_url"
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? 'Saving Profile...' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Season Registration Form */}
      {activeTab === 'registration' && (
        <form
          onSubmit={handleRegisterSeason}
          className="rounded-lg border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">{activeSeasonName} Registration</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select your base price and register for the auction.
              </p>
            </div>
            {initialData.registration && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Status: {initialData.registration.registration_status.toUpperCase()}
              </span>
            )}
          </div>

          {/* Academic Derivation Banner & Controls */}
          <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-xs">
                  Academic Classification & Auction Bucket
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Your tournament auction tier is derived strictly from your course and academic year.
                </p>
              </div>
              <span className="rounded-full bg-emerald-600 text-white font-black text-xs px-3 py-1 shadow-sm">
                Bucket {derivedBucket}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Course / Programme *
                </label>
                <select
                  disabled={Boolean(initialData.registration)}
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value as any)}
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value="btech_regular">B.Tech (Regular)</option>
                  <option value="btech_lateral">B.Tech (Lateral Entry)</option>
                  <option value="diploma">Diploma</option>
                  <option value="pg">Post Graduate (PG)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Academic Year *
                </label>
                <select
                  disabled={Boolean(initialData.registration)}
                  value={academicYear}
                  onChange={(e) => setAcademicYear(Number(e.target.value))}
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                  <option value={5}>5th Year</option>
                  <option value={6}>6th Year</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Branch / Group
                </label>
                <input
                  type="text"
                  disabled={Boolean(initialData.registration)}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value.toUpperCase())}
                  placeholder="e.g. CSE"
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm uppercase bg-white dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg_roll" className="block text-xs font-semibold mb-1">
                Roll Number *
              </label>
              <input
                id="reg_roll"
                type="text"
                required
                disabled={Boolean(initialData.registration)}
                value={regRollNumber}
                onChange={(e) => handleRegRollChange(e.target.value)}
                placeholder="e.g. 24811A05F2, 23811A0501, or custom"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm uppercase disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <div>
              <label htmlFor="base_price" className="block text-xs font-semibold mb-1">
                Auction Base Price (Points) *
              </label>
              <select
                id="base_price"
                required
                disabled={Boolean(initialData.registration)}
                value={basePrice}
                onChange={(e) => setBasePrice(Number(e.target.value) as BasePrice)}
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-800 dark:border-gray-700"
              >
                {BASE_PRICE_LADDER.map((p) => (
                  <option key={p} value={p}>
                    ₹{p} Points
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cricheroes_url" className="block text-xs font-semibold mb-1">
                CricHeroes Profile Link (Optional)
              </label>
              <input
                id="cricheroes_url"
                type="url"
                disabled={Boolean(initialData.registration)}
                value={cricheroesUrl}
                onChange={(e) => setCricheroesUrl(e.target.value)}
                placeholder="https://cricheroes.in/player-profile/..."
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <div>
              <label htmlFor="cricheroes_mobile" className="block text-xs font-semibold mb-1">
                CricHeroes Registered Mobile (Private)
              </label>
              <input
                id="cricheroes_mobile"
                type="tel"
                disabled={Boolean(initialData.registration)}
                value={cricheroesMobile}
                onChange={(e) => setCricheroesMobile(e.target.value)}
                placeholder="10-digit mobile registered in CricHeroes"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            {/* CricHeroes Pending Flow (§5.2) */}
            <div className="sm:col-span-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  disabled={Boolean(initialData.registration)}
                  checked={isCricheroesPending}
                  onChange={(e) => setIsCricheroesPending(e.target.checked)}
                  className="rounded text-amber-600 h-4 w-4"
                />
                My CricHeroes profile is not created yet (Profile Creation Pending)
              </label>
              {isCricheroesPending && (
                <div className="mt-2 text-xs text-amber-800 dark:text-amber-300 space-y-1 pl-6">
                  <p className="font-semibold">How to create your CricHeroes profile (§5.2):</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[11px]">
                    <li>Download the <strong>CricHeroes</strong> app from Google Play Store or Apple App Store.</li>
                    <li>Sign up with your phone number and create your player profile.</li>
                    <li>You can register now; update your profile link before Super Admin auction verification.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Detained Student / Discrepancy Flag (§4.1) */}
            <div className="sm:col-span-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  disabled={Boolean(initialData.registration)}
                  checked={hasYearDiscrepancy}
                  onChange={(e) => setHasYearDiscrepancy(e.target.checked)}
                  className="rounded text-blue-600 h-4 w-4"
                />
                My current study year is different from my roll number (e.g. detained or re-admitted student)
              </label>
              {hasYearDiscrepancy && (
                <div className="mt-2 pl-6 space-y-2">
                  <p className="text-[11px] text-blue-800 dark:text-blue-300">
                    Students with academic discrepancies are not blocked from registering (§4.1). Select your actual current year in the dropdown above, and provide a note below. Super Admin will verify and apply the official academic year override.
                  </p>
                  <input
                    type="text"
                    disabled={Boolean(initialData.registration)}
                    value={discrepancyNote}
                    onChange={(e) => setDiscrepancyNote(e.target.value)}
                    placeholder="Reason for discrepancy (e.g. Year-back in 2024, re-admitted to 2nd year)"
                    className="w-full rounded border px-2 py-1 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
              )}
            </div>

            {/* ACC Reference Program (§5.2, §6, Case 24) */}
            <div className="sm:col-span-2 p-3 rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  disabled={Boolean(initialData.registration)}
                  checked={isAccReferred}
                  onChange={(e) => setIsAccReferred(e.target.checked)}
                  className="rounded text-purple-600 h-4 w-4"
                />
                Did you join Avanthi through the ACC Reference Program? (§5.2, Case 24)
              </label>
              {isAccReferred && (
                <div className="mt-2 pl-6 space-y-2">
                  <label className="block text-[11px] font-semibold text-purple-900 dark:text-purple-300">
                    Select Referring Franchise:
                  </label>
                  <select
                    disabled={Boolean(initialData.registration)}
                    value={referredFranchise}
                    onChange={(e) => setReferredFranchise(e.target.value)}
                    className="w-full rounded-md border px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="">-- Choose Referring Team --</option>
                    <option value="Titans">Titans</option>
                    <option value="Dominators">Dominators</option>
                    <option value="Super Kings">Super Kings</option>
                    <option value="Challengers">Challengers</option>
                    <option value="Warriors">Warriors</option>
                    <option value="Royal Challengers">Royal Challengers</option>
                    <option value="Strikers">Strikers</option>
                    <option value="Daredevils">Daredevils</option>
                    <option value="Rising Stars">Rising Stars</option>
                    <option value="Blasters">Blasters</option>
                    <option value="Champions">Champions</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {!initialData.registration && (
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? 'Registering...' : 'Register for Season'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* TAB 3: Skills Questionnaire Form */}
      {activeTab === 'skills' && (
        <form
          onSubmit={handleSaveSkills}
          className="rounded-lg border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Player Skill Questionnaire</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Answer the skill questions to derive your authoritative player type for the auction.
              </p>
            </div>
            <div className="rounded-md bg-emerald-100 dark:bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              Derived Role: {derivedRolePreview.replace('_', ' ').toUpperCase()}
            </div>
          </div>

          {/* Primary Skill Checkboxes */}
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-md bg-gray-50 dark:bg-gray-800/40 border">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isBatter}
                disabled={isFielderOnly}
                onChange={(e) => setIsBatter(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4"
              />
              Batter
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isBowler}
                disabled={isFielderOnly}
                onChange={(e) => setIsBowler(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4"
              />
              Bowler
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isWicketKeeper}
                disabled={isFielderOnly}
                onChange={(e) => setIsWicketKeeper(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4"
              />
              Wicket-Keeper
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isFielderOnly}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsFielderOnly(checked);
                  if (checked) {
                    setIsBatter(false);
                    setIsBowler(false);
                    setIsWicketKeeper(false);
                  }
                }}
                className="rounded text-emerald-600 h-4 w-4"
              />
              Fielder Only
            </label>
          </div>

          {/* Conditional Detail Fields (§5.1 Branching Questionnaire) */}
          <div className="space-y-5">
            {/* 1. BATTING BRANCH */}
            {isBatter && (
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Batting Profile (§5.1)
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Batting Arm *</label>
                    <select
                      value={battingArm}
                      onChange={(e) => setBattingArm(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="right">Right-hand bat</option>
                      <option value="left">Left-hand bat</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Batting Style *</label>
                    <select
                      value={battingStyleCustom}
                      onChange={(e) => setBattingStyleCustom(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="strike_rotator">Strike Rotator</option>
                      <option value="aggressive">Aggressive Batter</option>
                      <option value="big_hitter">Big Hitter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Preferred Position *</label>
                    <select
                      value={battingOrderCustom}
                      onChange={(e) => setBattingOrderCustom(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="opener">Opener</option>
                      <option value="top_order">Top Order (3-4)</option>
                      <option value="middle_order">Middle Order (5-6)</option>
                      <option value="finisher">Finisher</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 2. BOWLING BRANCH */}
            {isBowler && (
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                  Bowling Profile (§5.1)
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Bowling Arm *</label>
                    <select
                      value={bowlingArm}
                      onChange={(e) => setBowlingArm(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="right">Right-arm</option>
                      <option value="left">Left-arm</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Bowling Type *</label>
                    <select
                      value={bowlingType}
                      onChange={(e) => setBowlingType(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="fast">Fast / Medium-Pace</option>
                      <option value="spin">Spin</option>
                    </select>
                  </div>

                  {bowlingType === 'fast' ? (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Pace Variety *</label>
                      <select
                        value={paceVariety}
                        onChange={(e) => setPaceVariety(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                      >
                        <option value="swing">Swing Bowler</option>
                        <option value="seam">Seam Bowler</option>
                        <option value="express_pace">Express Pace</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Spin Variety *</label>
                      <select
                        value={spinVariety}
                        onChange={(e) => setSpinVariety(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                      >
                        <option value="off_spin">Off-Spin</option>
                        <option value="leg_spin">Leg-Spin</option>
                        <option value="left_arm_orthodox">Left-Arm Orthodox</option>
                        <option value="left_arm_wrist_spin">Left-Arm Wrist-Spin / Chinaman</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Bowling Roles Multi-select */}
                <div>
                  <label className="block text-xs font-semibold mb-2">Bowling Roles (Multi-select) *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      'Powerplay specialist',
                      'Economical bowler',
                      'Death-over specialist',
                      'Wicket-taking bowler',
                    ].map((role) => (
                      <label key={role} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bowlingRoles.includes(role)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBowlingRoles([...bowlingRoles, role]);
                            } else {
                              setBowlingRoles(bowlingRoles.filter((r) => r !== role));
                            }
                          }}
                          className="rounded text-blue-600 h-3.5 w-3.5"
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3. FIELDING BRANCH */}
            {!isWicketKeeper ? (
              <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/30 dark:border-purple-900/50 dark:bg-purple-950/20 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                  Fielding Preferences (§5.1)
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fielding Zone *</label>
                    <select
                      value={fieldingZone}
                      onChange={(e) => setFieldingZone(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="infield">Infield</option>
                      <option value="outfield">Outfield</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Preferred Position *</label>
                    <select
                      value={preferredFieldingPosition}
                      onChange={(e) => setPreferredFieldingPosition(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      {[
                        'Slip',
                        'Point',
                        'Cover',
                        'Mid-off',
                        'Mid-on',
                        'Mid-wicket',
                        'Square leg',
                        'Fine leg',
                        'Third man',
                        'Long-on',
                        'Long-off',
                        'Deep mid-wicket',
                      ].map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                <strong>Primary Keeper:</strong> Your designated fielding assignment is behind the stumps as Wicket-Keeper.
              </div>
            )}

            {/* 4. EXPERIENCE & CAREER HIGHLIGHTS */}
            <div className="p-4 rounded-lg border bg-gray-50/50 dark:bg-gray-800/30 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Playing Experience &amp; Highlights (§5.1)
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Highest Level Played *</label>
                  <select
                    value={highestLevelPlayed}
                    onChange={(e) => setHighestLevelPlayed(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="district_above">District or above</option>
                    <option value="inter_college">Inter-college</option>
                    <option value="school_intra">School or intra-college</option>
                    <option value="recreational">Recreational</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={experienceYears}
                    onChange={(e) =>
                      setExperienceYears(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="e.g. 3"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Played Previous ACC Edition?</label>
                  <select
                    value={playedPreviousAcc ? 'yes' : 'no'}
                    onChange={(e) => setPlayedPreviousAcc(e.target.value === 'yes')}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>

              {playedPreviousAcc && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Previous ACC Team Name</label>
                  <input
                    type="text"
                    value={previousAccTeam}
                    onChange={(e) => setPreviousAccTeam(e.target.value)}
                    placeholder="e.g. Titans, Dominators"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Additional Notes / Highlights (Optional)
                </label>
                <textarea
                  rows={2}
                  value={experienceDesc}
                  onChange={(e) => setExperienceDesc(e.target.value)}
                  placeholder="Mention awards, CricHeroes records, or match-winning performances..."
                  className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            {/* 5. FIELDER-ONLY CONFIRMATION (§5.1) */}
            {!isBatter && !isBowler && !isWicketKeeper && (
              <div className="p-4 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold text-base">⚠️</span>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Fielder-Only Classification (§5.1)
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      You have selected &quot;No&quot; for batting, bowling, and wicket-keeping. Under tournament rules, you will be auctioned strictly as a <strong>Fielder only</strong>.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 cursor-pointer pt-2 pl-6">
                  <input
                    type="checkbox"
                    checked={confirmedFielderOnly}
                    onChange={(e) => setConfirmedFielderOnly(e.target.checked)}
                    className="rounded text-amber-600 h-4 w-4"
                  />
                  I explicitly confirm my registration as a Fielder only.
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? 'Saving Questionnaire...' : 'Save Skill Questionnaire'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
