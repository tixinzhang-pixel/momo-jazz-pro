import { describe, expect, it } from 'vitest'
import {
  chorusRole,
  musicalShape,
  passCompleted,
  playingModeAt,
  setupStrengthAt,
  stepRepeats,
} from '../src/dynamics.ts'
import { DYNAMICS_CONFIG, gainToDb } from '../src/engine/dynamicsConfig.ts'
import { DEFAULT_DRUM_MIX, defaultMixer } from '../src/session.ts'
import { arrangeBar, shouldCrashBarStart } from '../src/arrange.ts'
import { findTune } from '../src/data/tunes.ts'

const shape = (over: Partial<Parameters<typeof musicalShape>[0]> = {}) =>
  musicalShape({
    mode: 'auto',
    chorus: 0,
    barIndex: 0,
    form: 12,
    repeats: 4,
    section: 'A',
    userTurn: false,
    handoff: false,
    bandTurn: false,
    barInTurn: 0,
    ...over,
  })

describe('repeats', () => {
  it('stops after the chosen number of passes and can stay infinite', () => {
    expect(passCompleted(1, 1)).toBe(true)
    expect(passCompleted(3, 4)).toBe(false)
    expect(passCompleted(4, 4)).toBe(true)
    expect(passCompleted(12, null)).toBe(false)
  })

  it('steps between 1 and 30, and leaves infinity through the 一直 control', () => {
    expect(stepRepeats(null, -1)).toBe(4)
    expect(stepRepeats(null, 1)).toBe(4)
    expect(stepRepeats(1, -1)).toBe(1)
    expect(stepRepeats(30, 1)).toBe(30)
    expect(stepRepeats(4, 1)).toBe(5)
  })
})

describe('v0.3 A1 playing modes (HEAD vs SOLO)', () => {
  it('assigns HEAD to chorus 1 and out-head when repeats >= 3', () => {
    expect(playingModeAt(0, 4)).toBe('HEAD')
    expect(playingModeAt(1, 4)).toBe('SOLO')
    expect(playingModeAt(2, 4)).toBe('SOLO')
    expect(playingModeAt(3, 4)).toBe('HEAD')
  })

  it('assigns HEAD only to chorus 1 when repeats == 2', () => {
    expect(playingModeAt(0, 2)).toBe('HEAD')
    expect(playingModeAt(1, 2)).toBe('SOLO')
  })

  it('assigns HEAD when repeats == 1', () => {
    expect(playingModeAt(0, 1)).toBe('HEAD')
  })

  it('keeps infinite loops in SOLO after chorus 1', () => {
    expect(playingModeAt(0, null)).toBe('HEAD')
    expect(playingModeAt(1, null)).toBe('SOLO')
    expect(playingModeAt(10, null)).toBe('SOLO')
  })

  it('renders drum bus about 3-6 dB lower in HEAD than SOLO', () => {
    const head = shape({ chorus: 0, repeats: 4 })
    const solo = shape({ chorus: 1, repeats: 4 })
    const diffDb = gainToDb(solo.drumBusGain) - gainToDb(head.drumBusGain)
    expect(diffDb).toBeGreaterThanOrEqual(3.0)
    expect(diffDb).toBeLessThanOrEqual(6.5)
  })
})

describe('v0.3 A2 soloist blocks in Auto mode', () => {
  it('steps up intensity inside a 2-chorus block and drops at the start of next block', () => {
    const b0c0 = shape({ chorus: 1, repeats: 8 }) // block 0 chorus 0
    const b0c1 = shape({ chorus: 2, repeats: 8 }) // block 0 chorus 1
    const b1c0 = shape({ chorus: 3, repeats: 8 }) // block 1 chorus 0

    // Inside block: 2nd chorus is +2 to +4 dB over 1st
    const stepInside = gainToDb(b0c1.rideGain) - gainToDb(b0c0.rideGain)
    expect(stepInside).toBeGreaterThanOrEqual(2.0)
    expect(stepInside).toBeLessThanOrEqual(4.5)

    // Next block start drops back from previous peak, but is above previous block start
    expect(gainToDb(b1c0.rideGain)).toBeLessThan(gainToDb(b0c1.rideGain))
    expect(gainToDb(b1c0.rideGain)).toBeGreaterThan(gainToDb(b0c0.rideGain))
  })

  it('maintains constant block level in fixed modes (low / med / high)', () => {
    const medC0 = shape({ mode: 'med', chorus: 1, repeats: 4 })
    const medC1 = shape({ mode: 'med', chorus: 2, repeats: 4 })
    expect(medC0.drumBusGain).toBeCloseTo(medC1.drumBusGain, 2)
  })
})

describe('v0.3 A3 section setups, fills and crashes', () => {
  it('produces section setups at bars 8, 16, 24, 32 in 32-bar form, with none at bar 4', () => {
    expect(setupStrengthAt(3, 32, 'section')).toBe('none') // Bar 4
    expect(setupStrengthAt(7, 32, 'section')).toBe('light') // Bar 8
    expect(setupStrengthAt(11, 32, 'section')).toBe('none') // Bar 12
    expect(setupStrengthAt(15, 32, 'section')).toBe('medium') // Bar 16
    expect(setupStrengthAt(19, 32, 'section')).toBe('none') // Bar 20
    expect(setupStrengthAt(23, 32, 'section')).toBe('strong') // Bar 24
    expect(setupStrengthAt(31, 32, 'section')).toBe('strong') // Bar 32
  })

  it('respects FillsMode: every4 vs off', () => {
    expect(setupStrengthAt(3, 32, 'every4')).toBe('light') // Bar 4 in every4
    expect(setupStrengthAt(7, 32, 'every4')).toBe('light') // Bar 8 is light
    expect(setupStrengthAt(15, 32, 'every4')).toBe('medium') // Bar 16 is medium
    expect(setupStrengthAt(7, 32, 'off')).toBe('none')
    expect(setupStrengthAt(23, 32, 'off')).toBe('none')
    expect(setupStrengthAt(31, 32, 'off')).toBe('none')
  })

  it('crashes on beat 1 of bar 1 only when a new soloist block starts', () => {
    // Chorus 1 is a new soloist block -> crash
    expect(
      shouldCrashBarStart({
        barIndex: 0,
        chorus: 1,
        style: 'swing',
        isNewSoloBlock: true,
        turn: null,
        userDrums: false,
        drumSolo: false,
        pianoSolo: false,
      }),
    ).toBe(true)

    // Chorus 2 is the 2nd chorus of the SAME block -> no crash on bar 1
    expect(
      shouldCrashBarStart({
        barIndex: 0,
        chorus: 2,
        style: 'swing',
        isNewSoloBlock: false,
        turn: null,
        userDrums: false,
        drumSolo: false,
        pianoSolo: false,
      }),
    ).toBe(false)
  })
})

describe('v0.3 A4 & A5 kit balance and bass flatness', () => {
  it('ships drum bus below bass in default mixer', () => {
    const mixer = defaultMixer('bb')
    const busDiffDb = gainToDb(mixer.drums) - gainToDb(mixer.bass)
    // Target: drum bus about -3 dB below bass (spec range -8 to -1 dB)
    expect(busDiffDb).toBeLessThan(-2.0)
    expect(busDiffDb).toBeGreaterThan(-8.0)
  })

  it('ships the ride several dB under unity and the snare and kick a little above', () => {
    const rideDb = gainToDb(DEFAULT_DRUM_MIX.ride)
    expect(rideDb).toBeLessThan(-6.5)
    expect(rideDb).toBeGreaterThan(-10.0)
    expect(DEFAULT_DRUM_MIX.snare).toBeGreaterThan(1)
    expect(DEFAULT_DRUM_MIX.kick).toBeGreaterThan(1)
    expect(DEFAULT_DRUM_MIX.hat).toBeGreaterThan(DEFAULT_DRUM_MIX.ride)
  })

  it('keeps bass level flat across choruses (within +-2 dB)', () => {
    const headBass = shape({ chorus: 0, repeats: 6 }).bassGain
    const peakBass = shape({ chorus: 4, repeats: 6 }).bassGain
    const diffDb = Math.abs(gainToDb(peakBass) - gainToDb(headBass))
    expect(diffDb).toBeLessThanOrEqual(2.0)
  })
})

describe('v0.3 A7 trading dynamics', () => {
  it('drops drum bus ~6 dB and snare ~15 dB while bass stays normal during user turn', () => {
    const bandBar = shape({ chorus: 1, userTurn: false })
    const userBar = shape({ chorus: 1, userTurn: true, handoff: false })

    const busDropDb = gainToDb(bandBar.drumBusGain) - gainToDb(userBar.drumBusGain)
    expect(busDropDb).toBeGreaterThanOrEqual(4.5)
    expect(busDropDb).toBeLessThanOrEqual(7.5)

    const snareDropDb = gainToDb(bandBar.snareCompGain) - gainToDb(userBar.snareCompGain)
    expect(snareDropDb).toBeGreaterThanOrEqual(10.0)

    const bassDiffDb = Math.abs(gainToDb(bandBar.bassGain) - gainToDb(userBar.bassGain))
    expect(bassDiffDb).toBeLessThanOrEqual(0.5)
  })
})
