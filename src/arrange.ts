import {
  musicalShape,
  setupStrengthAt,
  type DynamicsMode,
  type MusicalShape,
} from './dynamics.ts'
import {
  DYNAMICS_CONFIG,
  dbToGain,
  ratioToBeatFraction,
  type FillsMode,
  type PlayingMode,
  type SubdivisionMode,
} from './engine/dynamicsConfig.ts'
import {
  eighthOffset,
  hashString,
  humanVelocity,
  mulberry32,
  place,
  pocketBias,
  sixteenthOffset,
  barSwingFraction,
  swungBeatOffset,
} from './feel.ts'
import type { Pocket } from './feel.ts'
import { turnAt } from './trading.ts'
import { chordScale, chordTones, guideIntervals, mod, parseChord, transposeModel } from './theory.ts'
import type {
  ChartBar,
  ChordModel,
  ClickMode,
  DrumId,
  Hit,
  StyleId,
  TradeSettings,
  Tune,
} from './types.ts'

export interface ArrangeInput {
  tune: Tune
  barIndex: number
  chorus: number
  playBar: number
  bpm: number
  style: StyleId
  transpose: number
  trade: TradeSettings | null
  click: ClickMode
  humanize: boolean
  dynamics?: DynamicsMode
  repeats?: number | null
  /** So What only: bass call with the head groove, no piano answer. */
  intro?: boolean
  fillsMode?: FillsMode
  swingRatioOverride?: number | null
  subdivision?: SubdivisionMode
}

interface LaidChord {
  chord: ChordModel
  start: number
  beats: number
}

interface BassNote {
  beat: number
  midi: number
  beats: number
  skip?: boolean
  /** Phrase-arc and approach accent, in dB, added to the flat walking velocity. */
  arcDb?: number
}

interface DrumEv {
  eighth: number
  drum: DrumId
  vel: number
  setup?: boolean
}

const PAN: Record<DrumId, number> = {
  kick: 0,
  snare: 0.12,
  sidestick: 0.18,
  hatClosed: -0.34,
  hatPedal: -0.14,
  hatOpen: -0.28,
  ride: 0.46,
  rideBell: 0.34,
  crash: 0.12,
  tomL: -0.32,
  tomM: 0,
  tomH: 0.26,
  brushSwirl: 0.04,
  brushTap: 0.1,
}

type WalkShape = 'step' | 'arp' | 'enc'

interface WalkCacheEntry {
  notes: BassNote[]
  shape: WalkShape
  shapeRun: number
  downbeat: number
}

const walkCache = new Map<string, WalkCacheEntry>()
const voiceCache = new Map<string, number[]>()

export function clearMusicCache(): void {
  walkCache.clear()
  voiceCache.clear()
}

export function fillKind(
  barIndex: number,
  form: number,
  style: StyleId,
  _chorus: number,
  fillsMode: FillsMode = 'section',
): 'none' | 'short' | 'medium' | 'big' {
  if (fillsMode === 'off') return 'none'
  if (style === 'bossa' || style === 'ballad') return barIndex === form - 1 ? 'short' : 'none'

  if (fillsMode === 'every4') {
    if (barIndex === form - 1) return 'big'
    if ((barIndex + 1) % 8 === 0) return 'medium'
    if ((barIndex + 1) % 4 === 0) return 'short'
    return 'none'
  }

  // Default 'section' mode (A3):
  const strength = setupStrengthAt(barIndex, form, fillsMode)
  if (strength === 'strong') return 'big'
  if (strength === 'medium') return 'medium'
  if (strength === 'light') return 'short'
  return 'none'
}

/**
 * A3 Crash rule:
 * - On beat 1 of bar 1 ONLY when a new soloist block or a new trading block starts (+4-6 dB over normal ride stroke).
 *   No crash at the start of the 2nd chorus of the same block.
 * - Light crash/ride accents on first beat of sections (bars 9, 17, 25 in 32-bar form) at +2-4 dB on ride,
 *   mainly at fast tempos (>= 170 BPM; ref B).
 */
export function shouldCrashBarStart(input: {
  barIndex: number
  chorus: number
  style: StyleId
  isNewSoloBlock: boolean
  turn: ReturnType<typeof turnAt> | null
  userDrums: boolean
  drumSolo: boolean
  pianoSolo: boolean
}): boolean {
  if (input.userDrums || input.drumSolo || input.pianoSolo) return false
  if (input.style === 'bossa' || input.style === 'ballad') return false
  if (input.turn) {
    return input.turn.barInTurn === 0 && (input.barIndex > 0 || input.chorus > 0)
  }
  return input.barIndex === 0 && input.chorus > 0 && input.isNewSoloBlock
}

export function arrangeBar(input: ArrangeInput): Hit[] {
  const {
    tune,
    barIndex,
    chorus,
    playBar,
    bpm,
    style,
    transpose,
    trade,
    click,
    humanize,
    fillsMode = 'section',
    swingRatioOverride = null,
    subdivision = '8ths',
  } = input
  const beatSec = 60 / Math.max(40, bpm)
  const ratio = barSwingFraction(bpm, style, barIndex, chorus, swingRatioOverride, subdivision)
  const subRatio =
    subdivision === '16th-swing'
      ? swingRatioOverride != null
        ? ratioToBeatFraction(swingRatioOverride)
        : ratioToBeatFraction(DYNAMICS_CONFIG.swing.sixteenthBounceRatio)
      : 0.5
  const rng = mulberry32(hashString(`${tune.id}|${style}|${transpose}|${chorus}|${barIndex}|feel`))
  const hits: Hit[] = []
  const form = tune.bars.length
  const layout = layoutChords(tune.bars[barIndex], transpose)
  const nextLayout = layoutChords(tune.bars[(barIndex + 1) % form], transpose)
  const turn = trade?.on ? turnAt(playBar, trade.len, trade.userStarts, trade.role) : null
  const pianoSolo = Boolean(turn && !turn.user && turn.partner === 'piano')
  const drumSolo = Boolean(turn && !turn.user && turn.partner === 'drums')
  const userDrums = Boolean(turn && turn.user && trade?.role === 'drums')
  const userMelodic = Boolean(turn && turn.user && trade && trade.role !== 'drums')

  const shape = musicalShape({
    mode: input.dynamics ?? 'auto',
    chorus,
    barIndex,
    form,
    repeats: input.repeats === undefined ? null : input.repeats,
    section: tune.bars[barIndex]?.activeSection ?? 'A',
    userTurn: Boolean(turn?.user),
    handoff: Boolean(turn?.handoff),
    bandTurn: Boolean(turn && !turn.user),
    barInTurn: turn?.barInTurn ?? 0,
    pianoSolo,
    fillsMode,
  })

  // Check if next bar starts a new soloist block (for 4& crash anticipation in bar 32 / form end)
  const nextBarIsNewChorus = barIndex === form - 1
  const nextShape = nextBarIsNewChorus
    ? musicalShape({
        mode: input.dynamics ?? 'auto',
        chorus: chorus + 1,
        barIndex: 0,
        form,
        repeats: input.repeats === undefined ? null : input.repeats,
        section: tune.bars[0]?.activeSection ?? 'A',
        userTurn: false,
        handoff: false,
        bandTurn: false,
        barInTurn: 0,
        fillsMode,
      })
    : null
  const nextBarNewBlock = Boolean(nextShape?.isNewSoloBlock)

  let fill: 'none' | 'short' | 'medium' | 'big' = 'none'
  if (!userDrums && !drumSolo) {
    const raw = fillKind(barIndex, form, style, chorus, fillsMode)
    fill = pianoSolo || userMelodic ? (raw === 'none' ? 'none' : 'short') : raw
  }

  const crash = shouldCrashBarStart({
    barIndex,
    chorus,
    style,
    isNewSoloBlock: shape.isNewSoloBlock,
    turn,
    userDrums,
    drumSolo,
    pianoSolo,
  })

  const sectionAccent =
    !userDrums &&
    !drumSolo &&
    !pianoSolo &&
    (style === 'swing' || style === 'up' || style === 'shuffle') &&
    barIndex > 0 &&
    barIndex % 8 === 0 &&
    (bpm >= DYNAMICS_CONFIG.sections.crash.sectionAccentFastBpmThreshold || shape.playingMode === 'SOLO')

  if (style === 'ballad') {
    addBrushes(hits, beatSec, rng, humanize, 1, userDrums)
  } else if (style === 'bossa') {
    addBossaDrums(hits, beatSec, subRatio, barIndex, chorus, rng, humanize, 1, userDrums)
  } else if (style === 'shuffle') {
    addShuffleDrums(hits, {
      beatSec,
      ratio,
      barIndex,
      chorus,
      form,
      fill,
      crash,
      sectionAccent,
      drumSolo,
      userDrums,
      turn,
      rng,
      humanize,
      playingMode: shape.playingMode,
    })
  } else {
    addSwingDrums(hits, {
      beatSec,
      ratio,
      subRatio,
      subdivision,
      bpm,
      barIndex,
      chorus,
      form,
      style,
      fill,
      crash,
      sectionAccent,
      nextBarNewBlock,
      drumSolo,
      userDrums,
      turn,
      rng,
      humanize,
      playingMode: shape.playingMode,
      fillsMode,
    })
  }

  if (input.intro && tune.id === 'so-what') {
    addSoWhatIntro(hits, {
      barIndex,
      transpose,
      beatSec,
      ratio,
      rng,
      humanize,
    })
  } else if (isSoWhatHead(tune, shape.playingMode)) {
    addSoWhatHead(hits, {
      barIndex,
      form,
      transpose,
      beatSec,
      ratio,
      rng,
      humanize,
      shape,
      userDrums,
      drumSolo,
    })
  } else {
    addBass(hits, {
      tune,
      barIndex,
      chorus,
      style,
      transpose,
      beatSec,
      ratio,
      rng,
      humanize,
      nextBass: nextLayout[0].chord.bass,
      layout,
    })

    if (pianoSolo && trade) {
      addPianoSolo(hits, { tune, barIndex, playBar, transpose, beatSec, ratio, style, len: trade.len, rng, humanize })
    } else {
      addPianoComp(hits, {
        tune,
        barIndex,
        chorus,
        style,
        transpose,
        beatSec,
        ratio,
        layout,
        rng,
        humanize,
        playingMode: shape.playingMode,
        isBridge: tune.bars[barIndex]?.activeSection === 'B' || (form === 32 && barIndex >= 16 && barIndex < 24),
        sparse: userDrums,
      })
    }

    if ((style === 'swing' || style === 'up' || style === 'shuffle') && !pianoSolo) {
      addGuitar(hits, { tune, barIndex, chorus, transpose, beatSec, layout, rng, humanize })
    }
  }

  if (click !== 'off') {
    for (let beat = 0; beat < 4; beat++) {
      if (click === 'backbeat' && beat !== 1 && beat !== 3) continue
      hits.push({
        time: place(beat * beatSec, 'click', rng, false),
        part: 'click',
        velocity: beat === 0 ? 0.9 : 0.62,
        duration: 0.045,
        pan: 0,
      })
    }
  }

  applyShape(hits, shape, {
    beatSec,
    ratio,
    style,
    userDrums,
    userMelodic,
    handoff: Boolean(turn?.handoff),
    rng,
    humanize,
  })
  legatoBass(hits, beatSec)
  return hits.sort((a, b) => a.time - b.time)
}

function applyShape(
  hits: Hit[],
  shape: MusicalShape,
  o: {
    beatSec: number
    ratio: number
    style: StyleId
    userDrums: boolean
    userMelodic: boolean
    handoff: boolean
    rng: () => number
    humanize: boolean
  },
): void {
  // HEAD comping ghosts are part of the 2–2.5 hits/bar target. The density gate
  // only thins SOLO/low-density bars, where those quiet notes are optional.
  if (shape.density < 0.68 && shape.playingMode !== 'HEAD') {
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i]
      if (hit?.drum === 'snare' && hit.velocity < 0.36) hits.splice(i, 1)
    }
  }
  if (shape.density < 0.52) {
    const pianos = hits.filter((hit) => hit.part === 'piano')
    if (pianos.length) {
      const first = Math.min(...pianos.map((hit) => hit.time))
      for (let i = hits.length - 1; i >= 0; i--) {
        const hit = hits[i]
        if (hit?.part === 'piano' && hit.time > first + 0.08 && o.rng() < 0.45) hits.splice(i, 1)
      }
    }
  }
  if (o.handoff && o.userDrums) {
    const cluster = hits.filter((hit) => hit.part === 'piano').slice(0, 4)
    const when = eighthOffset(6, o.beatSec, o.ratio)
    cluster.forEach((note, index) => {
      hits.push({ ...note, time: when + index * 0.008, duration: o.beatSec * 0.9, velocity: Math.min(1, note.velocity * 0.9) })
    })
  }
  if (o.handoff && !o.userDrums && (o.style === 'swing' || o.style === 'up' || o.style === 'shuffle')) {
    const gate = eighthOffset(6, o.beatSec, o.ratio) - 0.02
    const armed = hits.some(
      (hit) =>
        hit.part === 'drums' &&
        (hit.drum === 'snare' || hit.drum === 'tomL' || hit.drum === 'tomM') &&
        hit.time >= gate,
    )
    if (!armed) {
      hits.push({
        time: place(eighthOffset(6, o.beatSec, o.ratio), 'kick', o.rng, o.humanize),
        part: 'drums',
        drum: 'kick',
        velocity: 0.55,
        duration: 0.2,
        pan: 0,
      })
      hits.push({
        time: place(eighthOffset(7, o.beatSec, o.ratio), 'snare', o.rng, o.humanize),
        part: 'drums',
        drum: 'snare',
        velocity: 0.72,
        duration: 0.28,
        pan: 0.12,
      })
    }
  }

  const lastTwoBeatsStart = o.beatSec * 2 - 0.04
  for (const hit of hits) {
    if (hit.part === 'click') continue
    let gain = shape.level

    if (hit.part === 'bass') {
      // A5: Bass level stays flat across the whole tune (within +-2 dB between HEAD and SOLO peak)
      // and NO systematic beat-1 emphasis!
      gain = shape.bassGain
    } else if (hit.part === 'piano') {
      // A6: Piano follows block intensity at half the dB change of drums
      gain = shape.pianoGain
    } else if (hit.part === 'drums') {
      const inSetupWindow = hit.time >= lastTwoBeatsStart && shape.setupStrength !== 'none'
      if (hit.drum === 'ride' || hit.drum === 'rideBell') {
        gain = shape.rideGain
      } else if (hit.drum === 'crash') {
        gain = shape.drumBusGain
      } else if (hit.drum === 'hatPedal' || hit.drum === 'hatClosed' || hit.drum === 'hatOpen') {
        gain = shape.hatGain
      } else if (hit.drum === 'kick') {
        gain = inSetupWindow && hit.velocity > 0.3 ? shape.drumBusGain * shape.kickSetupGain : shape.drumBusGain
      } else if (
        hit.drum === 'snare' ||
        hit.drum === 'sidestick' ||
        hit.drum === 'tomL' ||
        hit.drum === 'tomM' ||
        hit.drum === 'tomH'
      ) {
        gain = inSetupWindow ? shape.snareCompGain * shape.snareSetupGain : shape.snareCompGain
      } else {
        gain = shape.drumBusGain
      }
    }

    // Keep musical velocity in 0–1 and put the contour in `gain`, which may
    // exceed 1. Folding it into velocity and clamping at 1 made every strong
    // setup hit identical, so the fill table could not be retuned.
    hit.velocity = Math.min(1, Math.max(0.02, hit.velocity))
    hit.gain = Math.max(0.02, gain)
    // The snare sample peaks at full scale. Keep velocity × gain low enough that the
    // snare bus (after its fader, before the master) stays under 1.0.
    if (hit.part === 'drums' && hit.drum && SNARE_BUS.has(hit.drum)) {
      const product = hit.velocity * hit.gain
      if (product > SNARE_BUS_MAX_PRODUCT) hit.gain = SNARE_BUS_MAX_PRODUCT / hit.velocity
    }
  }
}

const SNARE_BUS = new Set(['snare', 'sidestick', 'tomL', 'tomM', 'tomH'])
/** Loudest measured kit.snare peak at this product is 0.985, before the master. */
const SNARE_BUS_MAX_PRODUCT = 0.82

function layoutChords(bar: ChartBar, transpose: number): LaidChord[] {
  let t = 0
  return bar.chords.map((slot) => {
    const chord = transposeModel(parseChord(slot.symbol), transpose)
    const item = { chord, start: t, beats: slot.beats }
    t += slot.beats
    return item
  })
}

function chordAt(layout: LaidChord[], beat: number): LaidChord {
  let cur = layout[0]
  for (const item of layout) if (beat + 1e-6 >= item.start) cur = item
  return cur
}

function addSwingDrums(
  hits: Hit[],
  o: {
    beatSec: number
    ratio: number
    subRatio: number
    subdivision: SubdivisionMode
    bpm: number
    barIndex: number
    chorus: number
    form: number
    style: StyleId
    fill: 'none' | 'short' | 'medium' | 'big'
    crash: boolean
    sectionAccent: boolean
    nextBarNewBlock: boolean
    drumSolo: boolean
    userDrums: boolean
    turn: ReturnType<typeof turnAt> | null
    rng: () => number
    humanize: boolean
    playingMode: PlayingMode
    fillsMode: FillsMode
  },
): void {
  const cfg = DYNAMICS_CONFIG
  const fillEighths = new Set<number>()
  if (o.fill === 'short') [6, 7].forEach((n) => fillEighths.add(n))
  if (o.fill === 'medium') [4, 5, 6, 7].forEach((n) => fillEighths.add(n))
  if (o.fill === 'big') [4, 5, 6, 7].forEach((n) => fillEighths.add(n))

  const push = (eighth: number, drum: DrumId, vel: number, duration = 0) => {
    const pocket = pocketFor(drum, vel)
    hits.push({
      time: place(eighthOffset(eighth, o.beatSec, o.ratio), pocket, o.rng, o.humanize),
      part: 'drums',
      drum,
      velocity: humanizeDbVel(vel, cfg.voicing.ridePattern.humanizeVelDb, o.rng, o.humanize),
      duration,
      pan: PAN[drum],
    })
  }

  const push16 = (sixteenth: number, drum: DrumId, vel: number, duration = 0) => {
    const pocket = pocketFor(drum, vel)
    hits.push({
      time: place(sixteenthOffset(sixteenth, o.beatSec, o.subRatio, o.ratio), pocket, o.rng, o.humanize),
      part: 'drums',
      drum,
      velocity: humanizeDbVel(vel, cfg.voicing.ridePattern.humanizeVelDb, o.rng, o.humanize),
      duration,
      pan: PAN[drum],
    })
  }

  if (o.userDrums) {
    push(2, 'hatPedal', cfg.voicing.hatPedal.beat2Vel, 0.12)
    push(6, 'hatPedal', cfg.voicing.hatPedal.beat4Vel, 0.12)
    return
  }

  // Ride / Hi-hat timekeeping pattern (A1, A4, Scope B 16th mode)
  if (o.subdivision !== '8ths' && !o.drumSolo) {
    // 16th subdivision pattern for ride & hi-hat (Scope B)
    for (let s = 0; s < 16; s += 2) {
      const eighth = s / 2
      if (fillEighths.has(eighth)) continue
      if (o.crash && s === 0) continue
      const isBackbeat = eighth === 2 || eighth === 6
      const qVel = cfg.voicing.ridePattern.quarterBaseVel * (isBackbeat ? dbToGain(cfg.voicing.ridePattern.beats2And4BoostDb) : 1)
      push16(s, o.playingMode === 'HEAD' ? 'hatClosed' : 'ride', s % 4 === 0 ? qVel : qVel * 0.62, o.playingMode === 'HEAD' ? 0.08 : 0)
      if ((s === 6 || s === 14) && !fillEighths.has(eighth)) {
        const skipGain = dbToGain(cfg.voicing.ridePattern.skipNoteAttenuationMedBpmDb)
        push16(s + 1, o.playingMode === 'HEAD' ? 'hatClosed' : 'ride', qVel * skipGain, o.playingMode === 'HEAD' ? 0.06 : 0)
      }
    }
  } else {
    for (const ride of ridePattern(o)) {
      if (fillEighths.has(ride.eighth)) continue
      if (o.crash && ride.eighth === 0) continue
      let vel = ride.vel
      if (o.sectionAccent && ride.eighth === 0) {
        vel = Math.min(1, vel * dbToGain(cfg.sections.crash.sectionAccentDbOverRide))
      }
      push(ride.eighth, ride.drum, vel, ride.drum === 'hatClosed' ? 0.09 : 0)
    }
  }

  // A4: Hi-hat foot on 2 and 4 at subtle level (not above ride quarter notes)
  push(2, 'hatPedal', cfg.voicing.hatPedal.beat2Vel, 0.12)
  push(6, 'hatPedal', cfg.voicing.hatPedal.beat4Vel, 0.12)

  if (!o.drumSolo) {
    // A4: Kick feathering very low (~-14 dB relative to drum bus)
    for (let beat = 0; beat < 4; beat++) {
      if (fillEighths.has(beat * 2)) continue
      if (beat !== 0 && (o.barIndex * 2 + beat + o.chorus) % 5 === 0) continue
      const featherVel = cfg.voicing.kick.featherBaseVel * (beat % 2 === 0 ? 1.05 : 0.9)
      push(beat * 2, 'kick', featherVel, 0.2)
    }
    // A4: Snare comping density (2-2.5 in HEAD, 2-3 in SOLO <=160 BPM, 3-3.5 in SOLO >160 BPM)
    const cell = snareCell(o.barIndex, o.chorus, o.bpm, o.playingMode)
    for (const ev of cell) {
      if (fillEighths.has(ev.eighth)) continue
      push(ev.eighth, ev.drum, ev.vel, ev.drum === 'sidestick' ? 0.16 : ev.vel < 0.35 ? 0.18 : 0.36)
    }
  } else if (o.turn) {
    const local = o.turn.barInTurn % 4
    const pattern = (Math.floor(o.turn.barInTurn / 4) + o.chorus) % SOLO.length
    for (const ev of SOLO[pattern][local]) {
      push(ev.eighth, ev.drum, ev.vel, ev.drum === 'sidestick' ? 0.16 : 0.32)
    }
  }

  // A3: Fills and setups in the last 2 beats
  if (o.fill !== 'none') {
    const bank = o.fill === 'short' ? SHORT : o.fill === 'medium' ? MEDIUM : BIG
    const chosen = bank[(o.barIndex + o.chorus * 2) % bank.length]
    // Section-mode bar 8 stays on the light short pattern. Every-4 bars 4 and 12
    // use the same pattern and need a few extra dB or they disappear into the groove.
    const shortBoost = o.fillsMode === 'every4' && o.fill === 'short' ? dbToGain(2.4) : 1
    for (const ev of chosen) {
      push(ev.eighth, ev.drum, ev.vel * shortBoost, ev.drum === 'kick' ? 0.22 : 0.3)
    }
    // Anticipate crash on 4& into a new soloist block
    if (o.nextBarNewBlock && o.rng() < cfg.sections.crash.anticipateProbability) {
      push(7, 'crash', cfg.voicing.ridePattern.quarterBaseVel * dbToGain(cfg.sections.crash.newBlockCrashDbOverRide * 0.75), 0)
    }
  }

  // A3: Crash on beat 1 of bar 1 when a new soloist block or trading block starts (+4-6 dB over normal ride stroke)
  if (o.crash) {
    const crashVel = Math.min(
      0.98,
      cfg.voicing.ridePattern.quarterBaseVel * dbToGain(cfg.sections.crash.newBlockCrashDbOverRide),
    )
    push(0, 'crash', crashVel, 0)
    push(0, 'kick', cfg.voicing.kick.setupAccentBaseVel * 0.85, 0.24)
  }
}

function addShuffleDrums(
  hits: Hit[],
  o: {
    beatSec: number
    ratio: number
    barIndex: number
    chorus: number
    form: number
    fill: 'none' | 'short' | 'medium' | 'big'
    crash: boolean
    sectionAccent: boolean
    drumSolo: boolean
    userDrums: boolean
    turn: ReturnType<typeof turnAt> | null
    rng: () => number
    humanize: boolean
    playingMode: PlayingMode
  },
): void {
  const cfg = DYNAMICS_CONFIG
  const push = (eighth: number, drum: DrumId, vel: number, duration = 0) => {
    const pocket = pocketFor(drum, vel)
    hits.push({
      time: place(eighthOffset(eighth, o.beatSec, o.ratio), pocket, o.rng, o.humanize),
      part: 'drums',
      drum,
      velocity: humanizeDbVel(vel, 1.5, o.rng, o.humanize),
      duration,
      pan: PAN[drum],
    })
  }

  if (o.userDrums) {
    push(2, 'hatPedal', cfg.voicing.hatPedal.beat2Vel, 0.12)
    push(6, 'hatPedal', cfg.voicing.hatPedal.beat4Vel, 0.12)
    return
  }

  const fillEighths = new Set<number>()
  if (o.fill === 'short') [6, 7].forEach((n) => fillEighths.add(n))
  if (o.fill === 'medium' || o.fill === 'big') [4, 5, 6, 7].forEach((n) => fillEighths.add(n))

  // Shuffle pattern: every beat has long + short swung pair on ride (SOLO) or closed hat + light ride (HEAD)
  const qBase = cfg.voicing.ridePattern.quarterBaseVel
  const skipVel = qBase * dbToGain(-6.0)
  for (let eighth = 0; eighth < 8; eighth++) {
    if (fillEighths.has(eighth)) continue
    if (o.crash && eighth === 0) continue
    const isDownbeat = eighth % 2 === 0
    const isBackbeat = eighth === 2 || eighth === 6
    const vel = isDownbeat ? qBase * (isBackbeat ? 1.15 : 1.0) : skipVel
    const cymbal: DrumId = o.playingMode === 'HEAD' && !isDownbeat ? 'hatClosed' : 'ride'
    push(eighth, cymbal, vel, cymbal === 'hatClosed' ? 0.08 : 0)
  }

  push(2, 'hatPedal', cfg.voicing.hatPedal.beat2Vel, 0.12)
  push(6, 'hatPedal', cfg.voicing.hatPedal.beat4Vel, 0.12)

  if (!o.drumSolo) {
    // Shuffle backbeat on 2 and 4 + shuffle kick on 1, 3 (and occasional 4&)
    if (!fillEighths.has(0)) push(0, 'kick', 0.42, 0.22)
    if (!fillEighths.has(4)) push(4, 'kick', 0.38, 0.22)
    if (!fillEighths.has(3) && (o.barIndex + o.chorus) % 2 === 1) push(3, 'kick', 0.24, 0.18)
    if (!fillEighths.has(2)) push(2, 'snare', 0.64, 0.3)
    if (!fillEighths.has(6)) push(6, 'snare', 0.68, 0.3)
    // Ghost shuffle notes on "&" of 1 and 3
    if (!fillEighths.has(1)) push(1, 'snare', 0.18, 0.15)
    if (!fillEighths.has(5)) push(5, 'snare', 0.2, 0.15)
  } else if (o.turn) {
    const local = o.turn.barInTurn % 4
    const pattern = (Math.floor(o.turn.barInTurn / 4) + o.chorus) % SOLO.length
    for (const ev of SOLO[pattern][local]) {
      push(ev.eighth, ev.drum, ev.vel, 0.3)
    }
  }

  if (o.fill !== 'none') {
    const bank = o.fill === 'short' ? SHORT : o.fill === 'medium' ? MEDIUM : BIG
    const chosen = bank[(o.barIndex + o.chorus * 2) % bank.length]
    for (const ev of chosen) push(ev.eighth, ev.drum, ev.vel, 0.28)
  }

  if (o.crash) {
    push(0, 'crash', 0.82, 0)
    push(0, 'kick', 0.58, 0.24)
  }
}

function humanizeDbVel(baseVel: number, maxDb: number, rng: () => number, humanize: boolean): number {
  if (!humanize) return Math.min(1, Math.max(0.02, baseVel))
  const deltaDb = (rng() * 2 - 1) * maxDb
  return Math.min(1, Math.max(0.02, baseVel * dbToGain(deltaDb)))
}

/**
 * A4 Ride pattern:
 * - Quarter notes are 7-9 dB louder than the skip note ("&" after 2 and 4) at medium tempos.
 *   Above 180 BPM the skip note is 11-15 dB below.
 * - Beats 2 and 4 are about 1.5 dB louder than beats 1 and 3.
 * - In HEAD mode (A1), timekeeping is mostly hi-hat (foot on 2 and 4, light stick/closed hat) with light ride.
 */
function ridePattern(o: {
  barIndex: number
  chorus: number
  style: StyleId
  bpm: number
  form: number
  drumSolo: boolean
  playingMode: PlayingMode
  turn: ReturnType<typeof turnAt> | null
}): DrumEv[] {
  if (o.drumSolo && o.turn && o.turn.barInTurn === o.turn.len - 1) {
    return [{ eighth: 0, drum: 'ride', vel: 0.38 }]
  }
  if (o.drumSolo) {
    return [0, 2, 4, 6].map((eighth) => ({ eighth, drum: 'ride' as const, vel: 0.4 }))
  }

  const rp = DYNAMICS_CONFIG.voicing.ridePattern
  const q13 = rp.quarterBaseVel
  const q24 = q13 * dbToGain(rp.beats2And4BoostDb) // +1.5 dB on beats 2 and 4
  const skipDb = o.bpm > rp.fastBpmThreshold ? rp.skipNoteAttenuationFastBpmDb : rp.skipNoteAttenuationMedBpmDb
  const skipVel = q24 * dbToGain(skipDb) // -8 dB at med tempo, -13 dB above 180 BPM

  if (o.playingMode === 'HEAD' && DYNAMICS_CONFIG.modes.head.sparseRide) {
    // HEAD still keeps time on the hat, but the ride pulse has to be audible.
    // rideVelocityBoostDb is about +4 dB on top of the ride fader and the head bus.
    const boost = dbToGain(DYNAMICS_CONFIG.modes.head.rideVelocityBoostDb)
    return [
      { eighth: 0, drum: 'ride', vel: q13 * boost },
      { eighth: 2, drum: 'hatClosed', vel: 0.34 },
      { eighth: 2, drum: 'ride', vel: q24 * boost },
      { eighth: 3, drum: 'ride', vel: skipVel * boost },
      { eighth: 4, drum: 'ride', vel: q13 * boost },
      { eighth: 6, drum: 'hatClosed', vel: 0.36 },
      { eighth: 6, drum: 'ride', vel: q24 * boost },
      { eighth: 7, drum: 'ride', vel: skipVel * 0.96 * boost },
    ]
  }

  const bell = o.barIndex === 0 && o.chorus % 2 === 1
  return [
    { eighth: 0, drum: bell ? 'rideBell' : 'ride', vel: q13 },
    { eighth: 2, drum: 'ride', vel: q24 },
    { eighth: 3, drum: 'ride', vel: skipVel },
    { eighth: 4, drum: 'ride', vel: q13 },
    { eighth: 6, drum: 'ride', vel: q24 },
    { eighth: 7, drum: 'ride', vel: skipVel * 0.96 },
  ]
}

/**
 * A4 Snare comping density:
 * - Medium tempo (<= 160 BPM): 2-3 hits per bar in SOLO, about 2-2.5 in HEAD.
 * - Fast tempo (> 160 BPM): 3-3.5 hits per bar in SOLO.
 * - Ghost notes stay well below comping accents.
 */
function snareCell(bar: number, chorus: number, bpm: number, playingMode: PlayingMode): DrumEv[] {
  const cfg = DYNAMICS_CONFIG.voicing.snareComping
  const idx = (bar + chorus * 3) % HEAD_SNARE_CELLS.length
  if (playingMode === 'HEAD') return fitHitCount(HEAD_SNARE_CELLS[idx], cfg.headHitsPerBar)
  if (bpm > cfg.fastTempoThresholdBpm) {
    return fitHitCount(FAST_SOLO_SNARE_CELLS[(bar + chorus * 5) % FAST_SOLO_SNARE_CELLS.length], cfg.soloFastHitsPerBar)
  }
  return fitHitCount(MED_SOLO_SNARE_CELLS[idx], cfg.soloMedHitsPerBar)
}

/** Drop extra hits when a config target is lower than the cell. Defaults keep the written cells. */
function fitHitCount<T>(cell: T[], target: number): T[] {
  const cap = Math.max(1, Math.ceil(target - 1e-6))
  return cell.length > cap ? cell.slice(0, cap) : cell
}

const ACC = DYNAMICS_CONFIG.voicing.snareComping.accentBaseVel
const GHOST = ACC * dbToGain(DYNAMICS_CONFIG.voicing.snareComping.ghostNoteAttenuationDb)

// HEAD cells: 18 hits / 8 bars = 2.25 comping hits per bar (ghosts kept; see applyShape).
const HEAD_SNARE_CELLS: DrumEv[][] = [
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'sidestick', vel: ACC }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'sidestick', vel: ACC }, { eighth: 6, drum: 'sidestick', vel: ACC * 0.92 }],
  [{ eighth: 2, drum: 'sidestick', vel: ACC * 0.9 }, { eighth: 5, drum: 'sidestick', vel: ACC }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 4, drum: 'sidestick', vel: ACC * 0.95 }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }, { eighth: 7, drum: 'sidestick', vel: ACC * 0.9 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'sidestick', vel: ACC }],
]

// SOLO medium tempo cells: average ~2.5 hits per bar (2 to 3 hits)
const MED_SOLO_SNARE_CELLS: DrumEv[][] = [
  [{ eighth: 0, drum: 'snare', vel: ACC * 0.95 }, { eighth: 3, drum: 'snare', vel: ACC * 1.05 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: ACC * 1.04 }],
  [{ eighth: 3, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: ACC * 1.08 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'snare', vel: ACC * 0.96 }, { eighth: 6, drum: 'snare', vel: ACC }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: GHOST }],
  [{ eighth: 4, drum: 'snare', vel: ACC * 0.95 }, { eighth: 7, drum: 'snare', vel: ACC * 1.05 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'snare', vel: ACC }, { eighth: 6, drum: 'snare', vel: GHOST }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'snare', vel: ACC * 1.02 }],
]

// SOLO fast tempo (> 160 BPM) cells: average ~3.25 hits per bar (3 to 4 hits)
const FAST_SOLO_SNARE_CELLS: DrumEv[][] = [
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: ACC * 1.06 }],
  [{ eighth: 0, drum: 'snare', vel: ACC * 0.92 }, { eighth: 3, drum: 'snare', vel: ACC }, { eighth: 5, drum: 'snare', vel: GHOST }, { eighth: 7, drum: 'snare', vel: ACC * 1.05 }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: ACC * 1.04 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'snare', vel: ACC * 0.96 }, { eighth: 5, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: GHOST }],
  [{ eighth: 0, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'snare', vel: ACC }, { eighth: 6, drum: 'snare', vel: ACC * 1.02 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 4, drum: 'snare', vel: ACC }, { eighth: 7, drum: 'snare', vel: ACC * 1.08 }],
]

const SHORT: DrumEv[][] = [
  [{ eighth: 6, drum: 'snare', vel: 0.44, setup: true }, { eighth: 7, drum: 'snare', vel: 0.52, setup: true }],
  [{ eighth: 6, drum: 'kick', vel: 0.38, setup: true }, { eighth: 7, drum: 'snare', vel: 0.48, setup: true }],
  [{ eighth: 6, drum: 'tomL', vel: 0.42, setup: true }, { eighth: 7, drum: 'tomM', vel: 0.50, setup: true }],
  [{ eighth: 6, drum: 'sidestick', vel: 0.40, setup: true }, { eighth: 7, drum: 'snare', vel: 0.46, setup: true }],
]
const MEDIUM_TRIM = dbToGain(-5)
const MEDIUM: DrumEv[][] = [
  [
    { eighth: 4, drum: 'snare', vel: 0.56 * MEDIUM_TRIM, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.68 * MEDIUM_TRIM, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.48 * MEDIUM_TRIM, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.88 * MEDIUM_TRIM, setup: true },
  ],
  [
    { eighth: 4, drum: 'tomL', vel: 0.54 * MEDIUM_TRIM, setup: true },
    { eighth: 5, drum: 'tomM', vel: 0.62 * MEDIUM_TRIM, setup: true },
    { eighth: 6, drum: 'tomH', vel: 0.70 * MEDIUM_TRIM, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.90 * MEDIUM_TRIM, setup: true },
  ],
  [
    { eighth: 4, drum: 'kick', vel: 0.46 * MEDIUM_TRIM, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.64 * MEDIUM_TRIM, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.50 * MEDIUM_TRIM, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.88 * MEDIUM_TRIM, setup: true },
  ],
]
const BIG: DrumEv[][] = [
  [
    { eighth: 4, drum: 'snare', vel: 0.88, setup: true },
    { eighth: 5, drum: 'kick', vel: 0.44, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.82, setup: true },
    { eighth: 6, drum: 'snare', vel: 0.94, setup: true },
    { eighth: 7, drum: 'kick', vel: 0.46, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.98, setup: true },
  ],
  [
    { eighth: 4, drum: 'kick', vel: 0.42, setup: true },
    { eighth: 4, drum: 'snare', vel: 0.82, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.90, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.46, setup: true },
    { eighth: 6, drum: 'snare', vel: 0.94, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.98, setup: true },
  ],
]

const SOLO: DrumEv[][][] = [
  [
    [{ eighth: 3, drum: 'sidestick', vel: 0.62 }],
    [
      { eighth: 3, drum: 'snare', vel: 0.55 },
      { eighth: 5, drum: 'snare', vel: 0.62 },
      { eighth: 7, drum: 'sidestick', vel: 0.72 },
    ],
    [
      { eighth: 2, drum: 'snare', vel: 0.48 },
      { eighth: 3, drum: 'snare', vel: 0.58 },
      { eighth: 4, drum: 'snare', vel: 0.7 },
      { eighth: 5, drum: 'snare', vel: 0.62 },
      { eighth: 7, drum: 'snare', vel: 0.86 },
    ],
    [
      { eighth: 0, drum: 'snare', vel: 0.74 },
      { eighth: 3, drum: 'snare', vel: 0.82 },
    ],
  ],
  [
    [{ eighth: 6, drum: 'tomL', vel: 0.55 }],
    [
      { eighth: 0, drum: 'tomL', vel: 0.6 },
      { eighth: 3, drum: 'tomM', vel: 0.66 },
      { eighth: 5, drum: 'tomH', vel: 0.72 },
    ],
    [
      { eighth: 4, drum: 'tomH', vel: 0.62 },
      { eighth: 5, drum: 'tomM', vel: 0.68 },
      { eighth: 6, drum: 'tomL', vel: 0.74 },
      { eighth: 7, drum: 'snare', vel: 0.82 },
    ],
    [
      { eighth: 0, drum: 'kick', vel: 0.6 },
      { eighth: 2, drum: 'snare', vel: 0.78 },
    ],
  ],
  [
    [],
    [{ eighth: 7, drum: 'sidestick', vel: 0.66 }],
    [
      { eighth: 1, drum: 'snare', vel: 0.5 },
      { eighth: 3, drum: 'snare', vel: 0.62 },
      { eighth: 4, drum: 'sidestick', vel: 0.7 },
    ],
    [
      { eighth: 6, drum: 'kick', vel: 0.64 },
      { eighth: 7, drum: 'snare', vel: 0.88 },
    ],
  ],
  [
    [
      { eighth: 0, drum: 'sidestick', vel: 0.5 },
      { eighth: 3, drum: 'snare', vel: 0.3 },
    ],
    [
      { eighth: 2, drum: 'tomM', vel: 0.58 },
      { eighth: 6, drum: 'tomH', vel: 0.66 },
    ],
    [
      { eighth: 0, drum: 'snare', vel: 0.48 },
      { eighth: 3, drum: 'snare', vel: 0.6 },
      { eighth: 4, drum: 'snare', vel: 0.55 },
      { eighth: 6, drum: 'snare', vel: 0.75 },
    ],
    [{ eighth: 0, drum: 'snare', vel: 0.8 }],
  ],
]

function addBossaDrums(
  hits: Hit[],
  beatSec: number,
  subRatio: number,
  barIndex: number,
  chorus: number,
  rng: () => number,
  humanize: boolean,
  lift: number,
  userDrums: boolean,
): void {
  const push = (index: number, drum: DrumId, vel: number, pocket: Pocket, duration: number) => {
    hits.push({
      time: place(sixteenthOffset(index, beatSec, subRatio), pocket, rng, humanize),
      part: 'drums',
      drum,
      velocity: humanVelocity(Math.min(1, vel * lift), rng, humanize),
      duration,
      pan: PAN[drum],
    })
  }
  if (userDrums) {
    push(4, 'hatPedal', 0.7, 'hat', 0.12)
    push(12, 'hatPedal', 0.76, 'hat', 0.12)
    return
  }
  const rims = (barIndex + chorus) % 4 === 3 ? [3, 6, 11, 15] : [3, 6, 11, 14]
  for (const index of [0, 2, 4, 6, 8, 10, 12, 14]) {
    const accent = index % 4 === 0
    push(index, 'hatClosed', accent ? 0.4 : 0.28, 'hat', 0.07)
  }
  for (const index of rims) push(index, 'sidestick', 0.58, 'hat', 0.14)
  for (const index of [0, 7, 10]) push(index, 'kick', index === 0 ? 0.5 : 0.42, 'kick', 0.18)
  if ((barIndex + 1) % 8 === 0) push(15, 'hatOpen', 0.36, 'hat', 0)
}

function addBrushes(
  hits: Hit[],
  beatSec: number,
  rng: () => number,
  humanize: boolean,
  lift: number,
  userDrums: boolean,
): void {
  if (userDrums) {
    for (const beat of [1, 3]) {
      hits.push({
        time: place(beat * beatSec, 'brush', rng, humanize),
        part: 'drums',
        drum: 'brushTap',
        velocity: humanVelocity(0.55 * lift, rng, humanize),
        duration: 0.07,
        pan: PAN.brushTap,
      })
    }
    return
  }
  for (let beat = 0; beat < 4; beat++) {
    const accent = beat === 1 || beat === 3
    hits.push({
      time: place(beat * beatSec, 'brush', rng, humanize),
      part: 'drums',
      drum: 'brushSwirl',
      velocity: humanVelocity((accent ? 0.62 : 0.38) * lift, rng, humanize),
      duration: beatSec * 0.98,
      pan: PAN.brushSwirl,
    })
    if (accent) {
      hits.push({
        time: place(beat * beatSec, 'brush', rng, humanize),
        part: 'drums',
        drum: 'brushTap',
        velocity: humanVelocity(0.48 * lift, rng, humanize),
        duration: 0.06,
        pan: PAN.brushTap,
      })
    } else {
      hits.push({
        time: place(beat * beatSec, 'kick', rng, humanize),
        part: 'drums',
        drum: 'kick',
        velocity: humanVelocity(0.14 * lift, rng, humanize),
        duration: 0.18,
        pan: 0,
      })
    }
  }
}

function pocketFor(drum: DrumId, vel: number): Pocket {
  if (drum === 'snare' && vel < 0.4) return 'ghost'
  if (drum === 'ride' || drum === 'rideBell' || drum === 'crash') return 'ride'
  if (drum === 'hatClosed' || drum === 'hatOpen' || drum === 'hatPedal') return 'hat'
  if (drum === 'kick') return 'kick'
  if (drum === 'brushSwirl' || drum === 'brushTap') return 'brush'
  return 'snare'
}

/**
 * A5 Bass:
 * - Level stays flat across the whole tune (max +-2 dB between HEAD and SOLO peak).
 * - Remove v0.2 beat-1 emphasis: the four beats are within ~3 dB of each other with no systematic beat-1 accent;
 *   light random variation is fine.
 * - Swung skip notes sit at the swung off-beat position (Scope B).
 */
function addBass(
  hits: Hit[],
  o: {
    tune: Tune
    barIndex: number
    chorus: number
    style: StyleId
    transpose: number
    beatSec: number
    ratio: number
    rng: () => number
    humanize: boolean
    nextBass: number
    layout: LaidChord[]
  },
): void {
  const cfg = DYNAMICS_CONFIG.bass
  const notes = ensureBass(o.tune, o.style, o.transpose, o.chorus, o.barIndex)
  for (const note of notes) {
    const when =
      o.style === 'bossa'
        ? note.beat * o.beatSec
        : swungBeatOffset(note.beat, o.beatSec, o.ratio)
    const arc = dbToGain(note.arcDb ?? 0)
    const baseVel =
      (note.skip ? cfg.baseVelocity * dbToGain(cfg.skipNoteAttenuationDb) : cfg.baseVelocity) * arc
    hits.push({
      time: place(when, 'bass', o.rng, o.humanize),
      part: 'bass',
      midi: note.midi,
      velocity: humanizeDbVel(baseVel, cfg.randomBeatVariationDb, o.rng, o.humanize),
      duration: note.beats * o.beatSec,
      pan: 0,
    })
  }
}

const BASS_LO = 28 // E1
const BASS_HI = 48 // C3

function ensureBass(tune: Tune, style: StyleId, transpose: number, chorus: number, bar: number): BassNote[] {
  const key = `${tune.id}|${style}|${transpose}|${chorus}|${bar}`
  const hit = walkCache.get(key)
  if (hit) return hit.notes
  let c = 0
  let b = 0
  let shape: WalkShape = 'step'
  let shapeRun = 0
  let lastDown: number | null = null
  let last: BassNote[] = []
  while (c < chorus || (c === chorus && b <= bar)) {
    const k = `${tune.id}|${style}|${transpose}|${c}|${b}`
    const existing = walkCache.get(k)
    if (existing) {
      shape = existing.shape
      shapeRun = existing.shapeRun
      lastDown = existing.downbeat
      last = existing.notes
    } else {
      const rng = mulberry32(hashString(`${k}|walk`))
      const entry = bassLine(tune, style, transpose, c, b, lastDown, shape, shapeRun, rng)
      walkCache.set(k, entry)
      shape = entry.shape
      shapeRun = entry.shapeRun
      lastDown = entry.downbeat
      last = entry.notes
    }
    if (c === chorus && b === bar) return last
    b += 1
    if (b >= tune.bars.length) {
      b = 0
      c += 1
    }
  }
  return last
}

function bassLine(
  tune: Tune,
  style: StyleId,
  transpose: number,
  chorus: number,
  barIndex: number,
  lastDown: number | null,
  shape: WalkShape,
  shapeRun: number,
  rng: () => number,
): WalkCacheEntry {
  const form = tune.bars.length
  const layout = layoutChords(tune.bars[barIndex], transpose)
  const nextBar = (barIndex + 1) % form
  const nextChorus = barIndex + 1 >= form ? chorus + 1 : chorus
  const next = layoutChords(tune.bars[nextBar], transpose)
  const nextPc = next[0].chord.bass
  if (style === 'bossa') return plainWalk(bossaBass(layout, nextPc, lastDown, barIndex))
  if (style === 'ballad') return plainWalk(balladBass(layout, nextPc, lastDown, rng))
  const walked = swingWalk(tune, style, transpose, chorus, barIndex, nextChorus, nextBar, layout, next, lastDown, shape, shapeRun, rng)
  if (style === 'shuffle') return { ...walked, notes: shufflePickups(walked.notes, barIndex) }
  return walked
}

function plainWalk(notes: BassNote[]): WalkCacheEntry {
  return { notes, shape: 'step', shapeRun: 1, downbeat: notes[0]?.midi ?? 40 }
}

/**
 * Walking bass. Beat 1 and beat 3 are chord tones. Beat 4 approaches the next
 * downbeat (chromatic, dominant, or scale). The register drifts through E1–C3.
 * The same shape does not run more than two bars. A swung 8th pickup is occasional.
 * The line is a pure function of the bar seed.
 */
function swingWalk(
  tune: Tune,
  style: StyleId,
  transpose: number,
  chorus: number,
  barIndex: number,
  nextChorus: number,
  nextBar: number,
  layout: LaidChord[],
  nextLayout: LaidChord[],
  lastDown: number | null,
  prevShape: WalkShape,
  prevRun: number,
  rng: () => number,
): WalkCacheEntry {
  const chord = chordAt(layout, 0).chord
  const midChord = chordAt(layout, 2).chord
  const nextChord = nextLayout[0].chord
  const center = registerCenter(tune.id, style, transpose, chorus, barIndex)
  const seed = hashString(`${tune.id}|${style}|${transpose}|${chorus}|${barIndex}|db`)
  const beat1 = downbeatPitch(chord, center, lastDown, seed)
  const nextCenter = registerCenter(tune.id, style, transpose, nextChorus, nextBar)
  const nextSeed = hashString(`${tune.id}|${style}|${transpose}|${nextChorus}|${nextBar}|db`)
  const target = downbeatPitch(nextChord, nextCenter, beat1, nextSeed)

  const shapes: WalkShape[] = ['step', 'arp', 'enc']
  let shape = shapes[Math.floor(rng() * shapes.length)] ?? 'step'
  if (shape === prevShape && prevRun >= 2) {
    shape = shapes[(shapes.indexOf(shape) + 1 + Math.floor(rng() * 2)) % shapes.length] ?? 'arp'
  }
  const shapeRun = shape === prevShape ? prevRun + 1 : 1

  const approach = approachPitch(target, beat1, chord, nextChord, rng)
  const tones = pitchesOf(midChord, false)
  const dir = Math.sign(target - beat1) || 1
  const strongAround = shape === 'arp' ? beat1 + dir * 5 : shape === 'enc' ? target + (approach < target ? 3 : -3) : beat1 + dir * 3
  let strong = nearestPitch(tones, strongAround, [beat1, approach, target])
  if (Math.abs(strong - beat1) > 9) strong = nearestPitch(tones, beat1 + dir * 4, [beat1])
  const passing = connectPitch(beat1, strong, chord, shape)

  const midis = [beat1, passing, strong, approach].map((n) => Math.max(BASS_LO, Math.min(BASS_HI, n)))
  midis[0] = nearestPitch(pitchesOf(chord, false), midis[0], lastDown == null ? [] : [lastDown])
  for (let i = 1; i < midis.length; i++) midis[i] = distinctPitch(midis[i], midis[i - 1])
  midis[2] = nearestPitch(tones, midis[2], [midis[0], midis[1], midis[3]])
  if (midis[2] === midis[1] || midis[2] === midis[3]) midis[2] = distinctPitch(midis[2] + dir, midis[1])
  for (let i = 1; i < midis.length; i++) {
    if (midis[i] === midis[i - 1]) midis[i] = distinctPitch(midis[i] + dir, midis[i - 1])
    if (Math.abs(midis[i] - midis[i - 1]) > 12) {
      const pulled = midis[i - 1] + Math.sign(midis[i] - midis[i - 1]) * 7
      midis[i] = Math.max(BASS_LO, Math.min(BASS_HI, pulled))
    }
  }

  const notes: BassNote[] = midis.map((midi, index) => ({
    beat: index,
    midi,
    beats: 1,
    arcDb: phraseArc(index, barIndex, index === 3),
  }))
  addSwungPickup(notes, target, rng)
  return { notes, shape, shapeRun, downbeat: notes[0]?.midi ?? beat1 }
}

function addSwungPickup(notes: BassNote[], target: number, rng: () => number): void {
  const p = DYNAMICS_CONFIG.bass.skipNoteProbability
  if (p <= 0 || rng() >= p) return
  const approach = notes[3]?.midi ?? target
  const side = approach <= target ? 1 : -1
  let midi = target + side
  if (midi < BASS_LO || midi > BASS_HI || midi === approach) midi = approach + (approach < target ? -2 : 2)
  midi = Math.max(BASS_LO, Math.min(BASS_HI, midi))
  if (midi === approach) midi = Math.max(BASS_LO, Math.min(BASS_HI, approach - 1))
  notes.push({ beat: 3.5, midi, beats: 0.5, skip: true, arcDb: -7 })
  if (p >= 0.99) {
    const early = Math.max(BASS_LO, Math.min(BASS_HI, (notes[1]?.midi ?? midi) - 1))
    notes.splice(2, 0, { beat: 1.5, midi: early, beats: 0.5, skip: true, arcDb: -7 })
  }
}

function phraseArc(index: number, barIndex: number, approach: boolean): number {
  let db = Math.sin((((barIndex % 4) + 0.5) / 4) * Math.PI) * 0.5
  if (index === 0 && barIndex % 2 === 0) db += 1
  if (index === 1 || index === 3) db += 0.35
  if (approach) db -= 1.3
  return Math.max(-2, Math.min(1.6, db))
}

/** Hold each bass note until the next onset. A written hold longer than a beat and a half is left alone. */
function legatoBass(hits: Hit[], beatSec: number): void {
  const bass = hits.filter((hit) => hit.part === 'bass').sort((a, b) => a.time - b.time)
  for (let i = 0; i < bass.length; i++) {
    const note = bass[i]
    const next = bass[i + 1]
    if (!note) continue
    if (next) {
      note.duration = Math.max(0.05, next.time - note.time)
    } else if (note.duration < beatSec * 1.5) {
      const nextDown = beatSec * 4 + pocketBias('bass')
      note.duration = Math.max(0.05, nextDown - note.time)
    }
  }
}

/** Boogie pickup on the swung 8th after beat 2, and after beat 4 on even bars. */
function shufflePickups(notes: BassNote[], barIndex: number): BassNote[] {
  const result: BassNote[] = []
  for (const n of notes) {
    if (n.beat === 1 || (n.beat === 3 && barIndex % 2 === 0 && !n.skip)) {
      result.push({ ...n, beats: 0.65 })
      const pickup = Math.max(BASS_LO, Math.min(BASS_HI, n.midi + (n.midi < 40 ? 2 : -2)))
      result.push({ beat: n.beat + 0.5, midi: pickup === n.midi ? n.midi - 1 : pickup, beats: 0.35, skip: true, arcDb: -6 })
    } else {
      result.push(n)
    }
  }
  return result
}

function balladBass(layout: LaidChord[], nextPc: number, prev: number | null, rng: () => number): BassNote[] {
  const rootPc = layout[0].chord.bass
  const root = nearestPc(rootPc, prev ?? 43)
  const dest = nearestPc(nextPc, root)
  const approach = pickApproach(dest, root, rng)
  const fifth = nearestPc(mod(layout[0].chord.root + 7), root)
  const second = Math.abs(approach - root) <= 7 ? approach : fifth
  return [
    { beat: 0, midi: root, beats: 2 },
    { beat: 2, midi: second, beats: 2 },
  ]
}

function bossaBass(layout: LaidChord[], nextPc: number, prev: number | null, barIndex: number): BassNote[] {
  if (layout.length >= 2) {
    let last = prev
    return layout.map((slot) => {
      const midi = nearestPc(slot.chord.bass, last ?? 43)
      last = midi
      return { beat: slot.start, midi, beats: slot.beats * 0.92 }
    })
  }
  const root = nearestPc(layout[0].chord.bass, prev ?? 43)
  const fifthPc = mod(layout[0].chord.root + (barIndex % 2 === 0 ? 7 : 12))
  const fifth = nearestPc(fifthPc, root + 3)
  const notes: BassNote[] = [
    { beat: 0, midi: root, beats: 1.45 },
    { beat: 2, midi: fifth, beats: 1.35 },
  ]
  if (mod(nextPc) !== mod(layout[0].chord.bass)) {
    notes[1] = { beat: 2, midi: fifth, beats: 1.15 }
    notes.push({ beat: 3.75, midi: nearestPc(nextPc, fifth), beats: 0.25 })
  }
  return notes
}

function nearestPc(pc: number, around: number): number {
  let best = 40 + mod(pc)
  let bestD = 99
  for (let m = mod(pc); m <= 84; m += 12) {
    if (m < 34 || m > 58) continue
    const d = Math.abs(m - around)
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

function pickApproach(dest: number, last: number | null, rng: () => number): number {
  const options = [-1, -2, 1, 2, -5, 5, 7, -7]
  const weight: Record<number, number> = { [-1]: 0, [-2]: 0.35, 1: 0.45, 2: 0.7, [-5]: 0.4, 5: 1, 7: 0.65, [-7]: 0.6 }
  let best = dest - 1
  let bestScore = 999
  for (const iv of options) {
    const n = dest + iv
    if (n < 34 || n > 58) continue
    const leap = last == null ? 0 : Math.abs(n - last)
    const score = leap + (weight[iv] ?? 1) + rng() * 0.3
    if (score < bestScore) {
      bestScore = score
      best = n
    }
  }
  return best
}

function registerCenter(tuneId: string, style: StyleId, transpose: number, chorus: number, barIndex: number): number {
  const rng = mulberry32(hashString(`bass-reg|${tuneId}|${style}|${transpose}|${chorus}`))
  const climb = rng() < 0.5
  const start = climb ? 30 : 45
  const end = climb ? 45 : 30
  const t = barIndex / 31
  const wobble = Math.sin(barIndex / 2.5) * 1.4
  return Math.max(29, Math.min(46, Math.round(start + (end - start) * t + wobble)))
}

function pitchesOf(chord: ChordModel, scale: boolean): number[] {
  const ivs = scale ? chordScale(chord.kind) : chordTones(chord.kind)
  const pcs = new Set(ivs.map((i) => mod(chord.root + i)))
  pcs.add(mod(chord.bass))
  const out: number[] = []
  for (let midi = BASS_LO; midi <= BASS_HI; midi++) if (pcs.has(mod(midi))) out.push(midi)
  return out
}

function nearestPitch(cands: number[], around: number, avoid: number[]): number {
  const blocked = new Set(avoid)
  const open = cands.filter((n) => !blocked.has(n))
  const pool = open.length ? open : cands
  let best = pool[0] ?? Math.round(around)
  let bestD = 99
  for (const n of pool) {
    const d = Math.abs(n - around)
    if (d < bestD || (d === bestD && n < best)) {
      bestD = d
      best = n
    }
  }
  return Math.max(BASS_LO, Math.min(BASS_HI, best))
}

function downbeatPitch(chord: ChordModel, center: number, avoid: number | null, seed: number): number {
  const rng = mulberry32(seed)
  const ranked = pitchesOf(chord, false)
    .slice()
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
  const choices = ranked.filter((n) => n !== avoid).slice(0, 3)
  const pool = choices.length ? choices : ranked
  if (!pool.length) return Math.max(BASS_LO, Math.min(BASS_HI, Math.round(center)))
  const index = rng() < 0.62 || pool.length === 1 ? 0 : rng() < 0.8 ? 1 : Math.min(2, pool.length - 1)
  return pool[Math.min(index, pool.length - 1)] ?? pool[0]
}

function approachPitch(
  target: number,
  from: number,
  chord: ChordModel,
  nextChord: ChordModel,
  rng: () => number,
): number {
  const roll = rng()
  const choices: number[] = []
  if (roll < 0.66) {
    choices.push(target - 1, target + 1)
  } else if (roll < 0.86) {
    const fifth = mod(nextChord.root + 7)
    for (let midi = BASS_LO; midi <= BASS_HI; midi++) if (mod(midi) === fifth) choices.push(midi)
    choices.push(target - 5, target - 7, target + 5, target + 7)
  } else {
    for (const midi of pitchesOf(chord, true)) {
      if (Math.abs(midi - target) === 1 || Math.abs(midi - target) === 2) choices.push(midi)
    }
  }
  const open = choices.filter((n) => n >= BASS_LO && n <= BASS_HI && n !== target && n !== from)
  if (!open.length) return Math.max(BASS_LO, Math.min(BASS_HI, target + (from <= target ? -1 : 1)))
  return nearestPitch(open, from, [])
}

function connectPitch(from: number, to: number, chord: ChordModel, shape: WalkShape): number {
  if (shape === 'arp') return nearestPitch(pitchesOf(chord, false), (from + to) / 2, [from, to])
  if (shape === 'enc') {
    const around = to >= from ? from - 2 : from + 2
    return nearestPitch(pitchesOf(chord, true), around, [from, to])
  }
  const dir = Math.sign(to - from) || 1
  const scale = pitchesOf(chord, true).filter((n) => (n - from) * dir > 0 && Math.abs(n - from) <= 5 && n !== to)
  if (scale.length) return nearestPitch(scale, from + dir * 2, [])
  const step = from + dir * 2
  return Math.max(BASS_LO, Math.min(BASS_HI, step === to ? from + dir : step))
}

function distinctPitch(note: number, previous: number | null | undefined): number {
  if (previous == null || note !== previous) return Math.max(BASS_LO, Math.min(BASS_HI, note))
  const dir = note < 40 ? 1 : -1
  let next = note + dir
  if (next < BASS_LO || next > BASS_HI) next = note - dir
  return Math.max(BASS_LO, Math.min(BASS_HI, next))
}

/**
 * A6 Piano comping:
 * - Density ~3 hits per bar in SOLO. About 30% of hits fall on the swung "&"
 *   (anticipations, especially "&" of 4 into the next bar), about 45% on the beat,
 *   and the rest (~25%) on other off-beat positions.
 * - In HEAD, sparser: about 1.5-2 hits per bar, longer chords.
 */
function addPianoComp(
  hits: Hit[],
  o: {
    tune: Tune
    barIndex: number
    chorus: number
    style: StyleId
    transpose: number
    beatSec: number
    ratio: number
    layout: LaidChord[]
    rng: () => number
    humanize: boolean
    playingMode: PlayingMode
    isBridge: boolean
    sparse: boolean
  },
): void {
  if (o.sparse && o.barIndex % 2 === 1) return
  const attacks = pianoAttacks(o)
  const soloTrim = o.playingMode === 'SOLO' ? dbToGain(DYNAMICS_CONFIG.piano.soloTrimDb) : 1
  for (const attack of attacks) {
    const slot = chordAt(o.layout, Math.min(3.99, attack.beat))
    const chordIndex = o.layout.indexOf(slot)
    const notes = ensureVoicing(o.tune, o.style, o.transpose, o.chorus, o.barIndex, chordIndex)
    const when =
      o.style === 'bossa'
        ? attack.beat * o.beatSec
        : eighthOffset(Math.round(attack.beat * 2), o.beatSec, o.ratio)
    notes.forEach((midi, i) => {
      hits.push({
        time: place(when, 'piano', o.rng, o.humanize) + i * 0.0035,
        part: 'piano',
        midi,
        velocity: humanVelocity(
          (o.sparse ? attack.vel * 0.72 : attack.vel) * soloTrim * (i === notes.length - 1 ? 1 : 0.92),
          o.rng,
          o.humanize,
        ),
        duration: attack.beats * o.beatSec * 0.94,
        pan: -0.22,
      })
    })
  }
}

function pianoAttacks(o: {
  style: StyleId
  barIndex: number
  chorus: number
  layout: LaidChord[]
  playingMode: PlayingMode
  isBridge: boolean
  sparse: boolean
}): { beat: number; beats: number; vel: number }[] {
  const baseVel = DYNAMICS_CONFIG.piano.baseVelocity
  if (o.style === 'ballad' || o.sparse) return [{ beat: 0, beats: 3.4, vel: baseVel * 0.78 }]
  if (o.style === 'bossa') {
    return [
      { beat: 0.5, beats: 0.9, vel: baseVel * 0.85 },
      { beat: 2, beats: 1.1, vel: baseVel * 0.92 },
      { beat: 3.5, beats: 0.7, vel: baseVel * 0.82 },
    ]
  }
  if (o.layout.length >= 2) {
    if (o.playingMode === 'HEAD') {
      return o.layout.map((slot) => ({ beat: slot.start, beats: slot.beats * 0.92, vel: baseVel * 0.88 }))
    }
    // In SOLO with multiple chords/bar, add a swung anticipation or mid-bar hit (~3 hits/bar)
    const base = o.layout.map((slot) => ({ beat: slot.start, beats: slot.beats * 0.75, vel: baseVel * 0.92 }))
    if (base.length === 2) {
      base.push({ beat: 3.5, beats: 0.65, vel: baseVel * 0.96 })
    }
    return base
  }

  // HEAD cells: ~1.5-2 hits per bar, longer chords (A6)
  const headCells: { beat: number; beats: number; vel: number }[][] = [
    [{ beat: 0, beats: 2.2, vel: baseVel * 0.86 }, { beat: 2.5, beats: 1.3, vel: baseVel * 0.82 }],
    [{ beat: 0, beats: 3.2, vel: baseVel * 0.84 }],
    [{ beat: 0.5, beats: 1.8, vel: baseVel * 0.82 }, { beat: 2.5, beats: 1.3, vel: baseVel * 0.86 }],
    [{ beat: 0, beats: 1.8, vel: baseVel * 0.85 }, { beat: 3.5, beats: 0.8, vel: baseVel * 0.88 }],
  ]
  if (o.playingMode === 'HEAD') {
    return fitHitCount(headCells[(o.barIndex + o.chorus) % headCells.length], DYNAMICS_CONFIG.piano.headHitsPerBar)
  }

  // SOLO cells: ~3 hits per bar (~45% on beat [0, 1, 2, 3], ~30% on swung "&" anticipations [1.5, 3.5], ~25% other off-beats [0.5, 2.5])
  const soloCells: { beat: number; beats: number; vel: number }[][] = [
    [
      { beat: 0, beats: 1.1, vel: baseVel * 0.96 },
      { beat: 1.5, beats: 1.2, vel: baseVel * 0.92 },
      { beat: 3.5, beats: 0.8, vel: baseVel },
    ],
    [
      { beat: 0.5, beats: 1.1, vel: baseVel * 0.88 },
      { beat: 2, beats: 1.1, vel: baseVel * 0.95 },
      { beat: 3.5, beats: 0.8, vel: baseVel * 0.98 },
    ],
    [
      { beat: 0, beats: 0.9, vel: baseVel * 0.92 },
      { beat: 1, beats: 1.1, vel: baseVel * 0.88 },
      { beat: 2.5, beats: 1.2, vel: baseVel * 0.94 },
    ],
    [
      { beat: 0, beats: 1.2, vel: baseVel * 0.94 },
      { beat: 2, beats: 1.0, vel: baseVel * 0.9 },
      { beat: 3.5, beats: 0.8, vel: baseVel },
    ],
    [
      { beat: 0.5, beats: 0.9, vel: baseVel * 0.88 },
      { beat: 1.5, beats: 1.1, vel: baseVel * 0.94 },
      { beat: 3, beats: 0.9, vel: baseVel * 0.92 },
    ],
    [
      { beat: 0, beats: 1.3, vel: baseVel * 0.95 },
      { beat: 2.5, beats: 0.8, vel: baseVel * 0.88 },
      { beat: 3.5, beats: 0.8, vel: baseVel * 0.98 },
    ],
  ]
  return fitHitCount(soloCells[(o.barIndex + o.chorus * 2) % soloCells.length], DYNAMICS_CONFIG.piano.soloHitsPerBar)
}

function addPianoSolo(
  hits: Hit[],
  o: {
    tune: Tune
    barIndex: number
    playBar: number
    transpose: number
    beatSec: number
    ratio: number
    style: StyleId
    len: 4 | 8
    rng: () => number
    humanize: boolean
  },
): void {
  const events = soloEvents(o.tune, o.transpose, o.playBar, o.len)
  for (const ev of events) {
    const when = o.style === 'bossa' ? (ev.eighth / 2) * o.beatSec : eighthOffset(ev.eighth, o.beatSec, o.ratio)
    hits.push({
      time: place(when, 'piano', o.rng, o.humanize),
      part: 'piano',
      midi: ev.midi,
      velocity: humanVelocity(ev.vel, o.rng, o.humanize),
      duration: ev.beats * o.beatSec * 0.95,
      pan: -0.18,
    })
  }
}

function soloEvents(tune: Tune, transpose: number, playBar: number, len: number): { eighth: number; midi: number; beats: number; vel: number }[] {
  const start = playBar - (playBar % len)
  let midi = 64
  let result: { eighth: number; midi: number; beats: number; vel: number }[] = []
  for (let p = start; p <= playBar; p++) {
    const formBar = ((p % tune.bars.length) + tune.bars.length) % tune.bars.length
    const layout = layoutChords(tune.bars[formBar], transpose)
    const chord = layout[0].chord
    const local = p - start
    const isLast = local === len - 1
    const ordered = nearestGuides(chord, midi)
    const events = soloRhythm(local, isLast, ordered[0], ordered[1])
    midi = events[events.length - 1]?.midi ?? midi
    if (p === playBar) result = events
  }
  return result
}

function nearestGuides(chord: ChordModel, prev: number): [number, number] {
  const [a, b] = guideIntervals(chord.kind)
  const n1 = nearestMidi(mod(chord.root + a), prev, 58, 76)
  const n2 = nearestMidi(mod(chord.root + b), prev, 58, 76)
  return Math.abs(n1 - prev) <= Math.abs(n2 - prev) ? [n1, n2] : [n2, n1]
}

function nearestMidi(pc: number, around: number, low: number, high: number): number {
  let best = low
  let bestD = 99
  for (let m = mod(pc); m <= high + 12; m += 12) {
    if (m < low || m > high) continue
    const d = Math.abs(m - around)
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

function soloRhythm(local: number, isLast: boolean, first: number, second: number) {
  if (isLast) return [{ eighth: 0, midi: first, beats: 2, vel: 0.78 }]
  if (local % 4 === 0) {
    return [
      { eighth: 0, midi: first, beats: 1.2, vel: 0.74 },
      { eighth: 3, midi: second, beats: 1.6, vel: 0.64 },
    ]
  }
  if (local % 4 === 1) return [{ eighth: 2, midi: first, beats: 2, vel: 0.7 }]
  if (local % 4 === 2) {
    return [
      { eighth: 0, midi: first, beats: 1.4, vel: 0.68 },
      { eighth: 4, midi: second, beats: 1.5, vel: 0.62 },
    ]
  }
  return [{ eighth: 1, midi: first, beats: 2, vel: 0.66 }]
}

function addGuitar(
  hits: Hit[],
  o: {
    tune: Tune
    barIndex: number
    chorus: number
    transpose: number
    beatSec: number
    layout: LaidChord[]
    rng: () => number
    humanize: boolean
  },
): void {
  let prev: number[] | null = null
  for (let beat = 0; beat < 4; beat++) {
    const slot = chordAt(o.layout, beat)
    const notes = shell(slot.chord, prev)
    prev = notes
    notes.forEach((midi, i) => {
      hits.push({
        time: place(beat * o.beatSec, 'guitar', o.rng, o.humanize) + i * 0.004,
        part: 'guitar',
        midi,
        velocity: humanVelocity(0.4, o.rng, o.humanize),
        duration: 0.12,
        pan: 0.32,
      })
    })
  }
}

function shell(chord: ChordModel, prev: number[] | null): number[] {
  const [third, seventh] = guideIntervals(chord.kind)
  const pcs = [chord.root, mod(chord.root + third), mod(chord.root + seventh)]
  return voiceNotes(pcs, prev, 52, 70)
}

function ensureVoicing(
  tune: Tune,
  style: StyleId,
  transpose: number,
  chorus: number,
  bar: number,
  chordIndex: number,
): number[] {
  const key = `${tune.id}|${style}|${transpose}|${tune.voicing ?? ''}|${chorus}|${bar}|${chordIndex}`
  const hit = voiceCache.get(key)
  if (hit) return hit
  let c = 0
  let b = 0
  let prev: number[] | null = null
  let last: number[] = []
  while (c < chorus || (c === chorus && b <= bar)) {
    const layout = layoutChords(tune.bars[b], transpose)
    const limit = c === chorus && b === bar ? chordIndex : layout.length - 1
    for (let i = 0; i <= limit; i++) {
      const k = `${tune.id}|${style}|${transpose}|${tune.voicing ?? ''}|${c}|${b}|${i}`
      const existing = voiceCache.get(k)
      if (existing) {
        prev = existing
        last = existing
      } else {
        const notes = voiceChord(layout[i].chord, prev, tune.voicing === 'quartal')
        voiceCache.set(k, notes)
        prev = notes
        last = notes
      }
    }
    if (c === chorus && b === bar) return last
    b += 1
    if (b >= tune.bars.length) {
      b = 0
      c += 1
    }
  }
  return last
}

function voiceChord(chord: ChordModel, prev: number[] | null, quartal: boolean): number[] {
  if (quartal && (chord.kind === 'm7' || chord.kind === 'm' || chord.kind === 'm11')) {
    return quartalStack(chord.root, prev)
  }
  let best: number[] = []
  let bestScore = Infinity
  for (const rel of voicingOptions(chord.kind)) {
    const pcs = rel.map((i) => mod(chord.root + i))
    const notes = voiceNotes(pcs, prev, 50, 76)
    const score = prev ? matchDistance(notes, prev) : Math.abs(average(notes) - 62)
    if (score < bestScore) {
      bestScore = score
      best = notes
    }
  }
  return best
}

function quartalStack(root: number, prev: number[] | null): number[] {
  let base = 48 + mod(root)
  if (base < 48) base += 12
  let notes = [0, 5, 10, 15, 19].map((i) => base + i)
  if (prev) {
    const shift = average(notes) - average(prev)
    if (shift > 6) notes = notes.map((n) => n - 12)
    else if (shift < -6) notes = notes.map((n) => n + 12)
  }
  return notes
}

function voicingOptions(kind: ChordModel['kind']): number[][] {
  switch (kind) {
    case 'maj':
    case 'maj7':
      return [[4, 7, 11, 14], [4, 7, 9, 14]]
    case '6':
      return [[4, 7, 9, 14]]
    case 'm':
    case 'm7':
    case 'm9':
      return [[3, 7, 10, 14], [3, 10, 14, 17]]
    case 'm6':
      return [[3, 7, 9, 14]]
    case 'm11':
      return [[5, 10, 14, 17]]
    case 'mmaj':
      return [[3, 7, 11, 14]]
    case '7':
    case '9':
    case '13':
      return [[4, 9, 10, 14], [4, 7, 10, 14]]
    case '7b9':
      return [[4, 10, 13, 21]]
    case '7#9':
      return [[4, 10, 15, 21]]
    case '7alt':
      return [[4, 8, 10, 13]]
    case '7b13':
      return [[4, 8, 10, 14]]
    case '7#11':
      return [[4, 6, 10, 14]]
    case '7sus':
    case 'sus':
      return [[5, 10, 14, 17]]
    case 'm7b5':
      return [[3, 6, 10, 14]]
    case 'dim7':
      return [[0, 3, 6, 9]]
    case 'aug':
      return [[4, 8, 11]]
    default:
      return [[4, 7, 11, 14]]
  }
}

export function voiceNotes(pcs: number[], prev: number[] | null, low: number, high: number): number[] {
  const unique = [...new Set(pcs.map((pc) => mod(pc)))]
  const options = unique.map((pc) => {
    const list: number[] = []
    for (let m = pc; m <= high + 12; m += 12) if (m >= low && m <= high) list.push(m)
    if (!list.length) list.push(Math.min(high, Math.max(low, 60 + pc)))
    return list
  })
  let best: number[] = []
  let bestScore = Infinity
  const cur: number[] = []
  const walk = (i: number) => {
    if (i === options.length) {
      const sorted = [...cur].sort((a, b) => a - b)
      const span = sorted[sorted.length - 1] - sorted[0]
      const score = (prev ? matchDistance(sorted, prev) : Math.abs(average(sorted) - (low + high) / 2)) + (span > 18 ? 4 : 0)
      if (score < bestScore) {
        bestScore = score
        best = sorted
      }
      return
    }
    for (const n of options[i]) {
      cur.push(n)
      walk(i + 1)
      cur.pop()
    }
  }
  walk(0)
  return best
}

function matchDistance(a: number[], b: number[]): number {
  const used = new Set<number>()
  let sum = 0
  for (const n of a) {
    let bestI = -1
    let bestD = 99
    b.forEach((m, i) => {
      if (used.has(i)) return
      const d = Math.abs(m - n)
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    })
    if (bestI >= 0) used.add(bestI)
    sum += bestD === 99 ? 6 : bestD
  }
  return sum + Math.abs(average(a) - average(b)) * 0.45
}

function average(notes: number[]): number {
  return notes.reduce((s, n) => s + n, 0) / Math.max(1, notes.length)
}

/** A final tonic stab after the last repeat. Long enough to ring, then the scheduler stops. */
export function endingHits(input: {
  tune: Tune
  bpm: number
  style: StyleId
  transpose: number
  humanize: boolean
}): Hit[] {
  const beatSec = 60 / Math.max(40, input.bpm)
  const chord = layoutChords(input.tune.bars[0], input.transpose)[0]?.chord
  if (!chord) return []
  const notes = ensureVoicing(input.tune, input.style, input.transpose, 0, 0, 0)
  const rng = mulberry32(hashString(`${input.tune.id}|ending|${input.transpose}`))
  const hits: Hit[] = []
  notes.forEach((midi, index) => {
    hits.push({
      time: place(0, 'piano', rng, input.humanize) + index * 0.01,
      part: 'piano',
      midi,
      velocity: 0.72,
      duration: beatSec * 3.1,
      pan: -0.2,
    })
  })
  let bass = chord.bass
  while (bass < 40) bass += 12
  while (bass > 52) bass -= 12
  hits.push({
    time: place(0, 'bass', rng, input.humanize),
    part: 'bass',
    midi: bass,
    velocity: 0.84,
    duration: beatSec * 2.5,
    pan: 0,
  })
  if (input.style === 'ballad') {
    hits.push({ time: 0, part: 'drums', drum: 'brushTap', velocity: 0.46, duration: 0.08, pan: 0.08 })
    hits.push({ time: 0, part: 'drums', drum: 'brushSwirl', velocity: 0.4, duration: beatSec * 2, pan: 0 })
  } else if (input.style === 'bossa') {
    hits.push({ time: 0, part: 'drums', drum: 'kick', velocity: 0.42, duration: 0.2, pan: 0 })
    hits.push({ time: 0, part: 'drums', drum: 'sidestick', velocity: 0.36, duration: 0.14, pan: 0.16 })
  } else {
    hits.push({
      time: place(0, 'kick', rng, input.humanize),
      part: 'drums',
      drum: 'kick',
      velocity: 0.5,
      duration: 0.24,
      pan: 0,
    })
    hits.push({
      time: place(0, 'ride', rng, input.humanize),
      part: 'drums',
      drum: 'crash',
      velocity: 0.4,
      duration: 0,
      pan: 0.12,
    })
  }
  return hits
}

/**
 * So What head theme. HEAD choruses only, including the out-head when the
 * loop is 2 choruses (the last chorus is a head, not a solo).
 */
export function isSoWhatHead(tune: Tune, playingMode: PlayingMode): boolean {
  return tune.id === 'so-what' && playingMode === 'HEAD'
}

/**
 * Kind of Blue bass call and the piano answer (Bill Evans quartal voicing).
 * Call bar, beats in the bar (0 = downbeat):
 *   rest, 1& D2, 2 A2, 2& B2, 3 C3, 3& D3, 4 E3, 4& C3 (weaker; Db3 on the bridge).
 * Response bar: D3 on beat 1, held. Piano on beat 3 (E-A-D-G-B) and 4& (D-G-C-F-A).
 * The bridge (Ebm7, bars 17–24) is the same pattern one semitone higher.
 * There is no horn sample in the FluidR3 subset, so the answer stays on piano.
 */
export function soWhatHeadNotes(
  barIndex: number,
  transpose: number,
  activeSection?: string,
): {
  bass: { beat: number; midi: number; beats: number; vel: number }[]
  chords: { beat: number; notes: number[]; vel: number; durationBeats: number }[]
} {
  const isEb = activeSection === 'B' || (barIndex >= 16 && barIndex < 24)
  const semitones = transpose + (isEb ? 1 : 0)
  const cycleBar = barIndex % 2

  if (cycleBar === 0) {
    return {
      bass: [
        { beat: 0.5, midi: 38 + semitones, beats: 0.42, vel: 0.84 },
        { beat: 1.0, midi: 45 + semitones, beats: 0.42, vel: 0.86 },
        { beat: 1.5, midi: 47 + semitones, beats: 0.42, vel: 0.86 },
        { beat: 2.0, midi: 48 + semitones, beats: 0.42, vel: 0.88 },
        { beat: 2.5, midi: 50 + semitones, beats: 0.42, vel: 0.88 },
        { beat: 3.0, midi: 52 + semitones, beats: 0.42, vel: 0.9 },
        { beat: 3.5, midi: 48 + semitones, beats: 0.4, vel: 0.72 },
      ],
      chords: [],
    }
  }

  // Last answer of each 8-bar section sits a little under the others.
  const sectionEnd = barIndex % 8 === 7
  const answerTrim = sectionEnd ? 0.63 : 1
  return {
    bass: [{ beat: 0.0, midi: 50 + semitones, beats: 2.2, vel: 0.9 }],
    chords: [
      { beat: 2.0, notes: [52, 57, 62, 67, 71].map((n) => n + semitones), vel: 0.9 * answerTrim, durationBeats: 0.85 },
      { beat: 3.5, notes: [50, 55, 60, 65, 69].map((n) => n + semitones), vel: 0.94 * answerTrim, durationBeats: 0.7 },
    ],
  }
}

function addSoWhatHead(
  hits: Hit[],
  o: {
    barIndex: number
    form: number
    transpose: number
    beatSec: number
    ratio: number
    rng: () => number
    humanize: boolean
    shape: MusicalShape
    userDrums: boolean
    drumSolo: boolean
  },
): void {
  const isEb = o.barIndex >= 16 && o.barIndex < 24
  const head = soWhatHeadNotes(o.barIndex, o.transpose, isEb ? 'B' : 'A')

  // Bass notes
  for (const b of head.bass) {
    const when = swungBeatOffset(b.beat, o.beatSec, o.ratio)
    hits.push({
      time: place(when, 'bass', o.rng, o.humanize),
      part: 'bass',
      midi: b.midi,
      velocity: humanVelocity(b.vel, o.rng, o.humanize),
      duration: b.beats * o.beatSec,
      pan: -0.15,
    })
  }

  // Piano response chords
  for (const c of head.chords) {
    const when = swungBeatOffset(c.beat, o.beatSec, o.ratio)
    c.notes.forEach((midi, i) => {
      hits.push({
        time: place(when, 'piano', o.rng, o.humanize) + i * 0.0035,
        part: 'piano',
        midi,
        velocity: humanVelocity(c.vel, o.rng, o.humanize),
        duration: c.durationBeats * o.beatSec * 0.92,
        pan: -0.22,
      })
    })
  }

  // Drum catches on the two response hits (Beat 3 and Beat 4&)
  if (!o.userDrums && !o.drumSolo && head.chords.length > 0) {
    for (const c of head.chords) {
      const when = swungBeatOffset(c.beat, o.beatSec, o.ratio)
      hits.push({
        time: place(when, 'snare', o.rng, o.humanize),
        part: 'drums',
        drum: 'sidestick',
        velocity: humanVelocity(0.48, o.rng, o.humanize),
        duration: 0.12,
        pan: 0.16,
      })
    }
  }
}

/** Intro: the same bass call, no piano answer. Drums are the normal head groove. */
function addSoWhatIntro(
  hits: Hit[],
  o: {
    barIndex: number
    transpose: number
    beatSec: number
    ratio: number
    rng: () => number
    humanize: boolean
  },
): void {
  const head = soWhatHeadNotes(o.barIndex, o.transpose, 'A')
  for (const b of head.bass) {
    const when = swungBeatOffset(b.beat, o.beatSec, o.ratio)
    hits.push({
      time: place(when, 'bass', o.rng, o.humanize),
      part: 'bass',
      midi: b.midi,
      velocity: humanVelocity(b.vel, o.rng, o.humanize),
      duration: b.beats * o.beatSec,
      pan: -0.15,
    })
  }
}
