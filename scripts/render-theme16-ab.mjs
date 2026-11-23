/**
 * Render So What theme bars 1-16 (0-index 0-15), no intro, no bar 17, no ending.
 * Same graph constants as src/audio/render.ts. T0 = 0.08s. humanize true.
 * Usage: node scripts/_render-theme16.mjs outPrefix
 * Writes outPrefix-mix.wav, outPrefix-piano.wav, outPrefix-events.json
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const port = 4742
const outPrefix = process.argv[2]
if (!outPrefix) {
  console.error('need outPrefix')
  process.exit(1)
}

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})

async function render(isolatePiano) {
  const page = await browser.newPage()
  page.setDefaultTimeout(180000)
  await page.goto(`http://127.0.0.1:${port}/momo-jazz-pro/`, { waitUntil: 'domcontentloaded' })
  const downloadPromise = page.waitForEvent('download', { timeout: 180000 })
  const meta = await page.evaluate(async ({ isolatePiano }) => {
    const { arrangeBar } = await import('/momo-jazz-pro/src/arrange.ts')
    const { findTune } = await import('/momo-jazz-pro/src/data/tunes.ts')
    const { createGraph, applyDrumMix } = await import('/momo-jazz-pro/src/audio/graph.ts')
    const { createBook, playHit } = await import('/momo-jazz-pro/src/audio/play.ts')
    const { loadBank } = await import('/momo-jazz-pro/src/audio/bank.ts')
    const { DEFAULT_DRUM_MIX } = await import('/momo-jazz-pro/src/session.ts')
    const { DYNAMICS_CONFIG } = await import('/momo-jazz-pro/src/engine/dynamicsConfig.ts')
    const tune = findTune('so-what')
    const bpm = 136
    const bars = 16
    const barDur = (60 / bpm) * 4
    const tail = 0.8
    const t0 = 0.08
    const seconds = t0 + bars * barDur + tail
    const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100)
    const bank = await loadBank(ctx, () => {})
    const graph = createGraph(ctx)
    graph.master.gain.value = 0.9
    graph.drums.gain.value = isolatePiano ? 0 : DYNAMICS_CONFIG.voicing.defaultDrumBusGain
    graph.bass.gain.value = isolatePiano ? 0 : 0.86
    graph.piano.gain.value = DYNAMICS_CONFIG.piano.defaultMixerGain
    graph.guitar.gain.value = 0
    graph.wet.gain.value = 0.24
    applyDrumMix(graph, DEFAULT_DRUM_MIX, 0)
    const book = createBook()
    let t = t0
    const events = []
    for (let bar = 0; bar < bars; bar++) {
      const hits = arrangeBar({
        tune,
        barIndex: bar,
        chorus: 0,
        playBar: bar,
        bpm,
        style: 'swing',
        transpose: 0,
        trade: null,
        click: 'off',
        humanize: true,
        dynamics: 'auto',
        repeats: 6,
        fillsMode: 'section',
        swingRatioOverride: null,
        subdivision: '8ths',
      }).filter((hit) => hit.part !== 'guitar')
      if (!isolatePiano) {
        for (const hit of hits) {
          events.push({
            bar,
            time: hit.time,
            part: hit.part,
            drum: hit.drum ?? null,
            midi: hit.midi ?? null,
            velocity: hit.velocity,
            gain: hit.gain ?? null,
            duration: hit.duration,
            pan: hit.pan,
            release: hit.release ?? null,
          })
        }
      }
      for (const hit of hits) playHit(ctx, graph, bank, book, hit, t)
      t += barDur
    }
    const audio = await ctx.startRendering()
    let peak = 0
    const left = audio.getChannelData(0)
    const right = audio.getChannelData(1)
    for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
    const wav = encodeWav(left, right, 44100)
    const blob = new Blob([wav], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'theme16.wav'
    document.body.appendChild(a)
    a.click()
    return {
      peak,
      seconds: audio.length / 44100,
      normalize: graph ? true : true,
      events,
      t0,
      barDur,
      bars,
      tail,
    }
    function encodeWav(L, R, sr) {
      const n = L.length
      const buffer = new ArrayBuffer(44 + n * 4)
      const view = new DataView(buffer)
      const write = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
      write(0, 'RIFF')
      view.setUint32(4, 36 + n * 4, true)
      write(8, 'WAVE')
      write(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 2, true)
      view.setUint32(24, sr, true)
      view.setUint32(28, sr * 4, true)
      view.setUint16(32, 4, true)
      view.setUint16(34, 16, true)
      write(36, 'data')
      view.setUint32(40, n * 4, true)
      let o = 44
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i]))
        const r = Math.max(-1, Math.min(1, R[i]))
        view.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true)
        view.setInt16(o + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true)
        o += 4
      }
      return buffer
    }
  }, { isolatePiano })
  const download = await downloadPromise
  return { meta, download }
}

const mix = await render(false)
await mix.download.saveAs(`${outPrefix}-mix.wav`)
writeFileSync(`${outPrefix}-events.json`, JSON.stringify({
  t0: mix.meta.t0,
  barDur: mix.meta.barDur,
  bars: mix.meta.bars,
  tail: mix.meta.tail,
  peak: mix.meta.peak,
  seconds: mix.meta.seconds,
  humanize: true,
  events: mix.meta.events,
}))
console.log(JSON.stringify({ kind: 'mix', peak: mix.meta.peak, seconds: mix.meta.seconds, events: mix.meta.events.length }))
const piano = await render(true)
await piano.download.saveAs(`${outPrefix}-piano.wav`)
console.log(JSON.stringify({ kind: 'piano', peak: piano.meta.peak, seconds: piano.meta.seconds }))
await browser.close()
