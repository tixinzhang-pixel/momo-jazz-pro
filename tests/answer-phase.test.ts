import { describe, expect, it } from 'vitest'
import { arrangeBar, clearMusicCache } from '../src/arrange.ts'
import { findTune } from '../src/data/tunes.ts'
import { barSwingFraction, eighthOffset, pocketBias } from '../src/feel.ts'

const beat = 60 / 136

function barHits(bar: number) {
  clearMusicCache()
  const tune = findTune('so-what')!
  return arrangeBar({
    tune,
    barIndex: bar,
    chorus: 0,
    playBar: bar,
    bpm: 136,
    style: 'swing',
    transpose: 0,
    trade: null,
    click: 'off',
    humanize: false,
    repeats: 6,
  })
}

function answerStart(bar: number) {
  const ratio = barSwingFraction(136, 'swing', bar, 0, null, '8ths')
  const hits = barHits(bar)
  const piano = hits.filter((hit) => hit.part === 'piano').map((hit) => hit.time)
  const expectAt = eighthOffset(4, beat, ratio) + pocketBias('ride')
  const rides = hits.filter((hit) => hit.drum === 'ride')
  const near = rides.filter((hit) => Math.abs(hit.time - expectAt) <= 0.03)
  return { start: Math.min(...piano), expectAt, ride: near[0]?.time }
}

describe('theme bars 1-16 answer phase', () => {
  it('locks the answer attack to the ride on beat 3 when that ride is present', () => {
    for (const bar of [1, 3, 5, 9, 11, 13]) {
      const { start, ride } = answerStart(bar)
      expect(ride).toBeDefined()
      expect(start).toBeCloseTo(ride!, 4)
    }
  })

  it('leaves the answer after bar 16 on its own layback', () => {
    const { start, ride } = answerStart(17)
    expect(ride).toBeDefined()
    expect(Math.abs(start - ride!)).toBeGreaterThan(0.003)
  })

  it('gives the theme short chord a louder top voice without moving the notes', () => {
    const split = 2.7 * beat
    const top = (bar: number, chord: 1 | 2) => {
      const group = barHits(bar)
        .filter((hit) => hit.part === 'piano')
        .filter((hit) => (chord === 1 ? hit.time < split : hit.time >= split))
      const lead = [...group].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0)).at(-1)
      return (lead?.velocity ?? 0) * 127
    }
    for (const bar of [1, 3, 5, 9, 11, 13]) {
      expect(top(bar, 2) - top(bar, 1)).toBeGreaterThanOrEqual(4)
    }
    expect(Math.abs(top(17, 2) - top(17, 1))).toBeLessThan(4)
    const once = barHits(1).filter((hit) => hit.part === 'piano').map((hit) => hit.time)
    const twice = barHits(1).filter((hit) => hit.part === 'piano').map((hit) => hit.time)
    expect(twice).toEqual(once)
  })
})
