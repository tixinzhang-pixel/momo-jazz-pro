import type { StyleId } from './types.ts'
import {
  defaultSwingRatioR,
  ratioToBeatFraction,
  type SubdivisionMode,
} from './engine/dynamicsConfig.ts'

/**
 * Long-eighth share of the beat (fraction r/(r+1)).
 * 0.5 is straight (1:1), ~0.667 is triplet (2:1), ~0.737 is 2.8:1.
 * When `customRatioR` is provided (user moved the Swing slider, turning Auto off),
 * it converts `customRatioR` via r/(r+1); otherwise uses the per-style, per-tempo curve.
 */
export function swingRatio(
  bpm: number,
  style: StyleId,
  customRatioR: number | null = null,
  subdivision: SubdivisionMode = '8ths',
): number {
  const r = customRatioR != null ? customRatioR : defaultSwingRatioR(bpm, style, subdivision)
  return ratioToBeatFraction(r)
}

/**
 * One swing for the whole bar, with a slight deterministic breath (±0.06)
 * so 136 BPM does not sit on a single locked ratio. A slider override is exact.
 * Straight styles (bossa) do not breathe.
 */
export function barSwingFraction(
  bpm: number,
  style: StyleId,
  barIndex: number,
  chorus: number,
  customRatioR: number | null = null,
  subdivision: SubdivisionMode = '8ths',
): number {
  if (customRatioR != null || style === 'bossa') return swingRatio(bpm, style, customRatioR, subdivision)
  const r = defaultSwingRatioR(bpm, style, subdivision)
  const rng = mulberry32(hashString(`breath|${style}|${chorus}|${barIndex}`))
  const breathed = Math.min(3.5, Math.max(1, r + (rng() - 0.5) * 0.12))
  return ratioToBeatFraction(breathed)
}

/**
 * Resolve the effective long:short ratio r (1.0 to 3.5) for UI display and scheduling.
 */
export function effectiveSwingRatioR(
  bpm: number,
  style: StyleId,
  customRatioR: number | null = null,
  subdivision: SubdivisionMode = '8ths',
): number {
  return customRatioR != null ? Math.max(1.0, Math.min(3.5, customRatioR)) : defaultSwingRatioR(bpm, style, subdivision)
}

/** Offset of an eighth-note index (0..7) inside a 4/4 bar. Offbeats land at fraction `ratio` of the beat. */
export function eighthOffset(index: number, beatSec: number, ratio: number): number {
  const beat = Math.floor(index / 2)
  const off = index % 2 === 1
  const long = beatSec * ratio
  return beat * beatSec + (off ? long : 0)
}

/**
 * Offset of a fractional beat position (e.g. 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5) with swing applied to off-beats.
 */
export function swungBeatOffset(beatPos: number, beatSec: number, ratio: number): number {
  const wholeBeat = Math.floor(beatPos + 1e-6)
  const frac = beatPos - wholeBeat
  if (Math.abs(frac - 0.5) < 0.08) {
    return wholeBeat * beatSec + beatSec * ratio
  }
  if (Math.abs(frac) < 0.05) {
    return wholeBeat * beatSec
  }
  return beatPos * beatSec
}

/**
 * Offset of a 16th-note index (0..15) inside a 4/4 bar.
 * When `eighthRatio` is provided, 8th note boundaries maintain swing.
 * `subRatio` divides each 8th note duration (default 0.5 = straight 16ths).
 */
export function sixteenthOffset(
  index: number,
  beatSec: number,
  subRatio = 0.5,
  eighthRatio = 0.5,
): number {
  const beatIndex = Math.floor(index / 4)
  const inBeat = index % 4
  const long8th = beatSec * eighthRatio
  const short8th = beatSec * (1 - eighthRatio)

  if (inBeat === 0) {
    return beatIndex * beatSec
  } else if (inBeat === 1) {
    return beatIndex * beatSec + long8th * subRatio
  } else if (inBeat === 2) {
    return beatIndex * beatSec + long8th
  } else {
    return beatIndex * beatSec + long8th + short8th * subRatio
  }
}

export type Pocket = 'ride' | 'hat' | 'kick' | 'snare' | 'ghost' | 'bass' | 'piano' | 'guitar' | 'click' | 'brush'

/**
 * One pocket, shared swing grid.
 * Ride sits 4 ms behind the beat. Bass is scheduled 14 ms early so that,
 * after FluidR3's ~8 ms speech, the note is heard about 10 ms before the ride.
 * Snare matches the ride's "&" (+4 ms). Piano is about +6 ms.
 * Jitter amplitude 12 ms through the 3-uniform shaper is a standard deviation of about 4 ms.
 */
const POCKET: Record<Pocket, { bias: number; jitter: number }> = {
  ride: { bias: 0.004, jitter: 0.012 },
  hat: { bias: 0.002, jitter: 0.009 },
  kick: { bias: 0.004, jitter: 0.01 },
  snare: { bias: 0.004, jitter: 0.012 },
  ghost: { bias: 0.008, jitter: 0.014 },
  bass: { bias: -0.014, jitter: 0.012 },
  piano: { bias: 0.006, jitter: 0.012 },
  guitar: { bias: 0.008, jitter: 0.012 },
  click: { bias: 0, jitter: 0 },
  brush: { bias: 0.002, jitter: 0.01 },
}

export function pocketBias(pocket: Pocket): number {
  return POCKET[pocket].bias
}

export function place(time: number, pocket: Pocket, rng: () => number, humanize: boolean): number {
  const p = POCKET[pocket]
  let t = time + p.bias
  if (humanize) {
    const n = (rng() + rng() + rng() - 1.5) / 1.5
    t += n * p.jitter
  }
  return t
}

export function humanVelocity(base: number, rng: () => number, humanize: boolean): number {
  const j = humanize ? (rng() - 0.5) * 0.08 : 0
  return Math.min(1, Math.max(0.04, base + j))
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
