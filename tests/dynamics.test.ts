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

  it('plays the out-head on the last chorus when repeats == 2', () => {
    expect(playingModeAt(0, 2)).toBe('HEAD')
    expect(playingModeAt(1, 2)).toBe('HEAD')
    expect(chorusRole(1, 2)).toBe('out')
  })

  it('assigns HEAD when repeats == 1', () => {
    expect(playingModeAt(0, 1)).toBe('HEAD')
  })

  it('keeps infinite loops in SOLO after chorus 1', () => {
    expect(playingModeAt(0, null)).toBe('HEAD')
    expect(playingModeAt(1, null)).toBe('SOLO')
    expect(playingModeAt(10, null)).toBe('SOLO')
  })

  it('keeps the solo drum bus near the head bus so voicing, not the fader, makes the contrast', () => {
    const head = shape({ chorus: 0, repeats: 6, form: 32 })
    const solo = shape({ chorus: 1, repeats: 6, form: 32 })
    const diffDb = gainToDb(solo.drumBusGain) - gainToDb(head.drumBusGain)
    expect(diffDb).toBeGreaterThan(-8)
    expect(diffDb).toBeLessThan(2)
    expect(gainToDb(solo.rideGain)).toBeGreaterThan(gainToDb(head.rideGain))
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

    const drop = gainToDb(b1c0.rideGain) - gainToDb(b0c1.rideGain)
    expect(drop).toBeLessThan(-1.5)
    expect(drop).toBeGreaterThan(-6)
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
    expect(rideDb).toBeLessThan(-1)
    expect(rideDb).toBeGreaterThan(-3)
    expect(DEFAULT_DRUM_MIX.ride).toBeCloseTo(0.8, 2)
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
    expect(busDropDb).toBeGreaterThanOrEqual(4.0)
    expect(busDropDb).toBeLessThanOrEqual(7.5)

    const snareDropDb = gainToDb(bandBar.snareCompGain) - gainToDb(userBar.snareCompGain)
    expect(snareDropDb).toBeGreaterThanOrEqual(10.0)

    const bassDiffDb = Math.abs(gainToDb(bandBar.bassGain) - gainToDb(userBar.bassGain))
    expect(bassDiffDb).toBeLessThanOrEqual(0.5)
  })
})

describe('v0.3.2 So What theme', () => {
  it('plays the Kind of Blue bass call, then a held D3 and the two answers', async () => {
    const { soWhatHeadNotes } = await import('../src/arrange')
    const bar0 = soWhatHeadNotes(0, 0, 'A')
    expect(bar0.chords).toHaveLength(0)
    expect(bar0.bass.map((b) => [b.beat, b.midi])).toEqual([
      [0.5, 38],
      [1.0, 45],
      [1.5, 47],
      [2.0, 48],
      [2.5, 50],
      [3.0, 52],
      [3.5, 48],
    ])

    const bar1 = soWhatHeadNotes(1, 0, 'A')
    expect(bar1.bass.map((b) => [b.beat, b.midi])).toEqual([[0, 50]])
    expect(bar1.bass[0].beats).toBeGreaterThan(1.5)
    expect(bar1.chords[0].beat).toBe(2.0)
    expect(bar1.chords[0].notes).toEqual([52, 57, 62, 67, 71])
    expect(bar1.chords[1].beat).toBe(3.5)
    expect(bar1.chords[1].notes).toEqual([50, 55, 60, 65, 69])
  })

  it('raises the call one semitone on the Ebm7 bridge, including the weaker 4&', async () => {
    const { soWhatHeadNotes } = await import('../src/arrange')
    const bridgeCall = soWhatHeadNotes(16, 0, 'B')
    expect(bridgeCall.bass.map((b) => b.midi)).toEqual([39, 46, 48, 49, 51, 53, 49])
    const bridgeResp = soWhatHeadNotes(17, 0, 'B')
    expect(bridgeResp.bass.map((b) => b.midi)).toEqual([51])
    expect(bridgeResp.chords[0].notes).toEqual([53, 58, 63, 68, 72])
    expect(bridgeResp.chords[1].notes).toEqual([51, 56, 61, 66, 70])
  })

  it('plays the theme on a 2-chorus out-head and not on a solo chorus', () => {
    const tune = findTune('so-what')!
    const outHead = arrangeBar({
      tune,
      barIndex: 0,
      chorus: 1,
      playBar: tune.bars.length,
      bpm: 136,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
      repeats: 2,
    })
    const call = outHead.filter((hit) => hit.part === 'bass').map((hit) => hit.midi)
    expect(call).toEqual([38, 45, 47, 48, 50, 52, 48])
    const solo = arrangeBar({
      tune,
      barIndex: 0,
      chorus: 1,
      playBar: tune.bars.length,
      bpm: 136,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: false,
      repeats: 6,
    })
    expect(solo.filter((hit) => hit.part === 'bass')).toHaveLength(4)
    expect(solo.some((hit) => hit.part === 'piano')).toBe(true)
  })
})

describe('v0.3.2 session migration', () => {
  it('rewrites every v0.2 factory default and keeps a fader the player actually moved', async () => {
    const { migrateSessionMixer, defaultMixer } = await import('../src/session')
    const next = defaultMixer('bb')
    const legacy = {
      drums: 0.86,
      bass: 0.8,
      piano: 0.7,
      reverb: 0.28,
      guitar: 0.46,
      click: 0.62,
      master: 0.9,
      drumMix: { ride: 0.55, hat: 1, snare: 1.18, kick: 1.26, brush: 1 },
    }
    const migrated = migrateSessionMixer(legacy as any)
    expect(migrated.drums).toBeCloseTo(next.drums, 5)
    expect(migrated.bass).toBeCloseTo(next.bass, 5)
    expect(migrated.piano).toBeCloseTo(next.piano, 5)
    expect(migrated.reverb).toBeCloseTo(next.reverb, 5)
    expect(migrated.drumMix.ride).toBeCloseTo(next.drumMix.ride, 5)
    expect(migrated.drumMix.hat).toBeCloseTo(next.drumMix.hat, 5)
    expect(migrated.drumMix.snare).toBeCloseTo(next.drumMix.snare, 5)
    expect(migrated.drumMix.kick).toBeCloseTo(next.drumMix.kick, 5)

    const custom = migrateSessionMixer({ ...legacy, bass: 0.88, piano: 0.5, drumMix: { ...legacy.drumMix, ride: 0.42, snare: 0.9 } } as any)
    expect(custom.bass).toBe(0.88)
    expect(custom.piano).toBe(0.5)
    expect(custom.drumMix.ride).toBe(0.42)
    expect(custom.drumMix.snare).toBe(0.9)
    expect(custom.drums).toBeCloseTo(next.drums, 5)
  })

  it('loads a v0.2 session from localStorage and rewrites the mixer', async () => {
    const store = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })
    const { loadSession, SESSION_KEY_V1, SESSION_KEY_V031, defaultMixer } = await import('../src/session')
    store.set(
      SESSION_KEY_V1,
      JSON.stringify({
        tuneId: 'so-what',
        mixer: {
          drums: 0.86,
          bass: 0.8,
          piano: 0.7,
          reverb: 0.28,
          drumMix: { ride: 0.55, hat: 1, snare: 1.18, kick: 1.26, brush: 1 },
        },
      }),
    )
    const session = loadSession()
    const next = defaultMixer('bb')
    expect(session.tuneId).toBe('so-what')
    expect(session.mixer.drums).toBeCloseTo(next.drums, 5)
    expect(session.mixer.piano).toBeCloseTo(next.piano, 5)
    expect(session.mixer.bass).toBeCloseTo(next.bass, 5)
    expect(session.mixer.reverb).toBeCloseTo(next.reverb, 5)
    expect(session.mixer.drumMix.ride).toBeCloseTo(next.drumMix.ride, 5)
    expect(session.mixer.drumMix.snare).toBeCloseTo(next.drumMix.snare, 5)
    expect(store.get(SESSION_KEY_V031)).toBeTruthy()
  })
})

describe('v0.3.2 config parameters each change the output', () => {
  it('moves level, density, tempo or the written line when a remaining parameter changes', async () => {
    const { clearMusicCache } = await import('../src/arrange')
    const { effectiveBpm } = await import('../src/dynamics')
    const tune = findTune('jazz-blues-f')!
    const bar = (over: Partial<Parameters<typeof arrangeBar>[0]> = {}) =>
      arrangeBar({
        tune,
        barIndex: 2,
        chorus: 1,
        playBar: 14,
        bpm: 132,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: false,
        repeats: 6,
        ...over,
      })
    const withConfig = (edit: () => void, read: () => number) => {
      const before = read()
      edit()
      const after = read()
      expect(after).not.toBeCloseTo(before, 5)
    }

    const cfg = DYNAMICS_CONFIG
    const originals = {
      drop: cfg.blocks.newBlockDropDb,
      step: cfg.blocks.newBlockStepDb,
      headHits: cfg.voicing.snareComping.headHitsPerBar,
      soloMed: cfg.voicing.snareComping.soloMedHitsPerBar,
      soloFast: cfg.voicing.snareComping.soloFastHitsPerBar,
      skip: cfg.bass.skipNoteProbability,
      soloPiano: cfg.piano.soloHitsPerBar,
      headPiano: cfg.piano.headHitsPerBar,
      push: cfg.tempo.pushInSolosDefault,
      ratio: cfg.tempo.pushInSolosRatio,
      soloTrim: cfg.modes.solo.drumBusDbOffset,
    }
    try {
      withConfig(
        () => {
          cfg.blocks.newBlockDropDb = -8
        },
        () => shape({ chorus: 3, repeats: 8, form: 32 }).drumBusGain,
      )
      withConfig(
        () => {
          cfg.blocks.newBlockStepDb = 4
        },
        () => shape({ chorus: 3, repeats: 8, form: 32 }).snareCompGain,
      )
      withConfig(
        () => {
          cfg.voicing.snareComping.headHitsPerBar = 1
        },
        () =>
          arrangeBar({
            tune,
            barIndex: 0,
            chorus: 0,
            playBar: 0,
            bpm: 100,
            style: 'swing',
            transpose: 0,
            trade: null,
            click: 'off',
            humanize: false,
            repeats: 4,
          }).filter((hit) => hit.drum === 'snare' || hit.drum === 'sidestick').length,
      )
      withConfig(
        () => {
          cfg.voicing.snareComping.soloMedHitsPerBar = 1
        },
        () => bar().filter((hit) => hit.drum === 'snare' || hit.drum === 'sidestick').length,
      )
      withConfig(
        () => {
          cfg.voicing.snareComping.soloFastHitsPerBar = 1
        },
        () => bar({ bpm: 200 }).filter((hit) => hit.drum === 'snare' || hit.drum === 'sidestick').length,
      )
      clearMusicCache()
      const beforeSkip = bar().filter((hit) => hit.part === 'bass').map((hit) => hit.velocity)
      cfg.bass.skipNoteProbability = 1
      clearMusicCache()
      const afterSkip = bar().filter((hit) => hit.part === 'bass').map((hit) => hit.velocity)
      expect(afterSkip.join(',')).not.toBe(beforeSkip.join(','))
      withConfig(
        () => {
          cfg.piano.soloHitsPerBar = 1
        },
        () => new Set(bar().filter((hit) => hit.part === 'piano').map((hit) => Math.round(hit.time * 20))).size,
      )
      withConfig(
        () => {
          cfg.piano.headHitsPerBar = 1
        },
        () =>
          new Set(
            arrangeBar({
              tune,
              barIndex: 0,
              chorus: 0,
              playBar: 0,
              bpm: 100,
              style: 'swing',
              transpose: 0,
              trade: null,
              click: 'off',
              humanize: false,
              repeats: 4,
            })
              .filter((hit) => hit.part === 'piano')
              .map((hit) => Math.round(hit.time * 20)),
          ).size,
      )
      withConfig(
        () => {
          cfg.tempo.pushInSolosDefault = true
          cfg.tempo.pushInSolosRatio = 1.2
        },
        () => effectiveBpm(136, 'SOLO', 'auto'),
      )
      expect(effectiveBpm(136, 'HEAD', 'auto')).toBe(136)
      withConfig(
        () => {
          cfg.modes.solo.drumBusDbOffset = -9
        },
        () => shape({ chorus: 1, repeats: 6 }).drumBusGain,
      )
    } finally {
      cfg.blocks.newBlockDropDb = originals.drop
      cfg.blocks.newBlockStepDb = originals.step
      cfg.voicing.snareComping.headHitsPerBar = originals.headHits
      cfg.voicing.snareComping.soloMedHitsPerBar = originals.soloMed
      cfg.voicing.snareComping.soloFastHitsPerBar = originals.soloFast
      cfg.bass.skipNoteProbability = originals.skip
      cfg.piano.soloHitsPerBar = originals.soloPiano
      cfg.piano.headHitsPerBar = originals.headPiano
      cfg.tempo.pushInSolosDefault = originals.push
      cfg.tempo.pushInSolosRatio = originals.ratio
      cfg.modes.solo.drumBusDbOffset = originals.soloTrim
      clearMusicCache()
    }
  })
})

describe('Satin Doll form', () => {
  it('writes the bridge in the same doubled bars as the A sections', () => {
    const tune = findTune('satin-doll')!
    expect(tune.bars).toHaveLength(64)
    expect(tune.form.map((section) => section.bars)).toEqual([16, 16, 16, 16])
    expect(tune.form.map((section) => section.label)).toEqual(['A', 'A', 'B', 'A'])
    const bridge = tune.bars.slice(32, 48).map((bar) => bar.chords.map((chord) => chord.symbol).join(' '))
    expect(bridge).toEqual(['Gm7', 'C7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7', 'Fmaj7', 'Fmaj7', 'Am7', 'D7', 'Am7', 'D7', 'G7', 'G7', 'G7', 'G7'])
  })
})
