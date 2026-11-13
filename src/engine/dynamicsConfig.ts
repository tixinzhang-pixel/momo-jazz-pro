/**
 * Momo Jazz Pro v0.3.1 — Rhythm-section dynamics and swing feel configuration.
 *
 * All numbers below come from two reference recordings of "So What"
 * (stems split with demucs; per-bar and per-beat band energies, referred to as
 * "So What ref A" [136-139 BPM] and "So What ref B" [180 BPM]) and from our
 * v0.1/v0.2/v0.3 QA renders measured the same way.
 *
 * Miles can tune any value here without touching arrangement or audio engine logic.
 */

import type { StyleId } from '../types.ts'

export type PlayingMode = 'HEAD' | 'SOLO'
export type FillsMode = 'section' | 'every4' | 'off'
export type SubdivisionMode = '8ths' | '16th-swing' | '16th-straight'

export interface SwingCurvePoint {
  bpm: number
  ratio: number
}

export const DYNAMICS_CONFIG = {
  /**
   * A1. Two playing modes: HEAD and SOLO
   * - HEAD applies to chorus 1, and to the last chorus whenever repeats >= 2
   *   (a 2-chorus loop is head + out-head, so the theme plays on both).
   * - SOLO applies to all other choruses.
   */
  modes: {
    head: {
      /** Ride band about 8 dB below its SOLO level (So What ref A/B measured 8-11 dB lower). */
      rideDbOffset: -8.0,
      /** Hi-hat foot / timekeeping prominence in HEAD (dB relative to normal hat). */
      hatDbOffset: 1.5,
      /** Snare comping at its base level (0 dB reference), sparse: about 2-2.5 hits per bar (So What ref A/B). */
      snareCompDbOffset: 0.0,
      /** Head drum bus, +1.5 dB vs the v0.3.1 offset of -4.5 so SOLO−HEAD can land in +3..+6. */
      drumBusDbOffset: -3.0,
      /** Whether ride is light/sparse in HEAD (timekeeping mostly hi-hat on 2 & 4 + a real ride pulse). */
      sparseRide: true,
      /** Extra dB on HEAD ride strokes so the ride stem is audible under the hat. */
      rideVelocityBoostDb: 0.4,
      /**
       * Theme fills, on top of the setup table. Tuned with the unclamped setup gain
       * so head fills at bars 24/32 sit about 8 dB under the v0.3 renders.
       */
      headFillDbAttenuation: -7.0,
    },
    solo: {
      /** Solo ride sits above the head pattern so the ride band can land 2–3 dB under the snare. */
      rideDbOffset: 5.2,
      hatDbOffset: 0.0,
      /** Snare comping steps up per soloist block (see A2): +5 dB in block 1 up to +15 dB at peak vs HEAD (So What ref A/B). */
      snareCompBlock1Db: 5.0,
      snareCompPeakDb: 15.0,
      /**
       * Extra solo drum-bus trim against the v0.3.1 anchor (−4.5 + block curve).
       * About −2 dB, so drums sit near −3 dB under bass in solo choruses.
       */
      drumBusDbOffset: -5.0,
    },
  },

  /**
   * A2. Intensity steps per soloist block (Auto mode)
   * - Group SOLO choruses into blocks of 2 choruses ("one soloist").
   * - Inside a block, 2nd chorus is +2 to +4 dB on ride and snare comping vs 1st.
   * - Start of next block drops back 2-3 dB from previous block's peak.
   * - Peak drum-bus level capped at about +6 dB over HEAD.
   * - Final chorus (out-head) returns to HEAD level, and goes 1-2 dB lower for the last 4 bars before ending chord.
   */
  blocks: {
    chorusesPerBlock: 2,
    secondChorusRideDb: 1.6,
    secondChorusSnareDb: 2.5,
    secondChorusDrumBusDb: 1.8,
    /** Start of next block drops 2.2 dB from previous block's peak (spec A2: 2-3 dB drop). */
    newBlockDropDb: -3.6,
    /** Net step per new block over previous block start: +1.2 dB (spec A2: 1-2 dB). */
    newBlockStepDb: 1.2,
    newBlockSnareStepDb: 3.0,
    /** Peak drum-bus level over HEAD cap. */
    maxDrumBusOverHeadDb: 6.0,
    /** Out-head last 4 bars settle 1.5 dB lower before the ending chord. */
    outHeadLast4BarsDb: -1.5,
    /** Optional "quiet soloist" block for piano solo in trading: drums -6 dB, snare -15 dB, ride -4 dB (spec A2). */
    quietSoloist: {
      drumBusDb: -6.0,
      snareCompDb: -15.0,
      rideDb: -4.0,
    },
    /** Fixed modes (light / medium / heavy) block levels relative to HEAD. */
    fixedModeOverHeadDb: {
      low: 0.0,
      med: 3.0,
      high: 6.0,
    },
  },

  /**
   * A3. Fills, setups and crashes at section boundaries (within a 32-bar chorus or scaled phrase positions)
   * Measured from So What ref A & ref B.
   */
  sections: {
    /** Bars 2-15 quietest part of chorus (So What ref A/B: snare -4 to -11 dB vs chorus mean). */
    earlyBarsQuietSnareDb: -5.5,
    earlyBarsQuietDrumBusDb: -1.0,
    /** Bar 8 (end of A1): light setup only in beats 3-4: drum bus +1-2 dB (So What ref A/B). */
    bar8Setup: {
      drumBusDb: 1.0,
      snareDb: 1.5,
      kickDb: 1.0,
    },
    /** Bar 16: medium setup. Snare stays near +6 dB; kick/tom contribution is pulled down so the drum bar is near +3. */
    bar16Setup: {
      drumBusDb: 0.6,
      snareDb: 5.2,
      kickDb: 0.2,
    },
    /**
     * Bars 24 and 32. These dB values are applied as a separate gain (not velocity
     * clamped at 1), so kick can come down and snare can come up independently.
     */
    strongSetup: {
      drumBusDb: 2.2,
      snareDb: 18,
      kickDb: -1.4,
    },
    /** Bridge lift (bars 17-24 / B section): +1-3 dB on drum bus, slightly denser comping (So What ref A/B). */
    bridgeLift: {
      drumBusDb: 2.0,
      compDensityMultiplier: 1.25,
    },
    /**
     * Crash rules (So What ref A/B):
     * - Beat 1 of bar 1 when a new soloist block or trading block starts: +4-6 dB over normal ride stroke.
     * - May be anticipated on 4& of previous bar.
     * - Light crash/ride accents on first beat of sections (bars 9, 17, 25) at +2-4 dB on ride, mainly at fast tempos (>= 170 BPM; ref B).
     */
    crash: {
      newBlockCrashDbOverRide: 5.0,
      anticipateProbability: 0.35,
      sectionAccentDbOverRide: 3.0,
      sectionAccentFastBpmThreshold: 170,
    },
  },

  /**
   * A4. Balance and drum-kit voicing
   * Measured on So What ref A/B and v0.1/v0.2 demos.
   */
  voicing: {
    /** Default drum bus linear gain in mixer/graph to hit ~3 dB below bass. */
    defaultDrumBusGain: 0.48,
    /**
     * Ride vs snare (5-12 kHz ride band vs 150-400 Hz snare band):
     * Default ride fader is 0.80 so the solo ride band can sit near the snare band.
     */
    defaultRideFaderGain: 0.8,
    rideExtraAttenuationDb: -3.0,
    /** Gentle high shelf on ride to darken bright samples: -2.5 dB above 6000 Hz (spec A4: -2 to -3 dB above ~6 kHz). */
    rideHighShelfHz: 6000,
    rideHighShelfDb: -2.5,
    /**
     * Ride pattern dynamics (So What ref A/B):
     * - Quarter notes are 7-9 dB louder than skip note ("&" after 2 and 4) at medium tempos.
     * - Above 180 BPM the skip note is 11-15 dB below quarter notes.
     * - Beats 2 and 4 are about 1.5 dB louder than beats 1 and 3.
     * - Humanize velocity +-1-2 dB.
     */
    ridePattern: {
      quarterBaseVel: 0.72,
      beats2And4BoostDb: 1.5,
      skipNoteAttenuationMedBpmDb: -8.0,
      skipNoteAttenuationFastBpmDb: -13.0,
      fastBpmThreshold: 180,
      humanizeVelDb: 1.5,
    },
    /** Hi-hat foot on 2 and 4: subtle level, not above ride quarter notes (So What ref A/B). */
    hatPedal: {
      beat2Vel: 0.46,
      beat4Vel: 0.52,
    },
    /**
     * Snare comping density (So What ref A/B):
     * - Medium tempo (<= 160 BPM): 2-3 hits/bar in SOLO, ~2-2.5 in HEAD.
     * - Fast tempo (> 160 BPM): 3-3.5 hits/bar in SOLO.
     * - Ghost notes stay well below comping accents.
     */
    snareComping: {
      fastTempoThresholdBpm: 160,
      headHitsPerBar: 2.25,
      soloMedHitsPerBar: 2.5,
      soloFastHitsPerBar: 3.25,
      accentBaseVel: 0.54,
      ghostNoteAttenuationDb: -10.0,
    },
    /**
     * Kick feathering: very low (about -14 dB relative to drum bus in So What ref A/B).
     * Used mostly for accents in setups (A3).
     */
    kick: {
      featherBaseVel: 0.14,
      setupAccentBaseVel: 0.68,
    },
  },

  /**
   * A5. Bass
   * - Flat across the whole tune: max +-2 dB between HEAD and SOLO peak (So What ref A: +-2 dB, ref B: +-0.5 dB).
   * - Remove v0.2 beat-1 emphasis: all 4 beats within ~3 dB of each other with no systematic beat-1 accent.
   * - Walking 4 notes/bar base, occasional skip or ghost notes.
   */
  bass: {
    headToSoloMaxDiffDb: 1.0,
    baseVelocity: 0.78,
    randomBeatVariationDb: 1.2,
    skipNoteProbability: 0.08,
    skipNoteAttenuationDb: -7.0,
  },

  /**
   * A6. Piano comping
   * - Level follows block intensity at reduced dB change of drums (spec: ~2 dB solo-head).
   * - Clearly audible under drums.
   */
  piano: {
    soloHitsPerBar: 3.0,
    headHitsPerBar: 1.75,
    blockIntensityFollowRatio: 0.12,
    /** Extra SOLO comp trim so piano solo−head lands near +2 dB once the attack count is included. */
    soloTrimDb: -0.5,
    baseVelocity: 0.74,
    defaultMixerGain: 0.82,
  },

  /**
   * A7. Trading
   * - During user's bars, drums drop ~6 dB overall, ride drops ~4 dB, snare drops ~15 dB, bass normal (0 dB).
   */
  trading: {
    userTurnOverallDb: -5.0,
    userTurnSnareDb: -14.5,
    userTurnRideDb: 1.0,
    userTurnBassDb: 0.0,
    userTurnPianoDb: -5.0,
  },

  /**
   * A8. Tempo
   * - Steady by default. Optional "push in solos" of +1.5% (So What ref A ran 2-3% faster in solos). Off by default.
   */
  tempo: {
    pushInSolosDefault: false,
    pushInSolosRatio: 1.015,
  },

  /**
   * Scope B. Swing controls and per-style default curves.
   * PROVISIONAL, pending Dean review.
   * Swing ratio r = long:short duration of a swung pair. Off-beat sits at fraction r/(r+1) of the beat.
   */
  swing: {
    sliderMin: 1.0,
    sliderMax: 3.5,
    sliderStep: 0.05,
    referenceMarks: [
      { ratio: 1.0, label: '1:1 Bossa / 平八分' },
      { ratio: 1.7, label: '1.7:1 现代快 Swing' },
      { ratio: 2.0, label: '2:1 三连音' },
      { ratio: 2.8, label: '2.8:1 Kind of Blue 深摇摆' },
    ],
    /**
     * Per-style default curves (BPM -> long:short ratio r).
     * PROVISIONAL, pending Dean review.
     * Measured: So What ref A 2.3-2.9 @ 136-139 BPM, ref B 1.3-1.45 @ 180 BPM.
     */
    styleCurves: {
      swing: [
        { bpm: 140, ratio: 2.6 },
        { bpm: 180, ratio: 1.5 },
        { bpm: 220, ratio: 1.2 },
        { bpm: 260, ratio: 1.1 },
      ],
      up: [
        { bpm: 140, ratio: 2.6 },
        { bpm: 180, ratio: 1.5 },
        { bpm: 220, ratio: 1.2 },
        { bpm: 260, ratio: 1.1 },
      ],
      ballad: [
        { bpm: 90, ratio: 2.2 },
        { bpm: 120, ratio: 2.0 },
        { bpm: 180, ratio: 1.5 },
      ],
      shuffle: [
        { bpm: 140, ratio: 2.0 },
        { bpm: 200, ratio: 1.6 },
        { bpm: 240, ratio: 1.3 },
      ],
      bossa: [
        { bpm: 60, ratio: 1.0 },
        { bpm: 260, ratio: 1.0 },
      ],
      funk: [
        { bpm: 60, ratio: 1.0 },
        { bpm: 260, ratio: 1.0 },
      ],
      bounce: [
        { bpm: 60, ratio: 1.5 },
        { bpm: 200, ratio: 1.5 },
      ],
    } satisfies Record<StyleId | 'funk' | 'bounce', SwingCurvePoint[]>,
    /** Default ratio when 16th-swing / bounce subdivision is selected on an 8th style. */
    sixteenthBounceRatio: 1.5,
  },
} as const

/** Convert a dB offset to a linear amplitude multiplier. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

/** Convert a linear amplitude multiplier to dB. */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(1e-6, gain))
}

/**
 * Convert long:short swing ratio r (e.g. 2.0 for 2:1 triplet) to beat fraction r/(r+1) (e.g. 0.667).
 */
export function ratioToBeatFraction(r: number): number {
  const clamped = Math.max(1.0, Math.min(3.5, r))
  return clamped / (clamped + 1)
}

/**
 * Interpolate the provisional per-style default swing ratio r (1.0 to 3.5) at a given BPM.
 * Note: 8th swing ratio is independent of subdivision mode.
 */
export function defaultSwingRatioR(
  bpm: number,
  style: StyleId,
  subdivision: SubdivisionMode = '8ths',
): number {
  if (subdivision === '16th-swing' && style === 'bossa') return DYNAMICS_CONFIG.swing.sixteenthBounceRatio
  const points = DYNAMICS_CONFIG.swing.styleCurves[style] ?? DYNAMICS_CONFIG.swing.styleCurves.swing
  if (bpm <= points[0].bpm) return points[0].ratio
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    if (bpm <= p1.bpm) {
      const t = (bpm - p0.bpm) / Math.max(1, p1.bpm - p0.bpm)
      return p0.ratio + (p1.ratio - p0.ratio) * t
    }
  }
  return points[points.length - 1].ratio
}
