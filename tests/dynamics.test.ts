import { describe, expect, it } from 'vitest'
import { chorusRole, musicalShape, passCompleted, stepRepeats } from '../src/dynamics.ts'
import { DEFAULT_DRUM_MIX } from '../src/session.ts'
import { arrangeBar } from '../src/arrange.ts'
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

describe('dynamics', () => {
  it('keeps the head quieter than a later chorus, then settles the out-head', () => {
    const head = shape({ chorus: 0, barIndex: 0 })
    const built = shape({ chorus: 1, barIndex: 0 })
    expect(built.level).toBeGreaterThan(head.level)
    expect(chorusRole(0, 4)).toBe('head')
    expect(chorusRole(2, 4)).toBe('shout')
    expect(chorusRole(3, 4)).toBe('out')
    const outTop = shape({ chorus: 3, barIndex: 0, repeats: 4 })
    const outEnd = shape({ chorus: 3, barIndex: 11, repeats: 4 })
    expect(outTop.level).toBeGreaterThan(outEnd.level)
  })

  it('builds through a phrase and drops back when the player is trading', () => {
    const top = shape({ barIndex: 0 })
    const turnaround = shape({ barIndex: 3 })
    const phraseEnd = shape({ barIndex: 7 })
    expect(turnaround.level).toBeGreaterThan(top.level)
    expect(phraseEnd.level).toBeGreaterThan(turnaround.level)
    const band = shape({ chorus: 1, bandTurn: true, barInTurn: 3 })
    const yours = shape({ chorus: 1, userTurn: true, barInTurn: 1 })
    expect(yours.level).toBeLessThan(band.level)
    expect(yours.density).toBeLessThan(band.density)
  })

  it('orders the fixed intensities', () => {
    const low = shape({ mode: 'low' })
    const med = shape({ mode: 'med' })
    const high = shape({ mode: 'high' })
    expect(low.level).toBeLessThan(med.level)
    expect(med.level).toBeLessThan(high.level)
    expect(low.density).toBeLessThan(high.density)
  })

  it('makes a two-chorus blues louder on the second chorus, with a real button', () => {
    const tune = findTune('jazz-blues-f')!
    const level = (chorus: number, bar: number) => {
      const hits = arrangeBar({
        tune,
        barIndex: bar,
        chorus,
        playBar: chorus * 12 + bar,
        bpm: 132,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: false,
        dynamics: 'auto',
        repeats: 2,
      })
      const ride = hits.filter((hit) => hit.drum === 'ride' || hit.drum === 'rideBell')
      return ride.reduce((sum, hit) => sum + hit.velocity, 0) / ride.length
    }
    expect(level(1, 4)).toBeGreaterThan(level(0, 4))
  })
})

describe('drum mix', () => {
  it('ships the ride several dB under unity and the snare and kick a little above', () => {
    const rideDb = 20 * Math.log10(DEFAULT_DRUM_MIX.ride)
    expect(rideDb).toBeLessThan(-4)
    expect(rideDb).toBeGreaterThan(-6.5)
    expect(DEFAULT_DRUM_MIX.snare).toBeGreaterThan(1)
    expect(DEFAULT_DRUM_MIX.kick).toBeGreaterThan(1)
    expect(DEFAULT_DRUM_MIX.hat).toBeGreaterThan(DEFAULT_DRUM_MIX.ride)
  })
})
