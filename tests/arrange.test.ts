import { describe, expect, it } from 'vitest'
import { arrangeBar, clearMusicCache, fillKind } from '../src/arrange.ts'
import { findTune } from '../src/data/tunes.ts'
import { barSwingFraction, eighthOffset, pocketBias, swingRatio } from '../src/feel.ts'
import { chordTones, mod, parseChord } from '../src/theory.ts'
import type { Hit } from '../src/types.ts'

const blues = findTune('jazz-blues-f')!

function bars(count: number, style: 'swing' | 'up' | 'ballad' | 'bossa' = 'swing', bpm = 132, extra: Partial<Parameters<typeof arrangeBar>[0]> = {}) {
  clearMusicCache()
  return Array.from({ length: count }, (_, bar) =>
    arrangeBar({
      tune: blues,
      barIndex: bar % blues.bars.length,
      chorus: Math.floor(bar / blues.bars.length),
      playBar: bar,
      bpm,
      style,
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
      ...extra,
    }),
  )
}

function drums(hits: Hit[], drum: string) {
  return hits.filter((hit) => hit.part === 'drums' && hit.drum === drum)
}

describe('swing feel', () => {
  it('tightens the swing ratio as the tempo comes up, and bossa stays straight', () => {
    // 136 BPM programs 2.20, heard a little deeper once the ride sits late.
    expect(swingRatio(136, 'swing')).toBeCloseTo(2.2 / 3.2, 4)
    expect(swingRatio(136, 'swing')).toBeGreaterThan(0.68)
    expect(swingRatio(136, 'swing')).toBeLessThan(0.7)
    expect(swingRatio(180, 'swing')).toBeLessThan(swingRatio(136, 'swing'))
    expect(swingRatio(220, 'swing')).toBeLessThan(0.56)
    expect(swingRatio(220, 'swing')).toBeGreaterThan(0.5)
    expect(swingRatio(132, 'bossa')).toBe(0.5)
    const beat = 60 / 132
    const ratio = swingRatio(132, 'swing')
    const skip = eighthOffset(3, beat, ratio)
    expect(skip / beat).toBeGreaterThan(1.5)
    expect(skip / beat).toBeCloseTo(1 + ratio, 5)
  })

  it('plays a spang-alang ride, feathers the kick, and chicks the hat on 2 and 4', () => {
    // Test in SOLO chorus (bar 2, avoiding bar 1 block crash) where ride is full and kick is feathered
    const bar = bars(3, 'swing', 132, { chorus: 1, repeats: 4 })[2]
    const beat = 60 / 132
    const ratio = barSwingFraction(132, 'swing', 2, 1, null, '8ths')
    const ride = drums(bar, 'ride').concat(drums(bar, 'rideBell'))
    expect(ride.length).toBeGreaterThanOrEqual(5)
    const skip = eighthOffset(3, beat, ratio) + pocketBias('ride')
    expect(ride.some((hit) => Math.abs(hit.time - skip) < 0.004)).toBe(true)
    const hats = drums(bar, 'hatPedal')
    expect(hats).toHaveLength(2)
    expect(drums(bar, 'kick').length).toBeGreaterThan(0)
    expect(drums(bar, 'kick').every((hit) => hit.velocity < 0.35)).toBe(true)
  })

  it('does not use the same fill every four bars', () => {
    const played = bars(8)
    const fills = [3, 7].map((index) =>
      played[index]
        .filter((hit) => hit.part === 'drums' && (hit.drum === 'snare' || hit.drum === 'tomL' || hit.drum === 'tomM' || hit.drum === 'tomH' || hit.drum === 'kick'))
        .map((hit) => `${hit.drum}:${hit.time.toFixed(3)}`)
        .join('|'),
    )
    expect(fillKind(3, 12, 'swing', 0)).not.toBe(fillKind(11, 12, 'swing', 0))
    expect(fills[0]).not.toBe(fills[1])
  })

  it('puts the ride ahead of the piano', () => {
    const [bar] = bars(1)
    const ride = bar.find((hit) => hit.drum === 'ride' || hit.drum === 'rideBell')
    const piano = bar.find((hit) => hit.part === 'piano')
    const bass = bar.find((hit) => hit.part === 'bass')
    expect(ride && piano && bass).toBeTruthy()
    expect(bass!.time).toBeLessThan(ride!.time - 0.008)
    expect(ride!.time).toBeLessThanOrEqual(piano!.time + 0.001)
  })
})

describe('walking bass and shared swing', () => {
  it('walks So What instead of repeating D, and keeps the head ride accent', () => {
    clearMusicCache()
    const tune = findTune('so-what')!
    const midis: number[] = []
    for (let bar = 0; bar < 32; bar++) {
      const hits = arrangeBar({
        tune,
        barIndex: bar,
        chorus: 1,
        playBar: 32 + bar,
        bpm: 136,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: false,
        repeats: 6,
      })
      for (const hit of hits.filter((item) => item.part === 'bass')) midis.push(hit.midi ?? 0)
    }
    const d1 = midis.filter((midi) => midi === 38).length
    expect(d1 / midis.length).toBeLessThan(0.3)
    expect(new Set(midis).size).toBeGreaterThan(8)
    let repeats = 0
    for (let i = 1; i < midis.length; i++) if (midis[i] === midis[i - 1]) repeats++
    expect(repeats / (midis.length - 1)).toBeLessThan(0.05)
    expect(Math.min(...midis)).toBeGreaterThanOrEqual(28)
    expect(Math.max(...midis)).toBeLessThanOrEqual(48)

    const head = arrangeBar({
      tune,
      barIndex: 2,
      chorus: 0,
      playBar: 2,
      bpm: 136,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
      repeats: 6,
    })
    const rides = head.filter((hit) => hit.drum === 'ride').sort((a, b) => a.time - b.time)
    expect(rides[1].velocity).toBeGreaterThan(rides[0].velocity)
    expect(rides[4].velocity).toBeGreaterThan(rides[3].velocity)
    const call = head.filter((hit) => hit.part === 'bass').sort((a, b) => a.time - b.time)
    const long = Math.max(...call.map((hit) => hit.duration))
    expect(long).toBeGreaterThan(0.25)
  })
})

describe('bass and piano', () => {
  it('walks inside the bass range and approaches the next downbeat', () => {
    clearMusicCache()
    const line = bars(24).map((hits) => hits.filter((hit) => hit.part === 'bass').map((hit) => hit.midi ?? 0))
    const intervals: number[] = []
    for (let i = 0; i < line.length - 1; i++) {
      const notes = line[i]
      expect(notes.length === 4 || notes.length === 5).toBe(true)
      const quarters = notes.slice(0, 4)
      for (const midi of notes) expect(midi).toBeGreaterThanOrEqual(28)
      for (const midi of notes) expect(midi).toBeLessThanOrEqual(48)
      const next = line[i + 1][0]
      intervals.push(Math.abs(quarters[3] - next))
      for (let n = 1; n < notes.length; n++) expect(Math.abs(notes[n] - notes[n - 1])).toBeLessThanOrEqual(12)
      expect(Math.abs(next - quarters[3])).toBeLessThanOrEqual(12)
    }
    const close = intervals.filter((iv) => [1, 2, 5, 7].includes(iv) || iv === 0).length
    expect(close / intervals.length).toBeGreaterThan(0.7)
    const beatOnes = line.map((notes) => mod(notes[0]))
    const unique = new Set(line.map((notes) => notes.join(',')))
    expect(unique.size).toBeGreaterThan(8)
    expect(new Set(beatOnes).size).toBeGreaterThan(3)
  })

  it('lands beat 1 on a chord tone', () => {
    clearMusicCache()
    for (let bar = 0; bar < 12; bar++) {
      const hits = arrangeBar({
        tune: blues,
        barIndex: bar,
        chorus: 0,
        playBar: bar,
        bpm: 132,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: false,
      })
      const bass = hits.find((hit) => hit.part === 'bass')
      const chord = parseChord(blues.bars[bar].chords[0].symbol)
      const pc = mod(bass?.midi ?? 0)
      const tones = new Set([...chordTones(chord.kind).map((tone) => mod(chord.root + tone)), chord.bass])
      expect(tones.has(pc)).toBe(true)
    }
  })

  it('voice-leads rootless voicings', () => {
    clearMusicCache()
    const tune = findTune('autumn-leaves')!
    const stacks: number[][] = []
    for (let bar = 0; bar < 8; bar++) {
      const hits = arrangeBar({
        tune,
        barIndex: bar,
        chorus: 0,
        playBar: bar,
        bpm: 120,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: false,
      })
      const chord = parseChord(tune.bars[bar].chords[0].symbol)
      const pianos = hits.filter((hit) => hit.part === 'piano')
      if (!pianos.length) continue
      const first = Math.min(...pianos.map((hit) => hit.time))
      const midis = pianos.filter((hit) => hit.time - first < 0.05).map((hit) => hit.midi ?? 0)
      expect(midis.length).toBeGreaterThanOrEqual(3)
      for (const midi of midis) expect(mod(midi)).not.toBe(chord.root)
      stacks.push(midis.sort((a, b) => a - b))
    }
    expect(stacks.length).toBeGreaterThanOrEqual(6)
    let motion = 0
    for (let i = 1; i < stacks.length; i++) {
      motion += Math.abs(stacks[i][0] - stacks[i - 1][0])
    }
    expect(motion / (stacks.length - 1)).toBeLessThan(7)
  })
})

describe('trading arrangement', () => {
  it('leaves only the hat when the drummer plays, and solos the drums for a horn player', () => {
    clearMusicCache()
    const yours = arrangeBar({
      tune: blues,
      barIndex: 4,
      chorus: 0,
      playBar: 4,
      bpm: 132,
      style: 'swing',
      transpose: 0,
      trade: { on: true, len: 4, userStarts: false, role: 'drums' },
      click: 'off',
      humanize: false,
    })
    const kit = yours.filter((hit) => hit.part === 'drums').map((hit) => hit.drum)
    expect(new Set(kit)).toEqual(new Set(['hatPedal']))
    expect(yours.some((hit) => hit.part === 'bass')).toBe(true)
    expect(yours.some((hit) => hit.part === 'piano')).toBe(true)

    const band = arrangeBar({
      tune: blues,
      barIndex: 0,
      chorus: 0,
      playBar: 0,
      bpm: 132,
      style: 'swing',
      transpose: 0,
      trade: { on: true, len: 4, userStarts: false, role: 'bb' },
      click: 'off',
      humanize: false,
    })
    expect(band.some((hit) => hit.drum === 'snare' || hit.drum === 'tomL' || hit.drum === 'tomM' || hit.drum === 'sidestick')).toBe(true)
    const answer = arrangeBar({
      tune: blues,
      barIndex: 3,
      chorus: 0,
      playBar: 3,
      bpm: 132,
      style: 'swing',
      transpose: 0,
      trade: { on: true, len: 4, userStarts: false, role: 'bb' },
      click: 'off',
      humanize: false,
    })
    const lastRide = answer.filter((hit) => hit.drum === 'ride' || hit.drum === 'rideBell')
    expect(lastRide.length).toBeLessThan(3)
  })

  it('answers a drummer with a piano line that ends with space', () => {
    clearMusicCache()
    const last = arrangeBar({
      tune: blues,
      barIndex: 3,
      chorus: 0,
      playBar: 3,
      bpm: 120,
      style: 'swing',
      transpose: 0,
      trade: { on: true, len: 4, userStarts: false, role: 'drums' },
      click: 'off',
      humanize: false,
    })
    const piano = last.filter((hit) => hit.part === 'piano')
    expect(piano.length).toBe(1)
    expect(piano[0].time).toBeLessThan(0.2)
  })

  it('actually schedules the click modes', () => {
    const backbeat = arrangeBar({
      tune: blues,
      barIndex: 0,
      chorus: 0,
      playBar: 0,
      bpm: 100,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'backbeat',
      humanize: false,
    })
    expect(backbeat.filter((hit) => hit.part === 'click')).toHaveLength(2)
    const all = arrangeBar({
      tune: blues,
      barIndex: 0,
      chorus: 0,
      playBar: 0,
      bpm: 100,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'all',
      humanize: false,
    })
    expect(all.filter((hit) => hit.part === 'click')).toHaveLength(4)
  })
})

describe('styles', () => {
  it('uses brushes on a ballad and straight bossa rim clicks', () => {
    const ballad = arrangeBar({
      tune: findTune('night-window')!,
      barIndex: 0,
      chorus: 0,
      playBar: 0,
      bpm: 66,
      style: 'ballad',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
    })
    expect(ballad.some((hit) => hit.drum === 'brushSwirl')).toBe(true)
    expect(ballad.some((hit) => hit.drum === 'ride')).toBe(false)
    expect(ballad.filter((hit) => hit.part === 'bass').length).toBe(2)

    const bossa = arrangeBar({
      tune: findTune('blue-bossa')!,
      barIndex: 0,
      chorus: 0,
      playBar: 0,
      bpm: 132,
      style: 'bossa',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
    })
    expect(bossa.filter((hit) => hit.drum === 'sidestick').length).toBeGreaterThanOrEqual(3)
    const hat = bossa.find((hit) => hit.drum === 'hatClosed')
    const beat = 60 / 132
    expect(hat && Math.abs((hat.time / (beat / 2)) - Math.round(hat.time / (beat / 2))) < 0.05).toBe(true)
  })
})
