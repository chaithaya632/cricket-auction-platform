// =============================================================================
// ACC Auction Portal — Client Audio Synthesis: Web Audio Gavel & Chime
// =============================================================================
// Synthesizes a crisp auction-style gavel chime using Web Audio API oscillators.
// - Zero external network requests / zero audio file dependencies.
// - Deduplicated by (lotId, price) to ensure multiple broadcasts never double-fire.
// - Respects browser autoplay policy with explicit user interaction unlock.
// - Provides client-side toggle with localStorage persistence.
// =============================================================================

let audioCtx: AudioContext | null = null;
let lastPlayedKey: string | null = null;

const STORAGE_KEY = 'acc_auction_sound_enabled';

/**
 * Checks whether auction chime audio is currently enabled.
 * Defaults to true.
 */
export function getAudioEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch {
    // LocalStorage access restricted (e.g. incognito/iframe)
  }
  return true;
}

/**
 * Toggles or sets audio chime enablement.
 */
export function setAudioEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // LocalStorage access restricted
  }
}

/**
 * Unlocks the Web Audio Context upon user interaction (click / keydown).
 * Necessary to comply with modern browser autoplay restrictions.
 */
export function unlockAudioContext(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  } catch {
    // Non-fatal if audio context cannot be initialized
  }
}

/**
 * Synthesizes and plays a distinctive auction gavel strike chime.
 * Deduplicates strikes for the same lot + price.
 * Returns true if the chime was scheduled/played, false if muted or deduplicated.
 */
export function playBidGavelChime(lotId?: string | null, price?: number | null): boolean {
  if (!getAudioEnabled()) return false;
  if (typeof window === 'undefined') return false;

  // Deduplication guard: do not re-strike for the same lot and price
  if (lotId && price !== undefined && price !== null) {
    const dedupeKey = `${lotId}:${price}`;
    if (lastPlayedKey === dedupeKey) {
      return false;
    }
    lastPlayedKey = dedupeKey;
  }

  try {
    unlockAudioContext();
    if (!audioCtx || audioCtx.state !== 'running') return true;

    const now = audioCtx.currentTime;

    // Harmonic 1: Primary gavel strike resonance (triangle, decaying pitch)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.exponentialRampToValueAtTime(329.63, now + 0.12); // E4 body

    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    // Harmonic 2: Metallic gavel ring / bell chime (sine, high overtone)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now); // B5 overtone
    osc2.frequency.exponentialRampToValueAtTime(493.88, now + 0.18);

    gain2.gain.setValueAtTime(0.2, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.36);
  } catch {
    // Non-fatal if audio playback fails
  }

  return true;
}

export const playGavelChime = playBidGavelChime;

/**
 * Synthesizes a deep, authoritative wooden auction hammer strike sound.
 * For 'sold': deep resonant gavel knock followed by gold chime ringing.
 * For 'unsold': sharp, decisive single gavel strike.
 */
export function playHammerStrikeSound(
  status: 'sold' | 'unsold',
  lotId?: string | null
): boolean {
  if (!getAudioEnabled()) return false;
  if (typeof window === 'undefined') return false;

  if (lotId) {
    const dedupeKey = `hammer:${lotId}:${status}`;
    if (lastPlayedKey === dedupeKey) return false;
    lastPlayedKey = dedupeKey;
  }

  try {
    unlockAudioContext();
    if (!audioCtx || audioCtx.state !== 'running') return true;

    const now = audioCtx.currentTime;

    // Gavel Head Impact (low frequency square/triangle click)
    const impactOsc = audioCtx.createOscillator();
    const impactGain = audioCtx.createGain();

    impactOsc.type = 'triangle';
    impactOsc.frequency.setValueAtTime(220, now);
    impactOsc.frequency.exponentialRampToValueAtTime(55, now + 0.08);

    impactGain.gain.setValueAtTime(0.4, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    impactOsc.connect(impactGain);
    impactGain.connect(audioCtx.destination);

    impactOsc.start(now);
    impactOsc.stop(now + 0.26);

    if (status === 'sold') {
      const ringOsc = audioCtx.createOscillator();
      const ringGain = audioCtx.createGain();

      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(880, now + 0.04);
      ringOsc.frequency.exponentialRampToValueAtTime(440, now + 0.4);

      ringGain.gain.setValueAtTime(0.25, now + 0.04);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      ringOsc.connect(ringGain);
      ringGain.connect(audioCtx.destination);

      ringOsc.start(now + 0.04);
      ringOsc.stop(now + 0.52);
    }
  } catch {
    // Non-fatal if audio fails
  }

  return true;
}

export function resetAudioDeduplicationForTests(): void {
  lastPlayedKey = null;
}
