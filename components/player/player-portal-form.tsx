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
  const [basePrice, setBasePrice] = useState<BasePrice>(
    (initialData.registration?.base_price as BasePrice) || 20
  );
  const [cricheroesUrl, setCricheroesUrl] = useState(
    initialData.registration?.cricheroes_url || ''
  );
  const [cricheroesMobile, setCricheroesMobile] = useState(
    initialData.registration?.cricheroes_registered_mobile || ''
  );

  // ---------------------------------------------------------------------------
  // 3. Skill Profile State
  // ---------------------------------------------------------------------------
  const [isBatter, setIsBatter] = useState(initialData.skillProfile?.is_batter ?? false);
  const [battingStyle, setBattingStyle] = useState<string>(
    initialData.skillProfile?.batting_style || 'right_hand'
  );
  const [battingOrder, setBattingOrder] = useState<string>(
    initialData.skillProfile?.batting_order || 'top_order'
  );

  const [isBowler, setIsBowler] = useState(initialData.skillProfile?.is_bowler ?? false);
  const [bowlingStyle, setBowlingStyle] = useState<string>(
    initialData.skillProfile?.bowling_style || 'right_arm_medium'
  );

  const [isWicketKeeper, setIsWicketKeeper] = useState(
    initialData.skillProfile?.is_wicket_keeper ?? false
  );
  const [isFielderOnly, setIsFielderOnly] = useState(
    initialData.skillProfile?.is_fielder_only ?? false
  );
  const [fieldingPosition, setFieldingPosition] = useState(
    initialData.skillProfile?.fielding_position || ''
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

    const validation = validateSkills({
      is_batter: isBatter,
      is_bowler: isBowler,
      is_wicket_keeper: isWicketKeeper,
      is_fielder_only: isFielderOnly,
    });

    if (!validation.isValid) {
      setMessage({ type: 'error', text: validation.error || 'Invalid skill questionnaire' });
      return;
    }

    startTransition(async () => {
      const res = await savePlayerSkillProfileAction(initialData.registration!.id, {
        is_batter: isBatter,
        batting_style: isBatter ? (battingStyle as any) : null,
        batting_order: isBatter ? (battingOrder as any) : null,
        is_bowler: isBowler,
        bowling_style: isBowler ? (bowlingStyle as any) : null,
        is_wicket_keeper: isWicketKeeper,
        is_fielder_only: isFielderOnly,
        fielding_position: fieldingPosition,
        experience_years: typeof experienceYears === 'number' ? experienceYears : null,
        experience_description: experienceDesc,
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

          {/* Academic Derivation Banner */}
          {rollPreview && (
            <div className="mb-6 rounded-md bg-gray-50 dark:bg-gray-800/60 p-4 border text-xs">
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Automated Academic Classification:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-gray-500">Programme:</span>
                  <p className="font-bold">{rollPreview.programme.replace('_', ' ').toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-gray-500">Branch:</span>
                  <p className="font-bold">{rollPreview.branch || 'General'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Academic Year:</span>
                  <p className="font-bold">Year {rollPreview.academicYear}</p>
                </div>
                <div>
                  <span className="text-gray-500">Assigned Bucket:</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">
                    {rollPreview.bucket}
                  </p>
                </div>
              </div>
            </div>
          )}

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
                onChange={(e) => setRegRollNumber(e.target.value.toUpperCase())}
                placeholder="e.g. 23811A0501"
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

          {/* Conditional Detail Fields */}
          <div className="space-y-4">
            {isBatter && (
              <div className="grid gap-4 sm:grid-cols-2 p-4 rounded-md border border-emerald-100 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div>
                  <label htmlFor="batting_style" className="block text-xs font-semibold mb-1">
                    Batting Style
                  </label>
                  <select
                    id="batting_style"
                    value={battingStyle}
                    onChange={(e) => setBattingStyle(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="right_hand">Right Hand Bat</option>
                    <option value="left_hand">Left Hand Bat</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="batting_order" className="block text-xs font-semibold mb-1">
                    Preferred Batting Order
                  </label>
                  <select
                    id="batting_order"
                    value={battingOrder}
                    onChange={(e) => setBattingOrder(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="opener">Opener</option>
                    <option value="top_order">Top Order (3-4)</option>
                    <option value="middle_order">Middle Order (5-6)</option>
                    <option value="lower_order">Lower Order (7+)</option>
                  </select>
                </div>
              </div>
            )}

            {isBowler && (
              <div className="p-4 rounded-md border border-emerald-100 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <label htmlFor="bowling_style" className="block text-xs font-semibold mb-1">
                  Bowling Style
                </label>
                <select
                  id="bowling_style"
                  value={bowlingStyle}
                  onChange={(e) => setBowlingStyle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value="right_arm_fast">Right Arm Fast</option>
                  <option value="right_arm_medium">Right Arm Medium</option>
                  <option value="left_arm_fast">Left Arm Fast</option>
                  <option value="left_arm_medium">Left Arm Medium</option>
                  <option value="right_arm_off_spin">Right Arm Off Spin</option>
                  <option value="right_arm_leg_spin">Right Arm Leg Spin</option>
                  <option value="left_arm_orthodox">Left Arm Orthodox</option>
                  <option value="left_arm_chinaman">Left Arm Chinaman</option>
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="fielding_pos" className="block text-xs font-semibold mb-1">
                  Preferred Fielding Position
                </label>
                <input
                  id="fielding_pos"
                  type="text"
                  value={fieldingPosition}
                  onChange={(e) => setFieldingPosition(e.target.value)}
                  placeholder="e.g. Slips, Cover, Long-on"
                  className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                />
              </div>

              <div>
                <label htmlFor="exp_years" className="block text-xs font-semibold mb-1">
                  Cricket Experience (Years)
                </label>
                <input
                  id="exp_years"
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
            </div>

            <div>
              <label htmlFor="exp_desc" className="block text-xs font-semibold mb-1">
                Cricket Background / Highlights (Optional)
              </label>
              <textarea
                id="exp_desc"
                rows={3}
                value={experienceDesc}
                onChange={(e) => setExperienceDesc(e.target.value)}
                placeholder="Mention tournaments played, awards, CricHeroes milestones, or club achievements..."
                className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
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
