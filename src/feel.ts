import type { StyleId } from './types.ts'

/** Long-eighth share of the beat. 0.5 is straight, 0.67 is a triplet. Bossa stays straight. */
export function swingRatio(bpm: number, style: StyleId): number {
  if (style === 'bossa') return 0.5
  const anchors: [number, number][] = [
    [40, 0.7],
    [60, 0.68],
    [100, 0.64],
    [140, 0.6],
    [180, 0.555],
    [220, 0.53],
    [280, 0.51],
  ]
  if (bpm <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [b0, r0] = anchors[i - 1]
    const [b1, r1] = anchors[i]
    if (bpm <= b1) {
      const t = (bpm - b0) / (b1 - b0)
      return r0 + (r1 - r0) * t
    }
  }
  return anchors[anchors.length - 1][1]
}

/** Offset of an eighth-note index inside a 4/4 bar. Offbeats land late when ratio > 0.5. */
export function eighthOffset(index: number, beatSec: number, ratio: number): number {
  const beat = Math.floor(index / 2)
  const off = index % 2 === 1
  const long = beatSec * ratio
  return beat * beatSec + (off ? long : 0)
}

export function sixteenthOffset(index: number, beatSec: number): number {
  return index * (beatSec / 4)
}

export type Pocket = 'ride' | 'hat' | 'kick' | 'snare' | 'ghost' | 'bass' | 'piano' | 'guitar' | 'click' | 'brush'

const POCKET: Record<Pocket, { bias: number; jitter: number }> = {
  ride: { bias: -0.006, jitter: 0.003 },
  hat: { bias: 0, jitter: 0.002 },
  kick: { bias: 0.004, jitter: 0.0035 },
  snare: { bias: 0.01, jitter: 0.005 },
  ghost: { bias: 0.012, jitter: 0.006 },
  bass: { bias: -0.004, jitter: 0.004 },
  piano: { bias: 0.014, jitter: 0.005 },
  guitar: { bias: 0.008, jitter: 0.004 },
  click: { bias: 0, jitter: 0 },
  brush: { bias: 0.002, jitter: 0.004 },
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
