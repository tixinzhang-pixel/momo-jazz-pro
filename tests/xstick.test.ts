import { describe, expect, it } from 'vitest'
import { arrangeBar, clearMusicCache } from '../src/arrange.ts'
import { findTune } from '../src/data/tunes.ts'
import { DYNAMICS_CONFIG } from '../src/engine/dynamicsConfig.ts'

const beatSec = 60 / 136
function bars(chorus: number, from: number, to: number, humanize = false) {
  const tune = findTune('so-what')!
  const out: { bar: number; hits: ReturnType<typeof arrangeBar> }[] = []
  for (let bar = from; bar < to; bar++) {
    out.push({
      bar,
      hits: arrangeBar({ tune, barIndex: bar, chorus, playBar: chorus * 32 + bar, bpm: 136, style: 'swing', transpose: 0, trade: null, click: 'off', humanize, repeats: 6 }),
    })
  }
  return out
}

describe('beta.4 cross-stick placement', () => {
  it('HEAD: at most one cross-stick per non-fill bar, on beat 4, laid back 4-25 ms, never on an off-beat', () => {
    clearMusicCache()
    for (const { bar, hits } of bars(0, 0, 32, false)) {
      const xs = hits.filter((h) => h.drum === 'sidestick')
      const fillBar = [7, 15, 23, 31].includes(bar)
      if (!fillBar) expect(xs.length).toBe(1)
      for (const h of xs) {
        const pos = h.time / beatSec
        if (fillBar) continue
        expect(pos).toBeGreaterThanOrEqual(3 + 0.0079 / beatSec)
        expect(pos).toBeLessThanOrEqual(3 + 0.0131 / beatSec)
      }
    }
  })
  it('HEAD (humanized): median lay-back behind the grid is 6-14 ms', () => {
    clearMusicCache()
    const offs: number[] = []
    for (const { hits } of bars(0, 0, 32, true)) for (const h of hits) if (h.drum === 'sidestick' && h.time > 2.5 * beatSec) offs.push(h.time - 3 * beatSec)
    offs.sort((a, b) => a - b)
    const med = offs[Math.floor(offs.length / 2)]
    expect(med).toBeGreaterThan(0.006)
    expect(med).toBeLessThan(0.014)
  })
  it('HEAD: cross-stick product stays soft (<= 0.45) and no catches on the So What answers', () => {
    clearMusicCache()
    for (const { hits } of bars(0, 0, 32)) {
      for (const h of hits.filter((x) => x.drum === 'sidestick')) {
        expect(h.velocity * (h.gain ?? 1)).toBeLessThanOrEqual(0.45)
        const pos = h.time / beatSec
        expect(Math.abs(pos - 2) < 0.1 || Math.abs(pos - 3.7) < 0.1).toBe(false)
      }
    }
  })
  it('SOLO: no constant cross-stick (only fill tables may use it)', () => {
    clearMusicCache()
    let n = 0
    for (const { bar, hits } of bars(1, 0, 32)) if (![7, 15, 23, 31].includes(bar)) n += hits.filter((h) => h.drum === 'sidestick').length
    expect(n).toBe(0)
  })
  it('legacy mode reproduces beta.3 side-stick count in the head', () => {
    const cfg = DYNAMICS_CONFIG.voicing.crossStick
    const prev = cfg.mode
    cfg.mode = 'legacy'
    clearMusicCache()
    const n = bars(0, 0, 32).reduce((s, b) => s + b.hits.filter((h) => h.drum === 'sidestick').length, 0)
    cfg.mode = prev
    clearMusicCache()
    expect(n).toBeGreaterThan(60)
  })
})
