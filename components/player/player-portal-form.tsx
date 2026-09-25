'use client';

// =============================================================================
// ACC Auction Portal — Player Portal Form Component
// =============================================================================

import { useState, useTransition, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePlayerProfileAction,
  registerPlayerSeasonAction,
  savePlayerSkillProfileAction,
  uploadPlayerPhotoAction,
} from '@/lib/players/actions';
import {
  parseRollNumber,
  calculateAcademicYear,
  deriveBucket,
  deriveAcademicProfile,
} from '@/domain/academic';
import { derivePlayerType, validateSkills } from '@/domain/players';
import { BASE_PRICE_LADDER, type BasePrice } from '@/lib/constants';
import type { PlayerFullData } from '@/lib/players/types';
import type { DbPlayerSkillProfile } from '@/lib/db/types';

interface PlayerPortalFormProps {
  initialData: PlayerFullData;
  activeSeasonName: string;
}

/**
 * Safely parses pre-existing skills and questionnaire answers from the database.
 */
function parseInitialSkills(profile: DbPlayerSkillProfile | null) {
  if (!profile) {
    return {
      isBatter: false,
      battingArm: 'right' as 'right' | 'left',
      battingStyleCustom: 'aggressive',
      battingOrderCustom: 'top_order',
      isBowler: false,
      bowlingArm: 'right' as 'right' | 'left',
      bowlingType: 'fast' as 'fast' | 'spin',
      paceVariety: 'seam',
      spinVariety: 'off_spin',
      bowlingRoles: ['Economical bowler'],
      isWicketKeeper: false,
      fieldingZone: 'infield' as 'infield' | 'outfield',
      preferredFieldingPosition: 'Cover',
      highestLevelPlayed: 'inter_college',
      playedPreviousAcc: false,
      previousAccTeam: '',
      isFielderOnly: false,
      confirmedFielderOnly: false,
      experienceYears: '' as number | '',
      experienceDesc: '',
      hasYearDiscrepancy: false,
      discrepancyNote: '',
      isAccReferred: false,
      referredFranchise: '',
      isCricheroesPending: false,
    };
  }

  let parsed: any = null;
  if (profile.experience_description) {
    try {
      parsed = JSON.parse(profile.experience_description);
    } catch {
      // plain text description
    }
  }

  const isBatter = Boolean(profile.is_batter);
  const isBowler = Boolean(profile.is_bowler);
  const isWicketKeeper = Boolean(profile.is_wicket_keeper);
  const isFielderOnly = Boolean(profile.is_fielder_only);

  const battingArm: 'right' | 'left' =
    parsed?.batting?.arm || (profile.batting_style?.includes('left') ? 'left' : 'right');
  const battingStyleCustom: string = parsed?.batting?.style || 'aggressive';
  const battingOrderCustom: string =
    parsed?.batting?.position || profile.batting_order || 'top_order';

  const bowlingArm: 'right' | 'left' =
    parsed?.bowling?.arm || (profile.bowling_style?.includes('left') ? 'left' : 'right');
  const bowlingType: 'fast' | 'spin' =
    parsed?.bowling?.type ||
    (profile.bowling_style?.includes('spin') || profile.bowling_style?.includes('orthodox')
      ? 'spin'
      : 'fast');
  const paceVariety: string = parsed?.bowling?.paceVariety || 'seam';
  const spinVariety: string = parsed?.bowling?.spinVariety || 'off_spin';
  const bowlingRoles: string[] =
    Array.isArray(parsed?.bowling?.roles) && parsed.bowling.roles.length > 0
      ? parsed.bowling.roles
      : ['Economical bowler'];

  const fieldingZone: 'infield' | 'outfield' = parsed?.fielding?.zone || 'infield';
  const preferredFieldingPosition: string =
    parsed?.fielding?.position || profile.fielding_position || 'Cover';

  const highestLevelPlayed: string = parsed?.experience?.highestLevel || 'inter_college';
  const playedPreviousAcc: boolean = Boolean(parsed?.experience?.playedPreviousAcc);
  const previousAccTeam: string = parsed?.experience?.previousAccTeam || '';
  const experienceDesc: string =
    typeof parsed?.experience?.notes === 'string'
      ? parsed.experience.notes
      : typeof profile.experience_description === 'string' && !parsed
      ? profile.experience_description
      : '';

  return {
    isBatter,
    battingArm,
    battingStyleCustom,
    battingOrderCustom,
    isBowler,
    bowlingArm,
    bowlingType,
    paceVariety,
    spinVariety,
    bowlingRoles,
    isWicketKeeper,
    fieldingZone,
    preferredFieldingPosition,
    highestLevelPlayed,
    playedPreviousAcc,
    previousAccTeam,
    isFielderOnly,
    confirmedFielderOnly: isFielderOnly,
    experienceYears:
      typeof profile.experience_years === 'number'
        ? profile.experience_years
        : ('' as number | ''),
    experienceDesc,
    hasYearDiscrepancy: Boolean(parsed?.discrepancy),
    discrepancyNote: parsed?.discrepancy || '',
    isAccReferred: Boolean(parsed?.referral?.referredByFranchise),
    referredFranchise: parsed?.referral?.referredByFranchise || '',
    isCricheroesPending: Boolean(parsed?.cricHeroesPending),
  };
}

export function PlayerPortalForm({ initialData, activeSeasonName }: PlayerPortalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEligible = Boolean(
    initialData.registration?.is_auction_eligible ||
    initialData.registration?.registration_status === 'eligible'
  );

  const [activeTab, setActiveTab] = useState<'profile' | 'registration' | 'skills'>(
    !initialData.player
      ? 'profile'
      : !initialData.registration
      ? 'registration'
      : 'skills'
  );

  // ---------------------------------------------------------------------------
  // 1. Personal Profile State & Snapshot
  // ---------------------------------------------------------------------------
  const [isEditingProfile, setIsEditingProfile] = useState(!initialData.player);
  const [fullName, setFullName] = useState(initialData.player?.full_name || '');
  const [rollNumber, setRollNumber] = useState(initialData.player?.roll_number || '');
  const [mobile, setMobile] = useState(initialData.player?.mobile || '');
  const [photoUrl, setPhotoUrl] = useState(initialData.player?.photo_url || '');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [regRollError, setRegRollError] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileSnapshot, setProfileSnapshot] = useState({
    fullName: initialData.player?.full_name || '',
    rollNumber: initialData.player?.roll_number || '',
    mobile: initialData.player?.mobile || '',
    photoUrl: initialData.player?.photo_url || '',
  });

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setPhotoError('Please select a JPG, PNG, or WebP photo.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo file size must not exceed 5 MB.');
      return;
    }

    setIsProcessingPhoto(true);
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 800;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(async (blob) => {
              try {
                if (blob) {
                  const formData = new FormData();
                  formData.append('file', blob, 'photo.jpg');
                  const uploadRes = await uploadPlayerPhotoAction(formData);
                  if (uploadRes.success && uploadRes.url) {
                    setPhotoUrl(uploadRes.url);
                    setPhotoError(null);
                    setIsProcessingPhoto(false);
                    return;
                  }
                  if (!uploadRes.success) {
                    setPhotoError(uploadRes.error || 'Failed to upload photo to storage. Please try again.');
                    setIsProcessingPhoto(false);
                    return;
                  }
                }
              } catch (uploadErr: any) {
                setPhotoError(uploadErr?.message || 'Storage upload error. Please check your connection and try again.');
                setIsProcessingPhoto(false);
                return;
              }
              setIsProcessingPhoto(false);
            }, 'image/jpeg', 0.85);
          } else {
            setPhotoError('Failed to process image on device canvas.');
            setIsProcessingPhoto(false);
          }
        } catch {
          setPhotoError('Failed to process image on device.');
          setIsProcessingPhoto(false);
        }
      };
      img.onerror = () => {
        setPhotoError('Failed to read image file.');
        setIsProcessingPhoto(false);
      };
      img.src = loadEvt.target?.result as string;
    };
    reader.onerror = () => {
      setPhotoError('Failed to load image from your device.');
      setIsProcessingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleStartEditProfile = () => {
    setProfileSnapshot({ fullName, rollNumber, mobile, photoUrl });
    setIsEditingProfile(true);
    setMessage(null);
    setPhotoError(null);
  };

  const handleCancelProfile = () => {
    setFullName(profileSnapshot.fullName);
    setRollNumber(profileSnapshot.rollNumber);
    setMobile(profileSnapshot.mobile);
    setPhotoUrl(profileSnapshot.photoUrl);
    setIsEditingProfile(false);
    setMessage(null);
    setPhotoError(null);
  };

  // ---------------------------------------------------------------------------
  // 2. Season Registration State & Snapshot
  // ---------------------------------------------------------------------------
  const [isEditingReg, setIsEditingReg] = useState(!initialData.registration);
  const [regRollNumber, setRegRollNumber] = useState(
    initialData.player?.roll_number || rollNumber
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

  const handleRollChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setRollNumber(upper);
    if (!upper) {
      setRollError('College roll number is required.');
    } else {
      const parsed = parseRollNumber(upper);
      if (!parsed.isValid) {
        setRollError(parsed.error || 'Invalid roll number format. Must match B.Tech regular (YY811Abbnn), B.Tech lateral (YY815Abbnn), or Diploma (YY597-BB-nnn).');
      } else {
        setRollError(null);
      }
    }
  };

  const handleRegRollChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setRegRollNumber(upper);
    if (!upper) {
      setRegRollError('Roll number is required.');
      return;
    }
    const derived = deriveAcademicProfile(upper);
    if (derived.isValid && derived.programme) {
      setRegRollError(null);
      setProgramme(derived.programme);
      if (derived.academicYear) {
        setAcademicYear(derived.academicYear);
      }
      if (derived.branchName || derived.branchCode) {
        setBranch(derived.branchName || derived.branchCode || '');
      }
    } else {
      setRegRollError(derived.error || 'Invalid roll number format. Must match B.Tech regular (YY811Abbnn), B.Tech lateral (YY815Abbnn), or Diploma (YY597-BB-nnn).');
    }
  };

  // Registration Extras (CricHeroes Pending, Discrepancy, Referral)
  const initialParsedSkills = useMemo(
    () => parseInitialSkills(initialData.skillProfile),
    [initialData.skillProfile]
  );

  const [isCricheroesPending, setIsCricheroesPending] = useState(
    initialParsedSkills.isCricheroesPending
  );
  const [hasYearDiscrepancy, setHasYearDiscrepancy] = useState(
    initialParsedSkills.hasYearDiscrepancy
  );
  const [discrepancyNote, setDiscrepancyNote] = useState(
    initialParsedSkills.discrepancyNote
  );
  const [isAccReferred, setIsAccReferred] = useState(
    initialParsedSkills.isAccReferred
  );
  const [referredFranchise, setReferredFranchise] = useState(
    initialParsedSkills.referredFranchise
  );

  const [regSnapshot, setRegSnapshot] = useState({
    regRollNumber: initialData.player?.roll_number || rollNumber,
    programme: (initialData.registration?.programme as any) || 'btech_regular',
    academicYear: initialData.registration?.academic_year || 1,
    branch: initialData.registration?.branch || 'CSE',
    basePrice: (initialData.registration?.base_price as BasePrice) || 20,
    cricheroesUrl: initialData.registration?.cricheroes_url || '',
    cricheroesMobile: initialData.registration?.cricheroes_registered_mobile || '',
    isCricheroesPending: initialParsedSkills.isCricheroesPending,
    hasYearDiscrepancy: initialParsedSkills.hasYearDiscrepancy,
    discrepancyNote: initialParsedSkills.discrepancyNote,
    isAccReferred: initialParsedSkills.isAccReferred,
    referredFranchise: initialParsedSkills.referredFranchise,
  });

  const handleStartEditReg = () => {
    if (isEligible) return;
    setRegSnapshot({
      regRollNumber,
      programme,
      academicYear,
      branch,
      basePrice,
      cricheroesUrl,
      cricheroesMobile,
      isCricheroesPending,
      hasYearDiscrepancy,
      discrepancyNote,
      isAccReferred,
      referredFranchise,
    });
    setIsEditingReg(true);
    setMessage(null);
  };

  const handleCancelReg = () => {
    setRegRollNumber(regSnapshot.regRollNumber);
    setProgramme(regSnapshot.programme);
    setAcademicYear(regSnapshot.academicYear);
    setBranch(regSnapshot.branch);
    setBasePrice(regSnapshot.basePrice);
    setCricheroesUrl(regSnapshot.cricheroesUrl);
    setCricheroesMobile(regSnapshot.cricheroesMobile);
    setIsCricheroesPending(regSnapshot.isCricheroesPending);
    setHasYearDiscrepancy(regSnapshot.hasYearDiscrepancy);
    setDiscrepancyNote(regSnapshot.discrepancyNote);
    setIsAccReferred(regSnapshot.isAccReferred);
    setReferredFranchise(regSnapshot.referredFranchise);
    setIsEditingReg(false);
    setMessage(null);
  };

  // ---------------------------------------------------------------------------
  // 3. Skill Profile & Questionnaire State & Snapshot (§5.1)
  // ---------------------------------------------------------------------------
  const [isEditingSkills, setIsEditingSkills] = useState(!initialData.skillProfile);

  const [isBatter, setIsBatter] = useState(initialParsedSkills.isBatter);
  const [battingArm, setBattingArm] = useState<'right' | 'left'>(initialParsedSkills.battingArm);
  const [battingStyleCustom, setBattingStyleCustom] = useState<string>(
    initialParsedSkills.battingStyleCustom
  );
  const [battingOrderCustom, setBattingOrderCustom] = useState<string>(
    initialParsedSkills.battingOrderCustom
  );

  const [isBowler, setIsBowler] = useState(initialParsedSkills.isBowler);
  const [bowlingArm, setBowlingArm] = useState<'right' | 'left'>(initialParsedSkills.bowlingArm);
  const [bowlingType, setBowlingType] = useState<'fast' | 'spin'>(initialParsedSkills.bowlingType);
  const [paceVariety, setPaceVariety] = useState<string>(initialParsedSkills.paceVariety);
  const [spinVariety, setSpinVariety] = useState<string>(initialParsedSkills.spinVariety);
  const [bowlingRoles, setBowlingRoles] = useState<string[]>(initialParsedSkills.bowlingRoles);

  const [isWicketKeeper, setIsWicketKeeper] = useState(initialParsedSkills.isWicketKeeper);
  const [fieldingZone, setFieldingZone] = useState<'infield' | 'outfield'>(
    initialParsedSkills.fieldingZone
  );
  const [preferredFieldingPosition, setPreferredFieldingPosition] = useState<string>(
    initialParsedSkills.preferredFieldingPosition
  );

  const [highestLevelPlayed, setHighestLevelPlayed] = useState<string>(
    initialParsedSkills.highestLevelPlayed
  );
  const [playedPreviousAcc, setPlayedPreviousAcc] = useState<boolean>(
    initialParsedSkills.playedPreviousAcc
  );
  const [previousAccTeam, setPreviousAccTeam] = useState<string>(
    initialParsedSkills.previousAccTeam
  );

  const [isFielderOnly, setIsFielderOnly] = useState(initialParsedSkills.isFielderOnly);
  const [confirmedFielderOnly, setConfirmedFielderOnly] = useState(
    initialParsedSkills.confirmedFielderOnly
  );

  const [experienceYears, setExperienceYears] = useState<number | ''>(
    initialParsedSkills.experienceYears
  );
  const [experienceDesc, setExperienceDesc] = useState(initialParsedSkills.experienceDesc);

  const [skillsSnapshot, setSkillsSnapshot] = useState({
    isBatter: initialParsedSkills.isBatter,
    battingArm: initialParsedSkills.battingArm,
    battingStyleCustom: initialParsedSkills.battingStyleCustom,
    battingOrderCustom: initialParsedSkills.battingOrderCustom,
    isBowler: initialParsedSkills.isBowler,
    bowlingArm: initialParsedSkills.bowlingArm,
    bowlingType: initialParsedSkills.bowlingType,
    paceVariety: initialParsedSkills.paceVariety,
    spinVariety: initialParsedSkills.spinVariety,
    bowlingRoles: initialParsedSkills.bowlingRoles,
    isWicketKeeper: initialParsedSkills.isWicketKeeper,
    fieldingZone: initialParsedSkills.fieldingZone,
    preferredFieldingPosition: initialParsedSkills.preferredFieldingPosition,
    highestLevelPlayed: initialParsedSkills.highestLevelPlayed,
    playedPreviousAcc: initialParsedSkills.playedPreviousAcc,
    previousAccTeam: initialParsedSkills.previousAccTeam,
    isFielderOnly: initialParsedSkills.isFielderOnly,
    confirmedFielderOnly: initialParsedSkills.confirmedFielderOnly,
    experienceYears: initialParsedSkills.experienceYears,
    experienceDesc: initialParsedSkills.experienceDesc,
  });

  const handleStartEditSkills = () => {
    if (isEligible) return;
    setSkillsSnapshot({
      isBatter,
      battingArm,
      battingStyleCustom,
      battingOrderCustom,
      isBowler,
      bowlingArm,
      bowlingType,
      paceVariety,
      spinVariety,
      bowlingRoles,
      isWicketKeeper,
      fieldingZone,
      preferredFieldingPosition,
      highestLevelPlayed,
      playedPreviousAcc,
      previousAccTeam,
      isFielderOnly,
      confirmedFielderOnly,
      experienceYears,
      experienceDesc,
    });
    setIsEditingSkills(true);
    setMessage(null);
  };

  const handleCancelSkills = () => {
    setIsBatter(skillsSnapshot.isBatter);
    setBattingArm(skillsSnapshot.battingArm);
    setBattingStyleCustom(skillsSnapshot.battingStyleCustom);
    setBattingOrderCustom(skillsSnapshot.battingOrderCustom);
    setIsBowler(skillsSnapshot.isBowler);
    setBowlingArm(skillsSnapshot.bowlingArm);
    setBowlingType(skillsSnapshot.bowlingType);
    setPaceVariety(skillsSnapshot.paceVariety);
    setSpinVariety(skillsSnapshot.spinVariety);
    setBowlingRoles(skillsSnapshot.bowlingRoles);
    setIsWicketKeeper(skillsSnapshot.isWicketKeeper);
    setFieldingZone(skillsSnapshot.fieldingZone);
    setPreferredFieldingPosition(skillsSnapshot.preferredFieldingPosition);
    setHighestLevelPlayed(skillsSnapshot.highestLevelPlayed);
    setPlayedPreviousAcc(skillsSnapshot.playedPreviousAcc);
    setPreviousAccTeam(skillsSnapshot.previousAccTeam);
    setIsFielderOnly(skillsSnapshot.isFielderOnly);
    setConfirmedFielderOnly(skillsSnapshot.confirmedFielderOnly);
    setExperienceYears(skillsSnapshot.experienceYears);
    setExperienceDesc(skillsSnapshot.experienceDesc);
    setIsEditingSkills(false);
    setMessage(null);
  };

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

    if (!photoUrl || photoUrl.trim() === '') {
      setPhotoError('Player photograph is required.');
      setMessage({ type: 'error', text: 'Player photograph is required.' });
      return;
    }

    if (isProcessingPhoto) {
      setMessage({ type: 'error', text: 'Please wait for your photograph to finish uploading.' });
      return;
    }

    const parsedProfileRoll = parseRollNumber(rollNumber);
    if (!parsedProfileRoll.isValid) {
      const err = parsedProfileRoll.error || 'Invalid roll number format. Must match B.Tech regular (YY811Abbnn), B.Tech lateral (YY815Abbnn), or Diploma (YY597-BB-nnn).';
      setRollError(err);
      setMessage({ type: 'error', text: err });
      return;
    }

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
        setProfileSnapshot({ fullName, rollNumber, mobile, photoUrl });
        setIsEditingProfile(false);
        setMessage({ type: 'success', text: 'Registration information saved' });
        router.refresh();
      }
    });
  }

  async function handleRegisterSeason(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const activeRoll = regRollNumber || rollNumber;
    const parsedRegRoll = parseRollNumber(activeRoll);
    if (!parsedRegRoll.isValid) {
      const err = parsedRegRoll.error || 'Invalid roll number format. Registration blocked.';
      setRegRollError(err);
      setMessage({ type: 'error', text: err });
      return;
    }

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
        setRegSnapshot({
          regRollNumber,
          programme,
          academicYear,
          branch,
          basePrice,
          cricheroesUrl,
          cricheroesMobile,
          isCricheroesPending,
          hasYearDiscrepancy,
          discrepancyNote,
          isAccReferred,
          referredFranchise,
        });
        setIsEditingReg(false);
        setMessage({ type: 'success', text: 'Registration information saved' });
        router.refresh();
        if (!initialData.registration) {
          setActiveTab('skills');
        }
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

    if (isEligible) {
      setMessage({
        type: 'error',
        text: 'Your registration is approved and locked for the tournament auction. Modifications cannot be made.',
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
      batting: isBatter
        ? {
            arm: battingArm,
            style: battingStyleCustom,
            position: battingOrderCustom,
          }
        : null,
      bowling: isBowler
        ? {
            arm: bowlingArm,
            type: bowlingType,
            paceVariety: bowlingType === 'fast' ? paceVariety : null,
            spinVariety: bowlingType === 'spin' ? spinVariety : null,
            roles: bowlingRoles,
          }
        : null,
      fielding: !isWicketKeeper
        ? {
            zone: fieldingZone,
            position: preferredFieldingPosition,
          }
        : { zone: 'wicket_keeper', position: 'Wicket-Keeper' },
      experience: {
        highestLevel: highestLevelPlayed,
        playedPreviousAcc,
        previousAccTeam: playedPreviousAcc ? previousAccTeam : null,
        notes: experienceDesc,
      },
      referral: isAccReferred
        ? {
            referredByFranchise: referredFranchise,
          }
        : null,
      discrepancy: hasYearDiscrepancy ? discrepancyNote : null,
      cricHeroesPending: isCricheroesPending,
    };

    const mappedBattingStyle = isBatter
      ? battingArm === 'left'
        ? 'left_hand'
        : 'right_hand'
      : null;
    const mappedBattingOrder = isBatter
      ? battingOrderCustom === 'finisher'
        ? 'lower_order'
        : (battingOrderCustom as any)
      : null;
    const mappedBowlingStyle = isBowler
      ? bowlingArm === 'left'
        ? bowlingType === 'fast'
          ? 'left_arm_fast'
          : 'left_arm_orthodox'
        : bowlingType === 'fast'
        ? 'right_arm_medium'
        : 'right_arm_off_spin'
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
        setSkillsSnapshot({
          isBatter,
          battingArm,
          battingStyleCustom,
          battingOrderCustom,
          isBowler,
          bowlingArm,
          bowlingType,
          paceVariety,
          spinVariety,
          bowlingRoles,
          isWicketKeeper,
          fieldingZone,
          preferredFieldingPosition,
          highestLevelPlayed,
          playedPreviousAcc,
          previousAccTeam,
          isFielderOnly,
          confirmedFielderOnly,
          experienceYears,
          experienceDesc,
        });
        setIsEditingSkills(false);
        setMessage({
          type: 'success',
          text: 'Registration information saved',
        });
        router.refresh();
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

      {/* Auction Eligibility Lock Banner */}
      {isEligible && (
        <div className="mb-6 rounded-lg border-2 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔒</span>
            <div>
              <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                Registration Approved &amp; Locked for Auction
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Your player registration and skill questionnaire have been verified and approved by the Super Admin for the active tournament auction.
                Modifications are locked to ensure auction integrity.
              </p>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold">Permanent Player Identity</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your permanent student cricket identity. Your roll number and contact mobile remain private.
              </p>
            </div>
            {initialData.player && !isEditingProfile && (
              <button
                type="button"
                onClick={handleStartEditProfile}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700 cursor-pointer"
              >
                <span>✏️</span>
                <span>EDIT</span>
              </button>
            )}
          </div>

          {initialData.player && !isEditingProfile && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/30">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Registration information saved
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Profile is currently in read-only mode. Click EDIT to modify details.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="full_name" className="block text-xs font-semibold mb-1">
                Full Name *
              </label>
              <input
                id="full_name"
                type="text"
                required
                disabled={!isEditingProfile}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
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
                disabled={!isEditingProfile}
                value={rollNumber}
                onChange={(e) => handleRollChange(e.target.value)}
                placeholder="e.g. 25811A0403, 25815A0403, or 24597-CM-015"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm uppercase disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
              />
              {rollError && (
                <p className="text-[11px] text-destructive mt-1 font-medium">{rollError}</p>
              )}
            </div>

            <div>
              <label htmlFor="mobile" className="block text-xs font-semibold mb-1">
                Mobile Number (Private) *
              </label>
              <input
                id="mobile"
                type="tel"
                required
                disabled={!isEditingProfile}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile (e.g. 9876543210)"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
              />
              <span className="text-[11px] text-gray-500">
                Never shared with other franchises or in public views.
              </span>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="block text-xs font-semibold">
                Player Photograph <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(Projected on Big Screen)</span>
              </label>

              {/* Face Visible Guidance Alert (§5) */}
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-gray-600 dark:text-gray-300">
                <p className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
                  <span>📸</span>
                  <span>Upload a clear photo with the face clearly visible. Formal or casual photo accepted.</span>
                </p>
                High quality is essential as your photograph will be projected on a large screen during live bidding in the college auditorium. Accepts JPG, JPEG, PNG, WebP (max 5 MB).
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                disabled={!isEditingProfile || isProcessingPhoto}
                onChange={handlePhotoFileChange}
                className="hidden"
                id="player-photo-upload"
              />

              {/* Photo Display / Upload Control */}
              {photoUrl ? (
                <div className="flex items-center gap-4 p-3.5 rounded-lg border bg-gray-50/70 dark:bg-gray-800/40">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-emerald-500 shadow-sm shrink-0 bg-gray-200 dark:bg-gray-700">
                    <img
                      src={photoUrl}
                      alt="Player preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <span>✓</span> Photograph uploaded
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Face clearly visible • Ready for auditorium projector
                    </p>
                    {isEditingProfile && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isProcessingPhoto}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
                        >
                          <span>🔄</span>
                          <span>Replace Photo</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                isEditingProfile && (
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-5 text-center bg-gray-50/50 dark:bg-gray-800/20 hover:border-emerald-500 transition-colors">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                        📷
                      </div>
                      <div>
                        <button
                          type="button"
                          disabled={isProcessingPhoto}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                        >
                          <span>Upload Photo</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Choose photo from device or camera • JPG, PNG, WebP up to 5 MB
                      </p>
                    </div>
                  </div>
                )
              )}

              {/* Upload Status / Error feedback */}
              {isProcessingPhoto && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold p-2 bg-emerald-50/60 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-800 animate-pulse">
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Uploading photograph to secure storage...</span>
                </div>
              )}

              {photoError && (
                <div className="p-2.5 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400 font-semibold">
                  ⚠️ {photoError}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            {!isEditingProfile ? (
              <button
                type="button"
                onClick={handleStartEditProfile}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
              >
                <span>✏️</span>
                <span>EDIT</span>
              </button>
            ) : (
              <>
                {initialData.player && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCancelProfile}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending || isProcessingPhoto}
                  className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessingPhoto ? 'Uploading Photo...' : isPending ? 'Saving...' : 'SAVE'}
                </button>
              </>
            )}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold">{activeSeasonName} Registration</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select your base price and register for the auction.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {initialData.registration && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Status: {initialData.registration.registration_status.toUpperCase()}
                </span>
              )}
              {initialData.registration && !isEditingReg && !isEligible && (
                <button
                  type="button"
                  onClick={handleStartEditReg}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>EDIT</span>
                </button>
              )}
            </div>
          </div>

          {initialData.registration && !isEditingReg && !isEligible && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/30">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Registration information saved
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Season registration details are saved in read-only mode. Click EDIT to make changes before verification.
                </p>
              </div>
            </div>
          )}

          {/* Academic Derivation Banner & Controls */}
          <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-xs">
                  Academic Classification &amp; Auction Bucket
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
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span>Course / Programme *</span>
                  {programme !== 'pg' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      🔒 Auto-derived
                    </span>
                  )}
                </label>
                <select
                  disabled={programme !== 'pg' || !isEditingReg || isEligible || !parseRollNumber(regRollNumber || rollNumber).isValid}
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value as any)}
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                >
                  <option value="btech_regular">B.Tech (Regular)</option>
                  <option value="btech_lateral">B.Tech (Lateral Entry)</option>
                  <option value="diploma">Diploma</option>
                  <option value="pg">Post Graduate (PG)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span>Academic Year *</span>
                  {programme !== 'pg' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      🔒 Auto-derived
                    </span>
                  )}
                </label>
                <select
                  disabled={programme !== 'pg' || !isEditingReg || isEligible || !parseRollNumber(regRollNumber || rollNumber).isValid}
                  value={academicYear}
                  onChange={(e) => setAcademicYear(Number(e.target.value))}
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span>Branch / Group *</span>
                  {programme !== 'pg' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      🔒 Auto-derived
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  disabled={programme !== 'pg' || !isEditingReg || isEligible || !parseRollNumber(regRollNumber || rollNumber).isValid}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value.toUpperCase())}
                  placeholder="e.g. CSE"
                  className="w-full rounded-md border px-2.5 py-1.5 text-xs shadow-sm uppercase bg-white dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                disabled={!isEditingReg || isEligible}
                value={regRollNumber}
                onChange={(e) => handleRegRollChange(e.target.value)}
                placeholder="e.g. 25811A0403, 25815A0403, or 24597-CM-015"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm uppercase disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
              />
              {regRollError && (
                <p className="text-[11px] text-destructive mt-1 font-medium">{regRollError}</p>
              )}
            </div>

            <div>
              <label htmlFor="base_price" className="block text-xs font-semibold mb-1">
                Auction Base Price (Points) *
              </label>
              <select
                id="base_price"
                required
                disabled={!isEditingReg || isEligible}
                value={basePrice}
                onChange={(e) => setBasePrice(Number(e.target.value) as BasePrice)}
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
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
                disabled={!isEditingReg || isEligible}
                value={cricheroesUrl}
                onChange={(e) => setCricheroesUrl(e.target.value)}
                placeholder="https://cricheroes.in/player-profile/..."
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            <div>
              <label htmlFor="cricheroes_mobile" className="block text-xs font-semibold mb-1">
                CricHeroes Registered Mobile (Private)
              </label>
              <input
                id="cricheroes_mobile"
                type="tel"
                disabled={!isEditingReg || isEligible}
                value={cricheroesMobile}
                onChange={(e) => setCricheroesMobile(e.target.value)}
                placeholder="10-digit mobile registered in CricHeroes"
                className="w-full rounded-md border px-3 py-2 text-sm shadow-sm disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            {/* CricHeroes Pending Flow (§5.2) */}
            <div className="sm:col-span-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isEditingReg || isEligible}
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
                  disabled={!isEditingReg || isEligible}
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
                    disabled={!isEditingReg || isEligible}
                    value={discrepancyNote}
                    onChange={(e) => setDiscrepancyNote(e.target.value)}
                    placeholder="Reason for discrepancy (e.g. Year-back in 2024, re-admitted to 2nd year)"
                    className="w-full rounded border px-2 py-1 text-xs bg-white dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </div>

            {/* ACC Reference Program (§5.2, §6, Case 24) */}
            <div className="sm:col-span-2 p-3 rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isEditingReg || isEligible}
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
                    disabled={!isEditingReg || isEligible}
                    value={referredFranchise}
                    onChange={(e) => setReferredFranchise(e.target.value)}
                    className="w-full rounded-md border px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed"
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

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            {!isEditingReg ? (
              !isEligible ? (
                <button
                  type="button"
                  onClick={handleStartEditReg}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>EDIT</span>
                </button>
              ) : null
            ) : (
              <>
                {initialData.registration && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCancelReg}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'SAVE'}
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {/* TAB 3: Skills Questionnaire Form */}
      {activeTab === 'skills' && (
        <form
          onSubmit={handleSaveSkills}
          className="rounded-lg border p-6 bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold">Player Skill Questionnaire</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Answer the skill questions to derive your authoritative player type for the auction.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-emerald-100 dark:bg-emerald-950 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Derived Role: {derivedRolePreview.replace('_', ' ').toUpperCase()}
              </div>
              {initialData.skillProfile && !isEditingSkills && !isEligible && (
                <button
                  type="button"
                  onClick={handleStartEditSkills}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>EDIT</span>
                </button>
              )}
            </div>
          </div>

          {initialData.skillProfile && !isEditingSkills && !isEligible && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
                <div>
                  <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Registration information saved
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Questionnaire is currently in read-only mode. Click EDIT to unlock and adjust your answers.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartEditSkills}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700 cursor-pointer"
              >
                <span>✏️</span>
                <span>EDIT</span>
              </button>
            </div>
          )}

          {/* Primary Skill Checkboxes */}
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-md bg-gray-50 dark:bg-gray-800/40 border">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isBatter}
                disabled={!isEditingSkills || isFielderOnly || isEligible}
                onChange={(e) => setIsBatter(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4 disabled:opacity-85 disabled:cursor-not-allowed"
              />
              Batter
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isBowler}
                disabled={!isEditingSkills || isFielderOnly || isEligible}
                onChange={(e) => setIsBowler(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4 disabled:opacity-85 disabled:cursor-not-allowed"
              />
              Bowler
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isWicketKeeper}
                disabled={!isEditingSkills || isFielderOnly || isEligible}
                onChange={(e) => setIsWicketKeeper(e.target.checked)}
                className="rounded text-emerald-600 h-4 w-4 disabled:opacity-85 disabled:cursor-not-allowed"
              />
              Wicket-Keeper
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isFielderOnly}
                disabled={!isEditingSkills || isEligible}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsFielderOnly(checked);
                  if (checked) {
                    setIsBatter(false);
                    setIsBowler(false);
                    setIsWicketKeeper(false);
                  }
                }}
                className="rounded text-emerald-600 h-4 w-4 disabled:opacity-85 disabled:cursor-not-allowed"
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
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setBattingArm(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                    >
                      <option value="right">Right-hand bat</option>
                      <option value="left">Left-hand bat</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Batting Style *</label>
                    <select
                      value={battingStyleCustom}
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setBattingStyleCustom(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setBattingOrderCustom(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setBowlingArm(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                    >
                      <option value="right">Right-arm</option>
                      <option value="left">Left-arm</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Bowling Type *</label>
                    <select
                      value={bowlingType}
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setBowlingType(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                        disabled={!isEditingSkills || isEligible}
                        onChange={(e) => setPaceVariety(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                        disabled={!isEditingSkills || isEligible}
                        onChange={(e) => setSpinVariety(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                          disabled={!isEditingSkills || isEligible}
                          checked={bowlingRoles.includes(role)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBowlingRoles([...bowlingRoles, role]);
                            } else {
                              setBowlingRoles(bowlingRoles.filter((r) => r !== role));
                            }
                          }}
                          className="rounded text-blue-600 h-3.5 w-3.5 disabled:opacity-85 disabled:cursor-not-allowed"
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
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setFieldingZone(e.target.value as any)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                    >
                      <option value="infield">Infield</option>
                      <option value="outfield">Outfield</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Preferred Position *</label>
                    <select
                      value={preferredFieldingPosition}
                      disabled={!isEditingSkills || isEligible}
                      onChange={(e) => setPreferredFieldingPosition(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                    disabled={!isEditingSkills || isEligible}
                    onChange={(e) => setHighestLevelPlayed(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                    disabled={!isEditingSkills || isEligible}
                    value={experienceYears}
                    onChange={(e) =>
                      setExperienceYears(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="e.g. 3"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Played Previous ACC Edition?</label>
                  <select
                    value={playedPreviousAcc ? 'yes' : 'no'}
                    disabled={!isEditingSkills || isEligible}
                    onChange={(e) => setPlayedPreviousAcc(e.target.value === 'yes')}
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                    disabled={!isEditingSkills || isEligible}
                    value={previousAccTeam}
                    onChange={(e) => setPreviousAccTeam(e.target.value)}
                    placeholder="e.g. Titans, Dominators"
                    className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Additional Notes / Highlights (Optional)
                </label>
                <textarea
                  rows={2}
                  disabled={!isEditingSkills || isEligible}
                  value={experienceDesc}
                  onChange={(e) => setExperienceDesc(e.target.value)}
                  placeholder="Mention awards, CricHeroes records, or match-winning performances..."
                  className="w-full rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 disabled:opacity-85 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/60"
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
                    disabled={!isEditingSkills || isEligible}
                    checked={confirmedFielderOnly}
                    onChange={(e) => setConfirmedFielderOnly(e.target.checked)}
                    className="rounded text-amber-600 h-4 w-4 disabled:opacity-85 disabled:cursor-not-allowed"
                  />
                  I explicitly confirm my registration as a Fielder only.
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            {!isEditingSkills ? (
              !isEligible ? (
                <button
                  type="button"
                  onClick={handleStartEditSkills}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>EDIT</span>
                </button>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <span>🔒</span>
                  <span>Locked for Auction</span>
                </span>
              )
            ) : (
              <>
                {initialData.skillProfile && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCancelSkills}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'SAVE'}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
