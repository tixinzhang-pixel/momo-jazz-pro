import { describe, expect, it } from 'vitest'
import {
  defaultSwingRatioR,
  ratioToBeatFraction,
  DYNAMICS_CONFIG,
} from '../src/engine/dynamicsConfig.ts'
import {
  effectiveSwingRatioR,
  eighthOffset,
  sixteenthOffset,
  swingRatio,
  swungBeatOffset,
} from '../src/feel.ts'
import { TUNES, findTune } from '../src/data/tunes.ts'
import { parseChord, transposeModel, chartSemitoneShift } from '../src/theory.ts'

describe('v0.3 Scope B swing timing math', () => {
  it('converts long:short ratio r to fraction r/(r+1)', () => {
    // 1:1 -> 0.500
    expect(ratioToBeatFraction(1.0)).toBeCloseTo(0.5, 4)
    // 2:1 -> 0.667 (triplet feel)
    expect(ratioToBeatFraction(2.0)).toBeCloseTo(2 / 3, 4)
    // 2.8:1 -> 0.737 (Kind of Blue feel)
    expect(ratioToBeatFraction(2.8)).toBeCloseTo(2.8 / 3.8, 4)
    // 3.5:1 -> 0.778
    expect(ratioToBeatFraction(3.5)).toBeCloseTo(3.5 / 4.5, 4)
  })

  it('interpolates provisional per-style default curves by tempo', () => {
    // 136 BPM is 2.20 so the heard ride, 4 ms late, sits near Kind of Blue's 2.30.
    expect(defaultSwingRatioR(136, 'swing')).toBeCloseTo(2.2, 5)
    expect(defaultSwingRatioR(100, 'swing')).toBeGreaterThan(2.2)
    expect(defaultSwingRatioR(100, 'swing')).toBeLessThan(2.5)
    expect(defaultSwingRatioR(140, 'swing')).toBeGreaterThan(2.1)
    expect(defaultSwingRatioR(140, 'swing')).toBeLessThan(2.25)
    expect(defaultSwingRatioR(180, 'swing')).toBe(1.5)
    expect(defaultSwingRatioR(220, 'swing')).toBe(1.2)
    expect(defaultSwingRatioR(280, 'swing')).toBe(1.1)

    const midSwing = defaultSwingRatioR(158, 'swing')
    const at136 = 2.2
    const at180 = 1.5
    const t = (158 - 136) / (180 - 136)
    expect(midSwing).toBeCloseTo(at136 + (at180 - at136) * t, 3)

    // Ballad: <=90 -> 2.2, 120 -> 2.0
    expect(defaultSwingRatioR(80, 'ballad')).toBe(2.2)
    expect(defaultSwingRatioR(120, 'ballad')).toBe(2.0)

    // Shuffle: <=140 -> 2.0, 200 -> 1.6
    expect(defaultSwingRatioR(120, 'shuffle')).toBe(2.0)
    expect(defaultSwingRatioR(200, 'shuffle')).toBe(1.6)

    // Bossa: 1.0 at all tempos (even 8ths)
    expect(defaultSwingRatioR(100, 'bossa')).toBe(1.0)
    expect(defaultSwingRatioR(180, 'bossa')).toBe(1.0)
  })

  it('respects user custom ratio override and reset to style default', () => {
    expect(effectiveSwingRatioR(136, 'swing', null)).toBeCloseTo(2.2, 5)
    // User moves slider to 2.15: turns off auto and keeps custom ratio
    expect(effectiveSwingRatioR(140, 'swing', 2.15)).toBe(2.15)
    expect(swingRatio(140, 'swing', 2.15)).toBeCloseTo(2.15 / 3.15, 4)
    // User resets to default (null): returns to auto
    expect(effectiveSwingRatioR(136, 'swing', null)).toBeCloseTo(2.2, 5)
  })

  it('audibly moves the swung off-beat between 1:1 and 2.8:1', () => {
    const bpm = 136
    const beatSec = 60 / bpm // ~0.441s
    const ratioStraight = ratioToBeatFraction(1.0) // 0.500
    const ratioDeep = ratioToBeatFraction(2.8) // 0.7368

    const offStraight = eighthOffset(1, beatSec, ratioStraight)
    const offDeep = eighthOffset(1, beatSec, ratioDeep)
    const diffMs = (offDeep - offStraight) * 1000

    // Spec B: at 1:1 vs 2.8:1 at 136 BPM, off-beat moves by about 0.24 of a beat (~105 ms)
    expect(diffMs).toBeGreaterThan(95)
    expect(diffMs).toBeLessThan(115)
  })

  it('calculates 16th subdivision offsets with straight vs bounce ratios', () => {
    const beatSec = 0.5 // 120 BPM
    // Straight 16ths (subRatio 0.5):
    expect(sixteenthOffset(0, beatSec, 0.5)).toBe(0)
    expect(sixteenthOffset(1, beatSec, 0.5)).toBeCloseTo(0.125, 4)
    expect(sixteenthOffset(2, beatSec, 0.5)).toBeCloseTo(0.25, 4)
    expect(sixteenthOffset(3, beatSec, 0.5)).toBeCloseTo(0.375, 4)

    // Swung 16ths (e.g. bounce ratio 1.5 -> fraction 1.5 / 2.5 = 0.6):
    const bounceFrac = 1.5 / 2.5
    expect(sixteenthOffset(1, beatSec, bounceFrac)).toBeCloseTo(0.25 * bounceFrac, 4) // 0.15s instead of 0.125s
  })

  it('swungBeatOffset swings fractional off-beats and keeps downbeats aligned', () => {
    const beatSec = 0.5
    const ratio = ratioToBeatFraction(2.0) // 0.6667
    expect(swungBeatOffset(0, beatSec, ratio)).toBe(0)
    expect(swungBeatOffset(1, beatSec, ratio)).toBe(0.5)
    expect(swungBeatOffset(0.5, beatSec, ratio)).toBeCloseTo(0.5 * ratio, 4)
    expect(swungBeatOffset(2.5, beatSec, ratio)).toBeCloseTo(1.0 + 0.5 * ratio, 4)
  })
})

describe('v0.3 Scope D tune library completeness and validity', () => {
  it('contains at least 30 tunes with valid metadata', () => {
    expect(TUNES.length).toBeGreaterThanOrEqual(30)
    for (const tune of TUNES) {
      expect(tune.id).toBeTruthy()
      expect(tune.title).toBeTruthy()
      expect(tune.titleEn).toBeTruthy()
      expect(tune.key).toBeTruthy()
      expect(['swing', 'up', 'ballad', 'bossa', 'shuffle']).toContain(tune.style)
      expect(tune.bpm).toBeGreaterThanOrEqual(40)
      expect(tune.bpm).toBeLessThanOrEqual(280)
      expect(['4/4', '3/4']).toContain(tune.timeSignature)
      expect(tune.form.length).toBeGreaterThan(0)
      expect(tune.tags.length).toBeGreaterThan(0)
      expect(['pending-dean', 'approved']).toContain(tune.review)
      expect(tune.source).toBe('momo-written')
      expect(tune.bars.length).toBeGreaterThan(0)
    }
  })

  it('keeps the 13 original v0.2 tunes intact', () => {
    const ids = [
      'jazz-blues-f',
      'jazz-blues-bb',
      'minor-blues-c',
      'bird-blues-f',
      'rhythm-bb',
      'autumn-leaves',
      'blue-bossa',
      'solar',
      'so-what',
      'major-ii-v-i',
      'minor-ii-v-i',
      'night-window',
      'riverside',
    ]
    for (const id of ids) {
      const tune = findTune(id)
      expect(tune).toBeDefined()
      expect(tune!.bars.length).toBeGreaterThan(0)
    }
    // Originals marked momo-original
    expect(findTune('night-window')!.tags).toContain('momo-original')
    expect(findTune('riverside')!.tags).toContain('momo-original')
  })

  it('marks newly added tunes with review: pending-dean', () => {
    const newTunes = [
      'summertime',
      'all-the-things-you-are',
      'take-the-a-train',
      'satin-doll',
      'fly-me-to-the-moon',
      'there-will-never-be-another-you',
      'misty',
      'footprints',
      'cantaloupe-island',
      'billies-bounce',
      'bags-groove',
      'impressions',
      'song-for-my-father',
      'the-girl-from-ipanema',
      'watermelon-man',
      'let-it-be',
      'yesterday',
      'isnt-she-lovely',
      'just-the-way-you-are',
      'moon-river',
      'dont-know-why',
      'englishman-in-new-york',
    ]
    for (const id of newTunes) {
      const t = findTune(id)
      expect(t).toBeDefined()
      expect(t!.review).toBe('pending-dean')
    }
  })

  it('transposes all tunes cleanly for concert, Bb, Eb, and F charts without error', () => {
    const charts = ['concert', 'bb', 'eb', 'f'] as const
    for (const tune of TUNES) {
      for (const chart of charts) {
        const shift = chartSemitoneShift(0, chart)
        for (const bar of tune.bars) {
          for (const slot of bar.chords) {
            const parsed = parseChord(slot.symbol)
            const transposed = transposeModel(parsed, shift)
            expect(transposed).toBeDefined()
            expect(transposed.bass).toBeGreaterThanOrEqual(0)
            expect(transposed.bass).toBeLessThan(12)
          }
        }
      }
    }
  })
})
