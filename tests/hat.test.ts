import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arrangeBar, clearMusicCache } from '../src/arrange.ts'
import { findTune } from '../src/data/tunes.ts'
import { musicalShape } from '../src/dynamics.ts'
import { DYNAMICS_CONFIG } from '../src/engine/dynamicsConfig.ts'
import { pocketBias, swingRatio } from '../src/feel.ts'

const beatSec = 60 / 136

function bars(chorus: number, from: number, to: number, humanize = false) {
  const tune = findTune('so-what')!
  const out: { bar: number; hits: ReturnType<typeof arrangeBar> }[] = []
  for (let bar = from; bar < to; bar++) {
    out.push({
      bar,
      hits: arrangeBar({
        tune,
        barIndex: bar,
        chorus,
        playBar: chorus * 32 + bar,
        bpm: 136,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize,
        repeats: 6,
      }),
    })
  }
  return out
}

describe('hi-hat foot chick placement, level & round-robin', () => {
  it('places hatPedal only on beats 2 and 4 with no hatClosed double-trigger in HEAD or SOLO', () => {
    clearMusicCache()
    for (const chorus of [0, 1]) {
      for (const { hits } of bars(chorus, 0, 32, false)) {
        const pedals = hits.filter((h) => h.drum === 'hatPedal').sort((a, b) => a.time - b.time)
        const closed = hits.filter((h) => h.drum === 'hatClosed')
        expect(pedals).toHaveLength(2)
        expect(closed).toHaveLength(0)
        expect(pedals[0].time).toBeCloseTo(1 * beatSec + pocketBias('hat'), 5)
        expect(pedals[1].time).toBeCloseTo(3 * beatSec + pocketBias('hat'), 5)
      }
    }
  })

  it('keeps swing ratio unchanged at 136 BPM', () => {
    expect(swingRatio(136, 'swing')).toBeCloseTo(2.2 / 3.2, 6)
  })

  it('humanizes hatPedal velocity within +-10% around nominal', () => {
    clearMusicCache()
    const nomBars = bars(1, 0, 32, false)
    clearMusicCache()
    const humBars = bars(1, 0, 32, true)
    let minRatio = Infinity
    let maxRatio = -Infinity
    for (let i = 0; i < 32; i++) {
      const nom = nomBars[i].hits.filter((h) => h.drum === 'hatPedal').sort((a, b) => a.time - b.time)
      const hum = humBars[i].hits.filter((h) => h.drum === 'hatPedal').sort((a, b) => a.time - b.time)
      expect(hum).toHaveLength(2)
      for (let k = 0; k < 2; k++) {
        const r = hum[k].velocity / nom[k].velocity
        minRatio = Math.min(minRatio, r)
        maxRatio = Math.max(maxRatio, r)
      }
    }
    expect(minRatio).toBeGreaterThanOrEqual(0.9)
    expect(maxRatio).toBeLessThanOrEqual(1.1)
    expect(maxRatio - minRatio).toBeGreaterThan(0.05)
  })

  it('keeps HEAD hatGain lower than SOLO hatGain without hitting clamp and configures >= 2 round-robin samples', () => {
    expect(DYNAMICS_CONFIG.modes.head.hatDbOffset).toBeLessThan(DYNAMICS_CONFIG.modes.solo.hatDbOffset)
    const headShape = musicalShape({
      mode: 'auto',
      chorus: 0,
      barIndex: 2,
      form: 32,
      repeats: 6,
      section: 'A',
      userTurn: false,
      handoff: false,
      bandTurn: false,
      barInTurn: 0,
    })
    const soloShape = musicalShape({
      mode: 'auto',
      chorus: 1,
      barIndex: 2,
      form: 32,
      repeats: 6,
      section: 'A',
      userTurn: false,
      handoff: false,
      bandTurn: false,
      barInTurn: 0,
    })
    expect(headShape.hatGain).toBeGreaterThan(0.04)
    expect(headShape.hatGain).toBeLessThan(soloShape.hatGain)

    const bankPath = resolve(import.meta.dirname, '../public/samples/bank.json')
    const bank = JSON.parse(readFileSync(bankPath, 'utf8')) as { drums: Record<string, string[]> }
    const hatFiles = bank.drums.hatPedal
    expect(hatFiles.length).toBeGreaterThanOrEqual(2)
    for (const f of hatFiles) {
      expect(existsSync(resolve(import.meta.dirname, '../public/samples', f))).toBe(true)
    }
  })

  it('keeps bass, piano, ride, kick, snare and sidestick identical to legacy mode', () => {
    const cfg = DYNAMICS_CONFIG.voicing.hatPedal
    const prev = cfg.mode
    try {
      cfg.mode = 'legacy'
      clearMusicCache()
      const legacyHead = bars(0, 0, 32, true)
      const legacySolo = bars(1, 0, 32, true)
      cfg.mode = 'chick'
      clearMusicCache()
      const newHead = bars(0, 0, 32, true)
      const newSolo = bars(1, 0, 32, true)
      const nonHat = (hits: ReturnType<typeof arrangeBar>) =>
        hits.filter((h) => h.drum !== 'hatPedal' && h.drum !== 'hatClosed')
      expect(nonHat(newHead.flatMap((b) => b.hits))).toEqual(nonHat(legacyHead.flatMap((b) => b.hits)))
      expect(nonHat(newSolo.flatMap((b) => b.hits))).toEqual(nonHat(legacySolo.flatMap((b) => b.hits)))
    } finally {
      cfg.mode = prev
      clearMusicCache()
    }
  })
})
