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
  sixteenthOffset,
  swingRatio,
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

const walkCache = new Map<string, BassNote[]>()
const voiceCache = new Map<string, number[]>()

export function clearMusicCache(): void {
  walkCache.clear()
  voiceCache.clear()
}

export function fillKind(
  barIndex: number,
  form: number,
  style: StyleId,
  chorus: number,
  fillsMode: FillsMode = 'section',
): 'none' | 'short' | 'medium' | 'big' {
  if (fillsMode === 'off') return 'none'
  if (style === 'bossa' || style === 'ballad') return barIndex === form - 1 ? 'short' : 'none'

  if (fillsMode === 'every4') {
    if (barIndex === form - 1) return 'big'
    if ((barIndex + 1) % 8 === 0) return 'medium'
    if ((barIndex + 1) % 4 === 0) {
      const roll = (barIndex * 3 + chorus * 5) % 5
      return roll < 3 ? 'short' : 'none'
    }
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
  const ratio = swingRatio(bpm, style, swingRatioOverride, subdivision)
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
    })
  }

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
  if (shape.density < 0.68) {
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

    hit.velocity = Math.min(1, Math.max(0.02, hit.velocity * gain))
  }
}

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
      time: place(sixteenthOffset(sixteenth, o.beatSec, o.subRatio), pocket, o.rng, o.humanize),
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
    for (const ev of chosen) {
      push(ev.eighth, ev.drum, ev.vel, ev.drum === 'kick' ? 0.22 : 0.3)
    }
    // Anticipate crash on 4& into a new soloist block
    if (o.nextBarNewBlock && (o.barIndex + o.chorus) % 3 === 0) {
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
    // A1 HEAD: Timekeeping is mostly hi-hat (foot on 2 & 4 + light stick on closed hat), with light ride
    return [
      { eighth: 0, drum: 'ride', vel: q13 },
      { eighth: 2, drum: 'hatClosed', vel: 0.34 },
      { eighth: 3, drum: 'ride', vel: skipVel },
      { eighth: 4, drum: 'ride', vel: q13 * 0.95 },
      { eighth: 6, drum: 'hatClosed', vel: 0.36 },
      { eighth: 7, drum: 'ride', vel: skipVel * 0.95 },
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
  const idx = (bar + chorus * 3) % HEAD_SNARE_CELLS.length
  if (playingMode === 'HEAD') {
    return HEAD_SNARE_CELLS[idx]
  }
  if (bpm > DYNAMICS_CONFIG.voicing.snareComping.fastTempoThresholdBpm) {
    return FAST_SOLO_SNARE_CELLS[(bar + chorus * 5) % FAST_SOLO_SNARE_CELLS.length]
  }
  return MED_SOLO_SNARE_CELLS[idx]
}

const ACC = DYNAMICS_CONFIG.voicing.snareComping.accentBaseVel
const GHOST = ACC * dbToGain(DYNAMICS_CONFIG.voicing.snareComping.ghostNoteAttenuationDb)

// HEAD cells: average ~2.25 hits per bar (2 to 3 hits)
const HEAD_SNARE_CELLS: DrumEv[][] = [
  [{ eighth: 3, drum: 'sidestick', vel: ACC }, { eighth: 7, drum: 'snare', vel: GHOST }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }, { eighth: 7, drum: 'snare', vel: GHOST }],
  [{ eighth: 3, drum: 'sidestick', vel: ACC }, { eighth: 6, drum: 'sidestick', vel: ACC * 0.92 }],
  [{ eighth: 1, drum: 'snare', vel: GHOST }, { eighth: 3, drum: 'sidestick', vel: ACC }],
  [{ eighth: 4, drum: 'sidestick', vel: ACC * 0.95 }, { eighth: 7, drum: 'snare', vel: GHOST }],
  [{ eighth: 2, drum: 'snare', vel: GHOST }, { eighth: 5, drum: 'sidestick', vel: ACC }, { eighth: 7, drum: 'sidestick', vel: ACC * 0.9 }],
  [{ eighth: 3, drum: 'sidestick', vel: ACC }, { eighth: 7, drum: 'sidestick', vel: ACC * 0.94 }],
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
  [{ eighth: 6, drum: 'snare', vel: 0.56, setup: true }, { eighth: 7, drum: 'snare', vel: 0.78, setup: true }],
  [{ eighth: 6, drum: 'kick', vel: 0.62, setup: true }, { eighth: 7, drum: 'snare', vel: 0.8, setup: true }],
  [{ eighth: 6, drum: 'tomL', vel: 0.58, setup: true }, { eighth: 7, drum: 'tomM', vel: 0.74, setup: true }],
  [{ eighth: 6, drum: 'sidestick', vel: 0.52, setup: true }, { eighth: 7, drum: 'snare', vel: 0.76, setup: true }],
]
const MEDIUM: DrumEv[][] = [
  [
    { eighth: 4, drum: 'snare', vel: 0.52, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.64, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.66, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.86, setup: true },
  ],
  [
    { eighth: 4, drum: 'tomL', vel: 0.6, setup: true },
    { eighth: 5, drum: 'tomM', vel: 0.68, setup: true },
    { eighth: 6, drum: 'tomH', vel: 0.76, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.88, setup: true },
  ],
  [
    { eighth: 4, drum: 'kick', vel: 0.62, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.58, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.72, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.86, setup: true },
  ],
]
const BIG: DrumEv[][] = [
  [
    { eighth: 4, drum: 'snare', vel: 0.68, setup: true },
    { eighth: 5, drum: 'kick', vel: 0.78, setup: true },
    { eighth: 6, drum: 'snare', vel: 0.88, setup: true },
    { eighth: 7, drum: 'kick', vel: 0.84, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.96, setup: true },
  ],
  [
    { eighth: 4, drum: 'kick', vel: 0.76, setup: true },
    { eighth: 5, drum: 'snare', vel: 0.74, setup: true },
    { eighth: 6, drum: 'kick', vel: 0.84, setup: true },
    { eighth: 6, drum: 'snare', vel: 0.86, setup: true },
    { eighth: 7, drum: 'snare', vel: 0.96, setup: true },
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
    const baseVel = note.skip
      ? cfg.baseVelocity * dbToGain(cfg.skipNoteAttenuationDb)
      : cfg.baseVelocity
    hits.push({
      time: place(when, 'bass', o.rng, o.humanize),
      part: 'bass',
      midi: note.midi,
      velocity: humanizeDbVel(baseVel, cfg.randomBeatVariationDb, o.rng, o.humanize),
      duration: note.beats * o.beatSec * (o.style === 'ballad' ? 1 : 0.92),
      pan: 0,
    })
  }
}

function ensureBass(tune: Tune, style: StyleId, transpose: number, chorus: number, bar: number): BassNote[] {
  const key = `${tune.id}|${style}|${transpose}|${chorus}|${bar}`
  const hit = walkCache.get(key)
  if (hit) return hit
  let c = 0
  let b = 0
  let prev: number | null = null
  let last: BassNote[] = []
  while (c < chorus || (c === chorus && b <= bar)) {
    const k = `${tune.id}|${style}|${transpose}|${c}|${b}`
    const existing = walkCache.get(k)
    if (existing) {
      prev = existing[existing.length - 1]?.midi ?? prev
      last = existing
    } else {
      const rng = mulberry32(hashString(`${k}|walk`))
      const notes = bassLine(tune, style, transpose, b, prev, rng)
      walkCache.set(k, notes)
      prev = notes[notes.length - 1]?.midi ?? prev
      last = notes
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

function bassLine(tune: Tune, style: StyleId, transpose: number, barIndex: number, prev: number | null, rng: () => number): BassNote[] {
  const form = tune.bars.length
  const layout = layoutChords(tune.bars[barIndex], transpose)
  const next = layoutChords(tune.bars[(barIndex + 1) % form], transpose)
  const nextPc = next[0].chord.bass
  if (style === 'bossa') return bossaBass(layout, nextPc, prev, barIndex)
  if (style === 'ballad') return balladBass(layout, nextPc, prev, rng)
  if (style === 'shuffle') return shuffleBass(layout, nextPc, prev, barIndex, rng)
  return swingBass(layout, nextPc, prev, rng)
}

function swingBass(layout: LaidChord[], nextPc: number, prev: number | null, rng: () => number): BassNote[] {
  const notes: BassNote[] = []
  let last = prev
  for (let beat = 0; beat < 4; beat++) {
    const cur = chordAt(layout, beat)
    const prevC = beat > 0 ? chordAt(layout, beat - 1) : null
    const nextC = beat < 3 ? chordAt(layout, beat + 1) : null
    const change = beat === 0 || cur.start !== prevC?.start
    const nextChanges = Boolean(nextC && nextC.start !== cur.start)
    let midi: number
    if (change) {
      midi = nearestPc(cur.chord.bass, last ?? 40 + cur.chord.bass)
      if (last != null && Math.abs(midi - last) > 8) {
        const alt = midi > last ? midi - 12 : midi + 12
        if (alt >= 34 && alt <= 58) midi = alt
      }
      if (last != null && rng() < 0.18) {
        const third = mod(cur.chord.root + guideIntervals(cur.chord.kind)[0])
        const alt = nearestPc(third, last)
        if (Math.abs(alt - last) <= 2) midi = alt
      }
    } else if (nextChanges || beat === 3) {
      const destPc = nextChanges && nextC ? nextC.chord.bass : nextPc
      midi = pickApproach(nearestPc(destPc, last ?? 48), last, rng)
    } else {
      const destPc = nextC ? nextC.chord.bass : nextPc
      midi = pass(last ?? 48, destPc, cur.chord)
    }
    notes.push({ beat, midi, beats: 1 })
    last = midi
  }
  return notes
}

/**
 * Scope B Shuffle bass pattern: boogie/shuffle walking line with swung 8th skip pickups on beats 2& or 4&.
 */
function shuffleBass(
  layout: LaidChord[],
  nextPc: number,
  prev: number | null,
  barIndex: number,
  rng: () => number,
): BassNote[] {
  const base = swingBass(layout, nextPc, prev, rng)
  // Add a swung 8th skip note on beat 1.5 or 3.5 for boogie/shuffle bounce
  const result: BassNote[] = []
  for (const n of base) {
    if (n.beat === 1 || (n.beat === 3 && barIndex % 2 === 0)) {
      result.push({ ...n, beats: 0.65 })
      result.push({ beat: n.beat + 0.5, midi: n.midi, beats: 0.35, skip: true })
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

function pass(start: number, destPc: number, chord: ChordModel): number {
  const dest = nearestPc(destPc, start)
  const ideal = Math.round(start + (dest - start) * 0.55)
  const scale = new Set(chordScale(chord.kind).map((i) => mod(chord.root + i)))
  const tones = new Set(chordTones(chord.kind).map((i) => mod(chord.root + i)))
  let best = Math.min(58, Math.max(34, ideal))
  let bestScore = 99
  const lo = Math.min(start, dest)
  const hi = Math.max(start, dest)
  for (let n = lo; n <= hi; n++) {
    if (n < 34 || n > 58 || n === start) continue
    const pc = mod(n)
    if (!scale.has(pc) && !tones.has(pc)) continue
    const score = Math.abs(n - ideal) + (tones.has(pc) ? 0 : 0.35)
    if (score < bestScore) {
      bestScore = score
      best = n
    }
  }
  return best
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
        time: place(when, 'piano', o.rng, o.humanize) + i * 0.007,
        part: 'piano',
        midi,
        velocity: humanVelocity(
          (o.sparse ? attack.vel * 0.72 : attack.vel) * (i === notes.length - 1 ? 1 : 0.92),
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
    return headCells[(o.barIndex + o.chorus) % headCells.length]
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
  return soloCells[(o.barIndex + o.chorus * 2) % soloCells.length]
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
