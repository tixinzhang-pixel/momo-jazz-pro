/**
 * Offline stem measurement used by scripts/measure-v032.mjs.
 * Not imported by the app. Renders one multi-channel buffer with the same
 * arrangeBar / createGraph / playHit path as renderTuneWav, then returns
 * per-chorus and per-bar RMS plus hit counts. No audio files are written here.
 */
import { arrangeBar, endingHits } from '../arrange.ts'
import { findTune } from '../data/tunes.ts'
import { playingModeAt, type DynamicsMode } from '../dynamics.ts'
import { DYNAMICS_CONFIG, type FillsMode, type SubdivisionMode } from '../engine/dynamicsConfig.ts'
import { eighthOffset, mulberry32, swingRatio } from '../feel.ts'
import { DEFAULT_DRUM_MIX } from '../session.ts'
import type { Hit, RoleId, StyleId } from '../types.ts'
import { loadBank } from './bank.ts'
import { applyDrumMix, createGraph } from './graph.ts'
import { createBook, playHit } from './play.ts'

export interface MeasureRequest {
  tuneId: string
  choruses: number
  bpm?: number
  style?: StyleId
  dynamics?: DynamicsMode
  fillsMode?: FillsMode
  swingRatioOverride?: number | null
  subdivision?: SubdivisionMode
  trade?: { on: boolean; len: 4 | 8; userStarts: boolean; role: RoleId } | null
  /** Mute every bus except this one, so the mix is that stem through the master chain. */
  isolate?: 'drums' | 'bass' | 'piano' | 'ride' | 'snare' | 'kick' | 'hat' | null
  /** Tap a bus before the master compressor. Kit taps matched the v0.3.1 stem numbers. */
  tap?: 'drums' | 'bass' | 'piano' | 'ride' | 'snare' | 'kick' | 'hat' | null
  /** Skip the multi-channel render and only return hit statistics. */
  hitsOnly?: boolean
  /** First chorus index. Repeats stay at `choruses` of the full tune so HEAD/SOLO still match a 6-chorus take. */
  chorusStart?: number
  /** Total repeats used for HEAD/SOLO. Defaults to chorusStart + choruses. */
  repeats?: number
}

const SR = 44100

export async function measureSession(req: MeasureRequest) {
  const tune = findTune(req.tuneId)
  if (!tune) throw new Error(`unknown tune ${req.tuneId}`)
  const bpm = req.bpm ?? tune.bpm
  const style = req.style ?? tune.style
  const choruses = req.choruses
  const form = tune.bars.length
  const fillsMode = req.fillsMode ?? 'section'
  const dynamics = req.dynamics ?? 'auto'
  const swingRatioOverride = req.swingRatioOverride ?? null
  const subdivision = req.subdivision ?? '8ths'
  const trade = req.trade ?? null
  const chorusStart = req.chorusStart ?? 0
  const repeats = req.repeats ?? chorusStart + choruses
  const hits = collectHits({
    tuneId: tune.id,
    form,
    choruses,
    bpm,
    style,
    dynamics,
    fillsMode,
    swingRatioOverride,
    subdivision,
    trade,
    tune,
    chorusStart,
    repeats,
  })

  if (req.hitsOnly) {
    return { tuneId: tune.id, bpm, form, choruses, fillsMode, hits, audio: null }
  }

  const barDur = (60 / bpm) * 4
  const bars = form * choruses
  const seconds = barDur * bars + 4.2
  const frames = Math.ceil(SR * seconds)
  const rand = mulberry32(0x5eed)
  const originalRandom = Math.random
  Math.random = () => rand()
  const ctx = new OfflineAudioContext(2, frames, SR)
  let graph: ReturnType<typeof createGraph>
  try {
    graph = createGraph(ctx)
  } finally {
    Math.random = originalRandom
  }
  graph.master.gain.value = 0.9
  graph.drums.gain.value = DYNAMICS_CONFIG.voicing.defaultDrumBusGain
  graph.bass.gain.value = 0.86
  graph.piano.gain.value = DYNAMICS_CONFIG.piano.defaultMixerGain
  graph.guitar.gain.value = 0
  graph.wet.gain.value = 0.24
  applyDrumMix(graph, DEFAULT_DRUM_MIX, 0)
  if (req.isolate === 'drums' || req.isolate === 'ride' || req.isolate === 'snare' || req.isolate === 'kick' || req.isolate === 'hat') {
    graph.bass.gain.value = 0
    graph.piano.gain.value = 0
  }
  if (req.isolate === 'bass') {
    graph.drums.gain.value = 0
    graph.piano.gain.value = 0
  }
  if (req.isolate === 'piano') {
    graph.drums.gain.value = 0
    graph.bass.gain.value = 0
  }
  if (req.isolate === 'ride' || req.isolate === 'snare' || req.isolate === 'kick' || req.isolate === 'hat') {
    graph.kit.ride.gain.value = req.isolate === 'ride' ? graph.kit.ride.gain.value : 0
    graph.kit.snare.gain.value = req.isolate === 'snare' ? graph.kit.snare.gain.value : 0
    graph.kit.kick.gain.value = req.isolate === 'kick' ? graph.kit.kick.gain.value : 0
    graph.kit.hat.gain.value = req.isolate === 'hat' ? graph.kit.hat.gain.value : 0
    graph.kit.brush.gain.value = 0
  }

  if (req.tap) {
    graph.preOut.disconnect()
    const tapped =
      req.tap === 'drums'
        ? graph.drums
        : req.tap === 'bass'
          ? graph.bass
          : req.tap === 'piano'
            ? graph.piano
            : req.tap === 'ride'
              ? graph.kit.ride
              : req.tap === 'snare'
                ? graph.kit.snare
                : req.tap === 'kick'
                  ? graph.kit.kick
                  : graph.kit.hat
    tapped.connect(ctx.destination)
  }

  const bank = await loadBank(ctx, () => {})
  const book = createBook()
  let t = 0.08
  for (let i = 0; i < bars; i++) {
    const bar = i % form
    const chorus = chorusStart + Math.floor(i / form)
    const arranged = arrangeBar({
      tune,
      barIndex: bar,
      chorus,
      playBar: chorus * form + bar,
      bpm,
      style,
      transpose: 0,
      trade,
      click: 'off',
      humanize: true,
      dynamics,
      repeats,
      fillsMode,
      swingRatioOverride,
      subdivision,
    }).filter((hit) => hit.part !== 'guitar')
    for (const hit of arranged) playHit(ctx, graph, bank, book, hit, t)
    t += barDur
  }
  for (const hit of endingHits({ tune, bpm, style, transpose: 0, humanize: true })) {
    if (hit.part !== 'guitar') playHit(ctx, graph, bank, book, hit, t)
  }
  const audio = await ctx.startRendering()
  const left = audio.getChannelData(0)
  const right = audio.getChannelData(1)
  const label = req.tap ?? req.isolate ?? 'mix'
  const perChorus: Record<string, number[]> = { [label]: [] }
  const perBar: Record<string, number[][]> = { [label]: [] }
  if (label !== 'mix') {
    perChorus.mix = perChorus[label]
    perBar.mix = perBar[label]
  }
  const mono = req.isolate === 'drums' ? monoDownmix(left, right) : null
  const bandData = mono
    ? {
        rideBand: bandLimit(mono, SR, 5000, 12000),
        snareBand: bandLimit(mono, SR, 150, 400),
        kickBand: bandLimit(mono, SR, 40, 140),
        kickLow: lowpass(mono, SR, 120),
      }
    : null
  if (bandData) {
    perChorus.rideBand = []
    perChorus.snareBand = []
    perChorus.kickBand = []
    perChorus.kickLow = []
    perBar.rideBand = []
    perBar.snareBand = []
    perBar.kickBand = []
    perBar.kickLow = []
  }
  const beatSamples = Math.round((60 / bpm) * SR)
  const fillV031: Record<string, number[][]> = {}

  let peak = 0
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))

  for (let c = 0; c < choruses; c++) {
    const a = Math.floor((0.08 + c * form * barDur) * SR)
    const b = Math.floor((0.08 + (c + 1) * form * barDur) * SR)
    const chorusDb = dbfs(stereoRms(left.subarray(a, b), right.subarray(a, b)))
    perChorus[label].push(chorusDb)
    perBar[label].push([])
    if (bandData) {
      for (const name of ['rideBand', 'snareBand', 'kickBand', 'kickLow'] as const) {
        perChorus[name].push(dbfs(rms(bandData[name].subarray(a, b))))
        perBar[name].push([])
      }
    }
    for (let bar = 0; bar < form; bar++) {
      const ba = Math.floor((0.08 + (c * form + bar) * barDur) * SR)
      const bb = Math.floor((0.08 + (c * form + bar + 1) * barDur) * SR)
      const barDb = dbfs(stereoRms(left.subarray(ba, bb), right.subarray(ba, bb)))
      perBar[label][c].push(barDb)
      if (bandData) {
        for (const name of ['rideBand', 'snareBand', 'kickBand', 'kickLow'] as const) {
          perBar[name][c].push(dbfs(rms(bandData[name].subarray(ba, bb))))
        }
      }
    }
  }

  const last2Sources: { name: string; dataL: Float32Array; dataR: Float32Array | null }[] = [
    { name: label, dataL: left, dataR: right },
  ]
  if (bandData) {
    last2Sources.push(
      { name: 'kickLow', dataL: bandData.kickLow, dataR: null },
      { name: 'snareBand', dataL: bandData.snareBand, dataR: null },
      { name: 'drums', dataL: left, dataR: right },
    )
  }
  for (const source of last2Sources) {
    fillV031[source.name] = []
    for (let c = 0; c < choruses; c++) {
      const levels: number[] = []
      for (let bar = 0; bar < form; bar++) {
        const origin = Math.floor((0.08 + (c * form + bar) * barDur) * SR)
        const a2 = origin + beatSamples * 2
        const b2 = origin + beatSamples * 4
        const level = source.dataR
          ? dbfs(stereoRms(source.dataL.subarray(a2, b2), source.dataR.subarray(a2, b2)))
          : dbfs(rms(source.dataL.subarray(a2, b2)))
        levels.push(level)
      }
      const mid = median(levels)
      fillV031[source.name].push(levels.map((level) => level - mid))
    }
  }

  return {
    tuneId: tune.id,
    bpm,
    form,
    choruses,
    fillsMode,
    seconds,
    peak,
    hits,
    perChorus,
    perBar,
    fillV031,
    audio: null,
  }
}

function monoDownmix(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = 0.5 * (left[i] + right[i])
  return out
}

function stereoRms(left: Float32Array, right: Float32Array): number {
  let s = 0
  const n = Math.min(left.length, right.length)
  for (let i = 0; i < n; i++) s += left[i] * left[i] + right[i] * right[i]
  return Math.sqrt(s / Math.max(1, n * 2))
}

function collectHits(o: {
  tuneId: string
  form: number
  choruses: number
  bpm: number
  style: StyleId
  dynamics: DynamicsMode
  fillsMode: FillsMode
  swingRatioOverride: number | null
  subdivision: SubdivisionMode
  trade: MeasureRequest['trade']
  tune: NonNullable<ReturnType<typeof findTune>>
  chorusStart: number
  repeats: number
}) {
  const beat = 60 / o.bpm
  const ratio = swingRatio(o.bpm, o.style, o.swingRatioOverride, o.subdivision)
  const headSnare: number[] = []
  const soloSnare: number[] = []
  const headPiano: number[] = []
  const soloPiano: number[] = []
  const rideQuarter: number[] = []
  const rideSkip: number[] = []
  for (let c = o.chorusStart; c < o.chorusStart + o.choruses; c++) {
    let snareComp = 0
    let pianoAttacks = 0
    const isHead = playingModeAt(c, o.repeats) === 'HEAD'
    for (let bar = 0; bar < o.form; bar++) {
      const pianoTimes = new Set<number>()
      const arranged = arrangeBar({
        tune: o.tune,
        barIndex: bar,
        chorus: c,
        playBar: c * o.form + bar,
        bpm: o.bpm,
        style: o.style,
        transpose: 0,
        trade: o.trade ?? null,
        click: 'off',
        humanize: true,
        dynamics: o.dynamics,
        repeats: o.repeats,
        fillsMode: o.fillsMode,
        swingRatioOverride: o.swingRatioOverride,
        subdivision: o.subdivision,
      })
      for (const hit of arranged) {
        if ((hit.drum === 'snare' || hit.drum === 'sidestick') && !isThemeCatch(hit, bar, beat, ratio, o.tuneId)) {
          snareComp += 1
        }
        if (hit.part === 'piano') {
          const key = Math.round(hit.time / 0.05)
          if (!pianoTimes.has(key)) {
            pianoTimes.add(key)
            pianoAttacks += 1
          }
        }
        if ((hit.drum === 'ride' || hit.drum === 'rideBell') && c === 1) {
          const eighth = nearestEighth(hit.time, beat, ratio)
          if (eighth === 0 || eighth === 2 || eighth === 4 || eighth === 6) rideQuarter.push(hit.velocity * (hit.gain ?? 1))
          if (eighth === 3 || eighth === 7) rideSkip.push(hit.velocity * (hit.gain ?? 1))
        }
      }
    }
    if (isHead) headSnare.push(snareComp / o.form)
    else soloSnare.push(snareComp / o.form)
    if (isHead) headPiano.push(pianoAttacks / o.form)
    else soloPiano.push(pianoAttacks / o.form)
  }
  const q = mean(rideQuarter)
  const s = mean(rideSkip)
  return {
    headSnarePerBar: mean(headSnare),
    soloSnarePerBar: mean(soloSnare),
    headPianoPerBar: mean(headPiano),
    soloPianoPerBar: mean(soloPiano),
    rideQuarterMinusSkipDb: q > 0 && s > 0 ? 20 * Math.log10(q / s) : null,
    headSnareByChorus: headSnare,
    soloSnareByChorus: soloSnare,
  }
}

function isThemeCatch(hit: Hit, bar: number, beat: number, ratio: number, tuneId: string): boolean {
  if (tuneId !== 'so-what' || bar % 2 !== 1) return false
  if (hit.drum !== 'sidestick') return false
  const a = eighthOffset(4, beat, ratio)
  const b = eighthOffset(7, beat, ratio)
  return Math.abs(hit.time - a) < 0.04 || Math.abs(hit.time - b) < 0.04
}

function nearestEighth(time: number, beat: number, ratio: number): number {
  let best = 0
  let bestD = 99
  for (let e = 0; e < 8; e++) {
    const d = Math.abs(time - eighthOffset(e, beat, ratio))
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

function mean(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((s, n) => s + n, 0) / xs.length
}

function rms(data: Float32Array): number {
  let s = 0
  const n = data.length
  for (let i = 0; i < n; i++) s += data[i] * data[i]
  return Math.sqrt(s / Math.max(1, n))
}

function median(xs: number[]): number {
  const sorted = xs.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (!sorted.length) return 0
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function lowpass(input: Float32Array, sr: number, hi: number): Float32Array {
  const out = new Float32Array(input)
  const lp1 = biquad('lowpass', sr, hi)
  const lp2 = biquad('lowpass', sr, hi)
  filterInPlace(out, lp1)
  filterInPlace(out, lp2)
  return out
}

function dbfs(level: number): number {
  return 20 * Math.log10(Math.max(level, 1e-12))
}

/** 4th-order Butterworth band-limit (cascaded HP + LP), in place on a copy. */
function bandLimit(input: Float32Array, sr: number, lo: number, hi: number): Float32Array {
  const out = new Float32Array(input)
  const hp1 = biquad('highpass', sr, lo)
  const hp2 = biquad('highpass', sr, lo)
  const lp1 = biquad('lowpass', sr, hi)
  const lp2 = biquad('lowpass', sr, hi)
  filterInPlace(out, hp1)
  filterInPlace(out, hp2)
  filterInPlace(out, lp1)
  filterInPlace(out, lp2)
  return out
}

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

function biquad(type: 'highpass' | 'lowpass', sr: number, freq: number): Biquad {
  const w0 = (2 * Math.PI * freq) / sr
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * Math.SQRT1_2)
  const b0 = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos)
  const b2 = b0
  const a0 = 1 + alpha
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

function filterInPlace(data: Float32Array, q: Biquad) {
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i]
    const y0 = q.b0 * x0 + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
    data[i] = y0
  }
}
