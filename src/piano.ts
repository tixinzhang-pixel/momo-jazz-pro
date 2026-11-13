import { DYNAMICS_CONFIG, dbToGain } from './engine/dynamicsConfig.ts'
import { pocketBias, swungBeatOffset } from './feel.ts'
import { guideIntervals, mod } from './theory.ts'
import type { ChordModel, Hit } from './types.ts'

/**
 * Two-hand comping and the So What answer.
 * More than the 13 cells in the v3 note: extra two-hand cells, weighted higher,
 * so both-hands events are not stuck at 16%.
 */

type Hand = 'L' | 'R' | 'B'
type Kind = 'ghost' | 'stab' | 'short' | 'held' | 'long'
interface Cell {
  name: string
  tier: 'low' | 'mid' | 'high'
  events: { pos: number; hand: Hand; kind: Kind }[]
}

export const COMP_CELLS: Cell[] = [
  { name: 'lh_pad', tier: 'low', events: [{ pos: 0, hand: 'L', kind: 'long' }] },
  { name: 'rh_ant', tier: 'low', events: [{ pos: 3.5, hand: 'R', kind: 'held' }] },
  { name: 'pad_ans', tier: 'low', events: [{ pos: 0, hand: 'L', kind: 'held' }, { pos: 2.5, hand: 'R', kind: 'short' }] },
  { name: 'space', tier: 'low', events: [] },
  { name: 'ghost_ans', tier: 'low', events: [{ pos: 1.5, hand: 'R', kind: 'short' }, { pos: 2, hand: 'L', kind: 'ghost' }] },
  { name: 'charleston', tier: 'mid', events: [{ pos: 0, hand: 'B', kind: 'held' }, { pos: 1.5, hand: 'R', kind: 'stab' }] },
  { name: 'pad_2and4and', tier: 'mid', events: [{ pos: 0, hand: 'L', kind: 'held' }, { pos: 1.5, hand: 'R', kind: 'stab' }, { pos: 3.5, hand: 'R', kind: 'short' }] },
  { name: 'call_resp', tier: 'mid', events: [{ pos: 0.5, hand: 'R', kind: 'short' }, { pos: 2, hand: 'L', kind: 'short' }, { pos: 2.5, hand: 'R', kind: 'stab' }] },
  { name: 'lh_ant', tier: 'mid', events: [{ pos: 1.5, hand: 'L', kind: 'held' }, { pos: 2.5, hand: 'R', kind: 'stab' }, { pos: 3.5, hand: 'R', kind: 'ghost' }] },
  { name: 'both_ant', tier: 'mid', events: [{ pos: 1.5, hand: 'B', kind: 'stab' }, { pos: 2, hand: 'L', kind: 'ghost' }] },
  { name: 'push', tier: 'high', events: [{ pos: 0, hand: 'L', kind: 'held' }, { pos: 0.5, hand: 'R', kind: 'stab' }, { pos: 1.5, hand: 'R', kind: 'stab' }, { pos: 3.5, hand: 'B', kind: 'held' }] },
  { name: 'answer_run', tier: 'high', events: [{ pos: 1.5, hand: 'R', kind: 'stab' }, { pos: 2.5, hand: 'L', kind: 'short' }, { pos: 3.5, hand: 'R', kind: 'stab' }] },
  { name: 'kick_in', tier: 'high', events: [{ pos: 0, hand: 'B', kind: 'short' }, { pos: 1.5, hand: 'R', kind: 'stab' }, { pos: 2, hand: 'L', kind: 'ghost' }, { pos: 3.5, hand: 'B', kind: 'held' }] },
  { name: 'shell_stab', tier: 'mid', events: [{ pos: 0, hand: 'B', kind: 'short' }, { pos: 2.5, hand: 'R', kind: 'stab' }] },
  { name: 'lock_ands', tier: 'mid', events: [{ pos: 1.5, hand: 'B', kind: 'stab' }, { pos: 3.5, hand: 'B', kind: 'short' }] },
  { name: 'question', tier: 'mid', events: [{ pos: 0, hand: 'L', kind: 'held' }, { pos: 1.5, hand: 'B', kind: 'stab' }] },
  { name: 'answer_both', tier: 'high', events: [{ pos: 2, hand: 'L', kind: 'short' }, { pos: 2.5, hand: 'B', kind: 'stab' }, { pos: 3.5, hand: 'R', kind: 'ghost' }] },
  { name: 'walk_up', tier: 'high', events: [{ pos: 0.5, hand: 'R', kind: 'short' }, { pos: 1.5, hand: 'B', kind: 'stab' }, { pos: 3.5, hand: 'R', kind: 'held' }] },
]

const LH_SOWHAT = [
  [48, 53],
  [50, 55],
  [52, 57],
  [53, 60],
  [48, 53, 57],
  [45, 50, 55],
]
const RH_SOWHAT = [
  [60, 65, 69],
  [62, 67, 72],
  [64, 69, 74],
  [57, 62, 67],
  [59, 64, 69],
  [62, 67, 71],
  [65, 69, 74],
  [67, 72],
  [69, 74],
  [64, 69],
]

const PHRASE8 = [0.3, 0.42, 0.55, 0.72, 0.58, 0.44, 0.62, 0.86]

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function intensity(bar: number, bridge: boolean): number {
  let i = PHRASE8[bar % 8] ?? 0.5
  if (bridge) i += 0.1
  if (bar < 4) i -= 0.08
  i += 0.06 * clamp((bar % 4) - 1.5, -1, 1) * 0.4
  return clamp(i, 0.1, 1)
}

function placePc(pc: number, lo: number, hi: number, around: number): number {
  let best = lo
  let bestD = 99
  for (let midi = lo; midi <= hi; midi++) {
    if (mod(midi) !== mod(pc)) continue
    const d = Math.abs(midi - around)
    if (d < bestD) {
      bestD = d
      best = midi
    }
  }
  return best
}

function voicing(
  soWhat: boolean,
  semitone: number,
  chord: ChordModel,
  i: number,
  lhIndex: number,
  lastTop: number,
  rng: () => number,
): { lh: number[]; rh: number[]; lhIndex: number; top: number } {
  let lh: number[]
  let nextLh = lhIndex
  if (soWhat) {
    if (rng() < 0.6) nextLh = Math.floor(rng() * LH_SOWHAT.length)
    lh = (LH_SOWHAT[nextLh] ?? LH_SOWHAT[0]).map((n) => n + semitone)
  } else {
    const [third, seventh] = guideIntervals(chord.kind)
    const around = 53 + 4 * i
    lh = [placePc(chord.root + third, 48, 60, around), placePc(chord.root + seventh, 48, 60, around + 3)]
    lh = [...new Set(lh)].sort((a, b) => a - b)
  }
  const lhMax = lh[lh.length - 1] ?? 55
  const target = (soWhat ? 66 : 68) + Math.round(8 * i) + gauss(rng) * 1.5
  const pool = soWhat
    ? RH_SOWHAT.map((notes) => notes.map((n) => n + semitone)).filter((notes) => notes[0] > lhMax)
    : upperStructures(chord).filter((notes) => notes[0] > lhMax)
  const choices = pool.length ? pool : [[lhMax + 3, lhMax + 7, lhMax + 12]]
  let best = choices[0]
  let bestCost = 1e9
  for (const notes of choices) {
    const top = notes[notes.length - 1] ?? 0
    const same = top === lastTop ? 3 : 0
    const cost = Math.abs(top - target) + 0.3 * Math.abs(top - lastTop) + same + rng() * 2.5
    if (cost < bestCost) {
      bestCost = cost
      best = notes
    }
  }
  return { lh, rh: best, lhIndex: nextLh, top: best[best.length - 1] ?? lastTop }
}

function upperStructures(chord: ChordModel): number[][] {
  const pcs = [7, 14, 21, 4, 10].map((iv) => mod(chord.root + iv))
  const out: number[][] = []
  for (let a = 0; a < pcs.length; a++) {
    for (let b = a + 1; b < pcs.length; b++) {
      const lo = placePc(pcs[a], 57, 76, 64)
      const hi = placePc(pcs[b], 57, 76, 70)
      if (hi > lo) out.push([lo, hi])
    }
  }
  return out
}

function holdBeats(kind: Kind, hand: Hand, rng: () => number): number {
  const span =
    kind === 'ghost'
      ? [0.14, 0.24]
      : kind === 'stab'
        ? [0.2, 0.34]
        : kind === 'short'
          ? [0.4, 0.62]
          : kind === 'long'
            ? [2.6, 3.6]
            : hand === 'L'
              ? [1.7, 2.8]
              : [1.0, 1.8]
  return span[0] + rng() * (span[1] - span[0])
}

function eventVelocity(pos: number, hand: Hand, kind: Kind, i: number, rng: () => number): number {
  if (kind === 'ghost') return clamp(Math.round(38 + gauss(rng) * 3), 30, 46)
  let vel = 46 + 34 * i
  if (pos === 1.5 || pos === 3.5) vel += 12
  else if (pos === 0.5 || pos === 2.5) vel += 5
  else if (pos === 0) vel -= 6
  if (hand === 'L') vel -= kind === 'held' || kind === 'long' ? 7 : 3
  vel += gauss(rng) * 3
  return clamp(Math.round(vel), 30, 112)
}

interface Built {
  hits: Hit[]
  name: string
  anticipates: boolean
  lhIndex: number
  top: number
  drift: number
}

function buildBar(o: {
  bar: number
  beatSec: number
  ratio: number
  bridge: boolean
  soWhat: boolean
  semitone: number
  chord: ChordModel
  userTurn: boolean
  prevName: string
  anticipates: boolean
  drift: number
  lhIndex: number
  lastTop: number
  rng: () => number
}): Built {
  const i = intensity(o.bar, o.bridge)
  const cap = DYNAMICS_CONFIG.piano.soloHitsPerBar
  let cells = COMP_CELLS
  if (o.userTurn) cells = COMP_CELLS.filter((cell) => ['rh_ant', 'ghost_ans', 'lh_pad'].includes(cell.name))
  const weights = cells.map((cell) => {
    if (cell.name === o.prevName) return 0
    if (cell.name === 'space' && !o.anticipates) return 0
    const base = cell.tier === 'low' ? Math.max(0.05, 1.2 - 1.6 * i) : cell.tier === 'high' ? Math.max(0.02, 2 * i - 0.9) : 0.9
    return cell.events.some((event) => event.hand === 'B') ? base * 2.6 : base
  })
  const sum = weights.reduce((s, w) => s + w, 0) || 1
  let pick = o.rng() * sum
  let cell = cells[0]
  for (let n = 0; n < cells.length; n++) {
    pick -= weights[n] ?? 0
    if (pick <= 0) {
      cell = cells[n]
      break
    }
  }
  let events = cell.events.slice()
  if (o.anticipates) events = events.filter((event) => !(event.pos === 0 && event.hand !== 'L'))
  if (o.userTurn) events = events.slice(0, 1)
  else if (cap < 2.5) events = events.slice(0, Math.max(1, Math.ceil(cap)))

  const voice = voicing(o.soWhat, o.semitone, o.chord, i, o.lhIndex, o.lastTop, o.rng)
  let drift = o.drift
  const hits: Hit[] = []
  const soloTrim = dbToGain(DYNAMICS_CONFIG.piano.soloTrimDb)
  for (const event of events) {
    drift = 0.85 * drift + gauss(o.rng) * 0.0012
    const jitter = clamp(gauss(o.rng) * 0.003, -0.006, 0.006)
    const grid = swungBeatOffset(event.pos, o.beatSec, o.ratio)
    let lhShift = 0
    if (event.hand === 'B') {
      const roll = o.rng()
      if (roll < 0.4) lhShift = -(0.01 + o.rng() * 0.015)
      else if (roll < 0.8) lhShift = (o.rng() - 0.5) * 0.004
      else lhShift = 0.005 + o.rng() * 0.007
    }
    const hands: { hand: 'L' | 'R'; shift: number; notes: number[] }[] =
      event.hand === 'B'
        ? [
            { hand: 'L', shift: lhShift, notes: voice.lh },
            { hand: 'R', shift: 0, notes: voice.rh },
          ]
        : [{ hand: event.hand, shift: 0, notes: event.hand === 'L' ? voice.lh : voice.rh }]
    for (const side of hands) {
      const rollMs = (side.hand === 'R' ? 0.002 + o.rng() * 0.006 : o.rng() * 0.004)
      const vel = eventVelocity(event.pos, side.hand, event.kind, i, o.rng) + (o.userTurn ? -12 : 0)
      const beats = holdBeats(event.kind, side.hand, o.rng)
      side.notes.forEach((midi, index) => {
        const top = index === side.notes.length - 1
        const voiceDb = side.hand === 'R' ? (top ? 3.5 : -0.6) : top ? -1.6 : -1.0
        const noteVel = clamp(vel + (o.rng() - 0.5) * 2.4, 30, 112)
        hits.push({
          time: grid + 0.015 + drift + jitter + side.shift + (side.notes.length > 1 ? (index / (side.notes.length - 1)) * rollMs : 0),
          part: 'piano',
          midi,
          velocity: noteVel / 127,
          gain: dbToGain(voiceDb) * soloTrim,
          duration: beats * o.beatSec,
          pan: side.hand === 'L' ? -0.28 : -0.12,
          release: event.kind === 'held' || event.kind === 'long' ? 'soft' : 'normal',
        })
      })
    }
  }
  chokeSameHand(hits)
  const anticipates = events.some((event) => event.pos >= 3.4 && (event.kind === 'held' || event.kind === 'short' || event.kind === 'long'))
  return { hits, name: cell.name, anticipates, lhIndex: voice.lhIndex, top: voice.top, drift }
}

function chokeSameHand(hits: Hit[]): void {
  const byMidi = new Map<number, Hit[]>()
  for (const hit of hits) {
    const key = (hit.midi ?? 0) < 57 ? 0 : 1
    const list = byMidi.get(key) ?? []
    list.push(hit)
    byMidi.set(key, list)
  }
  for (const list of byMidi.values()) {
    list.sort((a, b) => a.time - b.time)
    for (let n = 0; n < list.length - 1; n++) {
      const gap = 0.012 + (((list[n].midi ?? 0) % 5) - 2) * 0.0016
      const next = list[n + 1]
      const cur = list[n]
      if (!next || !cur) continue
      cur.duration = Math.max(0.05, Math.min(cur.duration, next.time - cur.time - gap))
    }
  }
}

export function soloCompHits(o: {
  tuneId: string
  style: string
  transpose: number
  chorus: number
  bar: number
  beatSec: number
  ratio: number
  bridge: boolean
  soWhat: boolean
  semitone: number
  chord: ChordModel
  userTurn: boolean
}): Hit[] {
  let prevName = ''
  let anticipates = false
  let drift = 0
  let lhIndex = 0
  let lastTop = 66
  let hits: Hit[] = []
  for (let bar = 0; bar <= o.bar; bar++) {
    const rng = mulberry32Lite(`${o.tuneId}|${o.style}|${o.transpose}|${o.chorus}|${bar}|comp`)
    const built = buildBar({
      bar,
      beatSec: o.beatSec,
      ratio: o.ratio,
      bridge: o.bridge && bar >= 16 && bar < 24,
      soWhat: o.soWhat,
      semitone: o.semitone + (o.soWhat && bar >= 16 && bar < 24 ? 1 : 0),
      chord: o.chord,
      userTurn: o.userTurn,
      prevName,
      anticipates,
      drift,
      lhIndex,
      lastTop,
      rng,
    })
    prevName = built.name
    anticipates = built.anticipates
    drift = built.drift
    lhIndex = built.lhIndex
    lastTop = built.top
    hits = built.hits
  }
  return hits
}

function mulberry32Lite(seedText: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function soWhatAnswerHits(o: {
  barIndex: number
  beatSec: number
  ratio: number
  semitone: number
  rng: () => number
}): Hit[] {
  if (o.barIndex % 2 === 0) return []
  const answerIndex = ((o.barIndex % 8) - 1) / 2
  const bridge = o.barIndex >= 16 && o.barIndex < 24
  const final = o.barIndex % 32 === 31
  const chord1 = [52, 57, 62, 67, 71].map((n) => n + o.semitone)
  const chord2 = [50, 55, 60, 65, 69].map((n) => n + o.semitone)
  const ride = pocketBias('ride')
  const lay1 = clamp(0.012 + gauss(o.rng) * 0.004, 0.005, 0.021)
  const lay2 = clamp(0.008 + gauss(o.rng) * 0.004, 0.001, 0.017)
  const t1 = swungBeatOffset(2, o.beatSec, o.ratio) + ride + lay1
  const t2 = swungBeatOffset(3.5, o.beatSec, o.ratio) + ride + lay2
  const early = ((o.barIndex % 7) * 0.004)
  let v1 = 74 + (bridge ? 4 : 0) + gauss(o.rng) * 2.5
  if (answerIndex === 3) v1 -= 4
  if (final) v1 -= 6
  let v2 = v1 + 1 + gauss(o.rng) * 2
  if (answerIndex === 3) v2 -= 3
  v1 = clamp(v1, 58, 96)
  v2 = clamp(v2, 58, 98)
  const roll1 = 0.006 + o.rng() * 0.008
  const roll2 = 0.003 + o.rng() * 0.003
  let hold2 = 0.125 + (o.barIndex % 10) * 0.01
  if (answerIndex === 3) hold2 = Math.min(0.26, hold2 * 1.5)
  if (final) hold2 = 0.55 + o.rng() * 0.2
  const hits: Hit[] = []
  chord1.forEach((midi, index) => {
    const top = index === chord1.length - 1
    const stagger = o.rng() * 0.022 + (top ? 0.012 : 0)
    hits.push(answerNote(midi, t1 + (index / (chord1.length - 1)) * roll1, v1, Math.max(0.2, t2 - t1 - early + stagger), index, true))
  })
  chord2.forEach((midi, index) => {
    const top = index === chord2.length - 1
    const stagger = o.rng() * 0.018 + (top ? 0.008 : 0)
    const soft = answerIndex === 3 || final
    hits.push(answerNote(midi, t2 + (index / (chord2.length - 1)) * roll2, v2, hold2 + stagger, index, soft))
  })
  return hits
}

function answerNote(midi: number, time: number, vel: number, duration: number, index: number, soft: boolean): Hit {
  const top = index === 4
  const voiceDb = top ? 3.5 : index === 0 ? -1.4 : -0.6
  return {
    time,
    part: 'piano',
    midi,
    velocity: clamp(vel + (index - 2) * 0.4, 58, 98) / 127,
    gain: dbToGain(voiceDb),
    duration: Math.max(0.08, duration),
    pan: -0.22,
    release: soft ? 'soft' : 'normal',
  }
}
