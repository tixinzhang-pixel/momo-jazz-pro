import {
  DYNAMICS_CONFIG,
  dbToGain,
  type FillsMode,
  type PlayingMode,
} from './engine/dynamicsConfig.ts'

export type DynamicsMode = 'auto' | 'low' | 'med' | 'high'

export type ChorusRole = 'head' | 'build' | 'shout' | 'out'

export type SetupStrength = 'none' | 'light' | 'medium' | 'strong'

export interface ShapeInput {
  mode: DynamicsMode
  chorus: number
  barIndex: number
  form: number
  /** null means keep going. A number is how many times the region is played. */
  repeats: number | null
  section: string
  userTurn: boolean
  handoff: boolean
  bandTurn: boolean
  barInTurn: number
  pianoSolo?: boolean
  fillsMode?: FillsMode
}

export interface MusicalShape {
  /** Overall band/drum level multiplier (backward-compatible). */
  level: number
  /** Below ~0.7, ghost notes and extra piano attacks drop out. */
  density: number
  role: ChorusRole | 'fixed'
  /** v0.3 A1 playing mode: HEAD vs SOLO. */
  playingMode: PlayingMode
  /** Soloist block index (0-based) when in SOLO mode. */
  soloBlock: number
  /** Chorus index within the 2-chorus soloist block (0 or 1). */
  chorusInBlock: 0 | 1
  /** True on chorus > 0 when a new 2-chorus soloist block starts. */
  isNewSoloBlock: boolean
  /** Setup strength in the last 2 beats of the bar (A3). */
  setupStrength: SetupStrength
  /** Per-voice linear gain multipliers computed from DYNAMICS_CONFIG dB offsets. */
  drumBusGain: number
  rideGain: number
  snareCompGain: number
  hatGain: number
  kickSetupGain: number
  snareSetupGain: number
  bassGain: number
  pianoGain: number
}

/**
 * A1: Determine HEAD vs SOLO playing mode.
 * - HEAD applies to the first chorus and the last chorus when loop count >= 3.
 * - When loop count is 2, only chorus 1 (index 0) is HEAD.
 * - When loop count is 1, HEAD is used.
 * - SOLO applies to all other choruses.
 */
/** Solo tempo nudge. Off unless `tempo.pushInSolosDefault` is set; the ratio is `pushInSolosRatio`. */
export function effectiveBpm(bpm: number, mode: PlayingMode, dynamics: DynamicsMode): number {
  if (dynamics !== 'auto' || mode !== 'SOLO') return bpm
  if (!DYNAMICS_CONFIG.tempo.pushInSolosDefault) return bpm
  return bpm * DYNAMICS_CONFIG.tempo.pushInSolosRatio
}

export function playingModeAt(chorus: number, repeats: number | null): PlayingMode {
  if (repeats != null && repeats <= 1) return 'HEAD'
  if (chorus <= 0) return 'HEAD'
  // Two choruses is head + out-head. The theme plays on both, never a solo chorus.
  if (repeats != null && repeats >= 2 && chorus >= repeats - 1) return 'HEAD'
  return 'SOLO'
}

export function chorusRole(chorus: number, repeats: number | null): ChorusRole {
  if (repeats != null && repeats <= 1) return 'head'
  if (chorus <= 0) return 'head'
  if (repeats == null) return chorus >= 3 ? 'shout' : 'build'
  if (chorus >= repeats - 1) return 'out'
  if (chorus === repeats - 2) return 'shout'
  return 'build'
}

/** True once `completed` full passes of the loop (or the form) have been played. */
export function passCompleted(completed: number, repeats: number | null): boolean {
  return repeats != null && completed >= repeats
}

/** Step the 1–30 counter. From ∞, either button lands on 4. 一直 is a separate toggle. */
export function stepRepeats(current: number | null, dir: -1 | 1): number | null {
  if (current == null) return 4
  const next = current + dir
  if (next > 30) return 30
  if (next < 1) return 1
  return next
}

/**
 * A3: Determine section boundary setup strength for the current bar.
 * For a 32-bar chorus (1-based bars):
 * - Bars 4, 12, 20, 28 -> 'none' (unless fillsMode === 'every4')
 * - Bar 8 -> 'light' (drum bus +1-2 dB in beats 3-4)
 * - Bar 16 -> 'medium' (drums +3 dB, snare +6 dB in last 2 beats)
 * - Bar 24 & Bar 32 -> 'strong' (drums +6-8 dB, snare +12-16 dB, kick +7-11 dB in last 2 beats)
 * For other forms (e.g. 12-bar blues, 16-bar tune), apply the same idea by phrase position:
 * - Strong setup into the last phrase and into the next chorus
 * - Medium at the form midpoint
 * - No fills at 4-bar points by default in 'section' mode.
 */
export function setupStrengthAt(
  barIndex: number,
  form: number,
  fillsMode: FillsMode = 'section',
): SetupStrength {
  if (fillsMode === 'off') return 'none'
  const bar1 = barIndex + 1 // 1-based bar number

  if (form === 32) {
    if (bar1 === 24 || bar1 === 32) return 'strong'
    if (bar1 === 16) return 'medium'
    if (bar1 === 8) return 'light'
    if (fillsMode === 'every4' && bar1 % 4 === 0) return 'light'
    return 'none'
  }

  if (form === 12) {
    // 12-bar blues: bar 12 is chorus end (strong), bar 8 is into last phrase (strong), bar 4 is midpoint/first phrase end (medium)
    if (bar1 === 12 || bar1 === 8) return 'strong'
    if (bar1 === 4) return fillsMode === 'every4' ? 'medium' : 'light'
    return 'none'
  }

  if (form === 16) {
    if (bar1 === 16 || bar1 === 12) return 'strong'
    if (bar1 === 8) return 'medium'
    if (bar1 === 4) return fillsMode === 'every4' ? 'light' : 'none'
    return 'none'
  }

  // Generic form scaling
  if (bar1 === form) return 'strong'
  const threeQuarters = Math.round((form * 3) / 4)
  const half = Math.round(form / 2)
  const quarter = Math.round(form / 4)
  if (bar1 === threeQuarters) return 'strong'
  if (bar1 === half) return 'medium'
  if (bar1 === quarter) return 'light'
  if (fillsMode === 'every4' && bar1 % 4 === 0) return 'light'
  return 'none'
}

export function musicalShape(input: ShapeInput): MusicalShape {
  const cfg = DYNAMICS_CONFIG
  const role = input.mode === 'auto' ? chorusRole(input.chorus, input.repeats) : 'fixed'
  const playingMode: PlayingMode = playingModeAt(input.chorus, input.repeats)

  // Soloist block math (A2): SOLO starts at chorus 1 (0-based index 1)
  const soloChorusIndex = Math.max(0, input.chorus - 1)
  const soloBlock = Math.floor(soloChorusIndex / cfg.blocks.chorusesPerBlock)
  const chorusInBlock = (soloChorusIndex % cfg.blocks.chorusesPerBlock) as 0 | 1
  const isNewSoloBlock = playingMode === 'SOLO' && chorusInBlock === 0 && input.chorus >= 1

  let drumBusDb = 0
  let rideDb = 0
  let snareCompDb = 0
  let hatDb = 0
  let density = 0.78

  if (input.mode === 'auto') {
    if (playingMode === 'HEAD') {
      // A1: HEAD mode
      drumBusDb = cfg.modes.head.drumBusDbOffset // -4.5 dB below SOLO average
      rideDb = cfg.modes.head.rideDbOffset // -8.0 dB below SOLO ride
      snareCompDb = cfg.modes.head.snareCompDbOffset // 0 dB base
      hatDb = cfg.modes.head.hatDbOffset
      density = 0.54

      // A2: Final chorus (out-head) settles 1-2 dB lower for the last 4 bars before ending chord
      if (role === 'out' && input.barIndex >= Math.max(0, input.form - 4)) {
        drumBusDb += cfg.blocks.outHeadLast4BarsDb
        rideDb += cfg.blocks.outHeadLast4BarsDb
        snareCompDb += cfg.blocks.outHeadLast4BarsDb
        density = 0.44
      }
    } else {
      // SOLO blocks. The bus is anchored to the v0.3.1 head (-4.5), then trimmed,
      // so raising the HEAD bus does not also raise the solos.
      const inBlockBusDb = chorusInBlock === 1 ? cfg.blocks.secondChorusDrumBusDb : 0
      const blockBase = (block: number) =>
        Math.min(
          cfg.blocks.maxDrumBusOverHeadDb - cfg.blocks.secondChorusDrumBusDb,
          3.2 + block * cfg.blocks.newBlockStepDb,
        )
      let totalOverHeadDb = Math.min(cfg.blocks.maxDrumBusOverHeadDb, blockBase(soloBlock) + inBlockBusDb)
      if (soloBlock > 0) {
        const prevPeak = Math.min(
          cfg.blocks.maxDrumBusOverHeadDb,
          blockBase(soloBlock - 1) + cfg.blocks.secondChorusDrumBusDb,
        )
        // newBlockDropDb is the drop from the previous block's peak. The second
        // chorus of the new block steps up from that dropped start.
        totalOverHeadDb = Math.min(
          cfg.blocks.maxDrumBusOverHeadDb,
          prevPeak + cfg.blocks.newBlockDropDb + inBlockBusDb,
        )
      }

      drumBusDb = -4.5 + totalOverHeadDb + cfg.modes.solo.drumBusDbOffset
      // Hold the ride at the in-block peak on a new block so the bus drop is the
      // ride drop, instead of stacking a full ride reset on top of it.
      const rideStep = soloBlock > 0 || chorusInBlock === 1 ? cfg.blocks.secondChorusRideDb : 0
      rideDb = cfg.modes.solo.rideDbOffset + rideStep

      const blockBaseSnareDb = Math.min(
        cfg.modes.solo.snareCompPeakDb - cfg.blocks.secondChorusSnareDb,
        cfg.modes.solo.snareCompBlock1Db + soloBlock * cfg.blocks.newBlockSnareStepDb,
      )
      snareCompDb = blockBaseSnareDb + (chorusInBlock === 1 ? cfg.blocks.secondChorusSnareDb : 0)
      if (soloBlock > 0) snareCompDb += cfg.blocks.newBlockStepDb
      hatDb = cfg.modes.solo.hatDbOffset
      density = Math.min(0.98, 0.76 + soloBlock * 0.06 + chorusInBlock * 0.08)
    }
  } else {
    // Fixed modes (low / med / high): keep HEAD vs SOLO playing mode distinction (spec A3) with constant block levels
    const overHead = cfg.blocks.fixedModeOverHeadDb[input.mode]
    if (playingMode === 'HEAD') {
      drumBusDb = cfg.modes.head.drumBusDbOffset + (input.mode === 'high' ? 1.5 : input.mode === 'med' ? 0.8 : 0)
      rideDb = cfg.modes.head.rideDbOffset
      snareCompDb = cfg.modes.head.snareCompDbOffset
      hatDb = cfg.modes.head.hatDbOffset
      density = input.mode === 'high' ? 0.68 : input.mode === 'med' ? 0.58 : 0.45
    } else {
      drumBusDb = cfg.modes.head.drumBusDbOffset + overHead
      if (input.mode === 'low') {
        rideDb = cfg.modes.solo.rideDbOffset
        snareCompDb = cfg.modes.solo.snareCompBlock1Db
        hatDb = 0
        density = 0.65
      } else if (input.mode === 'med') {
        rideDb = cfg.modes.solo.rideDbOffset
        snareCompDb = cfg.modes.solo.snareCompBlock1Db + 2.0
        hatDb = 0
        density = 0.78
      } else {
        rideDb = cfg.modes.solo.rideDbOffset + cfg.blocks.secondChorusRideDb
        snareCompDb = cfg.modes.solo.snareCompPeakDb * 0.8
        hatDb = 0
        density = 0.96
      }
    }
  }

  // Optional "quiet soloist" block for piano solo in trading (A2)
  if (input.pianoSolo) {
    drumBusDb += cfg.blocks.quietSoloist.drumBusDb
    snareCompDb += cfg.blocks.quietSoloist.snareCompDb
    rideDb += cfg.blocks.quietSoloist.rideDb
    density = Math.min(density, 0.5)
  }

  // A3: Early bars (bars 2-15 in a 32-bar chorus, i.e. barIndex 1..14) are the quietest part of the chorus
  const bar1 = input.barIndex + 1
  const isEvery4FillBar = input.fillsMode === 'every4' && bar1 % 4 === 0
  if (input.form >= 24 && bar1 >= 2 && bar1 <= 15 && bar1 !== 8 && !isEvery4FillBar) {
    snareCompDb += cfg.sections.earlyBarsQuietSnareDb
    drumBusDb += cfg.sections.earlyBarsQuietDrumBusDb
  } else if (input.form < 24 && bar1 >= 2 && bar1 <= Math.floor(input.form * 0.45) && bar1 % 4 !== 0 && !isEvery4FillBar) {
    snareCompDb += cfg.sections.earlyBarsQuietSnareDb * 0.65
    drumBusDb += cfg.sections.earlyBarsQuietDrumBusDb * 0.65
  }

  // A3: Bridge lift (bars 17-24 or B/C section): +1-3 dB on drum bus, slightly denser comping
  const isBridge =
    input.section === 'B' ||
    input.section === 'C' ||
    (input.form === 32 && bar1 >= 17 && bar1 <= 24)
  if (isBridge) {
    drumBusDb += cfg.sections.bridgeLift.drumBusDb
    density = Math.min(1, density * cfg.sections.bridgeLift.compDensityMultiplier)
  }

  // A3: Section setups (applied to the last 2 beats of the bar in arrange.ts, and reflected in bar shape)
  const setupStrength = setupStrengthAt(input.barIndex, input.form, input.fillsMode ?? 'section')
  let setupDrumDb = 0
  let setupSnareDb = 0
  let setupKickDb = 0
  if (setupStrength === 'light') {
    setupDrumDb = cfg.sections.bar8Setup.drumBusDb
    setupSnareDb = cfg.sections.bar8Setup.snareDb
    setupKickDb = cfg.sections.bar8Setup.kickDb
  } else if (setupStrength === 'medium') {
    setupDrumDb = cfg.sections.bar16Setup.drumBusDb
    setupSnareDb = cfg.sections.bar16Setup.snareDb
    setupKickDb = cfg.sections.bar16Setup.kickDb
  } else if (setupStrength === 'strong') {
    setupDrumDb = cfg.sections.strongSetup.drumBusDb
    setupSnareDb = cfg.sections.strongSetup.snareDb
    setupKickDb = cfg.sections.strongSetup.kickDb
  }

  // Theme fills attenuation (spec A1/A3 table: theme fills reduce ~8 dB)
  if (playingMode === 'HEAD' && setupStrength !== 'none') {
    setupDrumDb += cfg.modes.head.headFillDbAttenuation
    setupSnareDb += cfg.modes.head.headFillDbAttenuation
    setupKickDb += cfg.modes.head.headFillDbAttenuation
  }

  // A6: Piano follows block intensity at reduced dB change of drums (spec: ~2 dB solo-head)
  const drumDeltaOverHeadDb = Math.max(0, drumBusDb - cfg.modes.head.drumBusDbOffset)
  let pianoDb = drumDeltaOverHeadDb * cfg.piano.blockIntensityFollowRatio - 0.5

  // A5: Bass level stays flat across the whole tune (max +-2 dB between HEAD and SOLO peak)
  let bassDb = Math.max(
    -cfg.bass.headToSoloMaxDiffDb,
    Math.min(cfg.bass.headToSoloMaxDiffDb, drumDeltaOverHeadDb * 0.15),
  )

  // A7: Trading refinements
  if (input.userTurn) {
    if (input.handoff) {
      drumBusDb += cfg.trading.userTurnOverallDb * 0.5
      snareCompDb += cfg.trading.userTurnSnareDb * 0.5
      rideDb += cfg.trading.userTurnRideDb * 0.5
      pianoDb += cfg.trading.userTurnPianoDb * 0.5
      density *= 0.72
    } else {
      drumBusDb += cfg.trading.userTurnOverallDb
      snareCompDb += cfg.trading.userTurnSnareDb
      rideDb += cfg.trading.userTurnRideDb
      pianoDb += cfg.trading.userTurnPianoDb
      bassDb += cfg.trading.userTurnBassDb // 0 dB: bass stays at normal level
      density *= 0.38
    }
  } else if (input.bandTurn && !input.pianoSolo) {
    const step = Math.min(Math.max(input.barInTurn, 0), 7)
    drumBusDb += -1.0 + step * 0.35
    density = Math.min(1, density * (0.85 + step * 0.03))
  }

  // Backward-compatible scalar `level` reflecting overall band/drum contour + phrase arch
  const phrase = phraseFactor(input.barIndex)
  const phraseWeight = input.mode === 'auto' ? 0.5 : 0.25
  const baseLevel = dbToGain(drumBusDb) * 0.92 * (1 + (phrase - 1) * phraseWeight)

  return {
    level: clamp(baseLevel, 0.32, 1.35),
    density: clamp(density, 0.22, 1),
    role,
    playingMode,
    soloBlock,
    chorusInBlock,
    isNewSoloBlock,
    setupStrength,
    drumBusGain: clamp(dbToGain(drumBusDb), 0.25, 1.8),
    rideGain: clamp(dbToGain(drumBusDb + rideDb + cfg.voicing.rideExtraAttenuationDb), 0.12, 1.5),
    snareCompGain: clamp(dbToGain(drumBusDb + snareCompDb * 0.55), 0.1, 2.2),
    hatGain: clamp(dbToGain(drumBusDb + hatDb), 0.04, 1.5),
    kickSetupGain: clamp(dbToGain(setupDrumDb + setupKickDb * 0.65), 0.5, 3.2),
    snareSetupGain: clamp(dbToGain(setupDrumDb + setupSnareDb * 0.65), 0.5, 8),
    bassGain: clamp(dbToGain(bassDb), 0.82, 1.18),
    pianoGain: clamp(dbToGain(pianoDb), 0.45, 1.45),
  }
}

/** Relax at the top of a phrase, lean into the end of each 4 and the end of each 8. */
export function phraseFactor(barIndex: number): number {
  const in8 = ((barIndex % 8) + 8) % 8
  const in4 = in8 % 4
  if (in8 === 0) return 0.9
  if (in8 === 7) return 1.12
  if (in4 === 3) return 1.08
  if (in4 === 0) return 0.94
  return 1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
