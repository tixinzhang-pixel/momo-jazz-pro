/**
 * Render stems in headless Chrome (the app's OfflineAudioContext path) and print metrics.
 * Usage: node scripts/measure-v032.mjs [port]
 * The dev server must already be running at that port.
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const port = Number(process.argv[2] || 4742)
const outPath = process.argv[3] || '/tmp/momo-measure.json'
const choruses = Number(process.argv[4] || 6)
const fillsMode = process.argv[5] || 'section'
const tradeOn = process.argv[6] === 'trade'
const isolate = process.argv[7] && process.argv[7] !== '-' ? process.argv[7] : null
const tap = process.argv[8] && process.argv[8] !== '-' ? process.argv[8] : null

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})
const page = await browser.newPage()
page.setDefaultTimeout(600000)
await page.goto(`http://127.0.0.1:${port}/momo-jazz-pro/`, { waitUntil: 'domcontentloaded' })
const result = await page.evaluate(
  async ({ choruses, fillsMode, tradeOn, isolate, tap }) => {
    const mod = await import('/momo-jazz-pro/src/audio/measureJob.ts')
    const repeats = Math.max(choruses, 6)
    const parts = []
    for (let start = 0; start < choruses; start += 2) {
      const n = Math.min(2, choruses - start)
      parts.push(
        await mod.measureSession({
          tuneId: 'so-what',
          choruses: n,
          chorusStart: start,
          repeats,
          bpm: 136,
          style: 'swing',
          dynamics: 'auto',
          fillsMode,
          isolate,
          tap,
          trade: tradeOn ? { on: true, len: 4, userStarts: true, role: 'bb' } : null,
        }),
      )
    }
    const merged = parts[0]
    for (const part of parts.slice(1)) {
      for (const key of Object.keys(part.perChorus)) {
        merged.perChorus[key] = (merged.perChorus[key] || []).concat(part.perChorus[key] || [])
        merged.perBar[key] = (merged.perBar[key] || []).concat(part.perBar[key] || [])
      }
      merged.hits.headSnareByChorus = merged.hits.headSnareByChorus.concat(part.hits.headSnareByChorus)
      merged.hits.soloSnareByChorus = merged.hits.soloSnareByChorus.concat(part.hits.soloSnareByChorus)
    }
    const mean = (xs) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0)
    merged.hits.headSnarePerBar = mean(merged.hits.headSnareByChorus)
    merged.hits.soloSnarePerBar = mean(merged.hits.soloSnareByChorus)
    merged.choruses = choruses
    merged.peak = Math.max(...parts.map((part) => part.peak))
    return merged
  },
  { choruses, fillsMode, tradeOn, isolate, tap },
)
writeFileSync(outPath, JSON.stringify(result))
console.log(compact(result))
await browser.close()

function compact(data) {
  const r = (n) => Math.round(n * 10) / 10
  const lines = []
  for (const [key, values] of Object.entries(data.perChorus)) {
    if (key === 'mix' && data.perChorus.drums) continue
    lines.push(`${key}: ${values.map(r).join(', ')}`)
  }
  lines.push(`hits snare H/S ${data.hits.headSnarePerBar.toFixed(2)}/${data.hits.soloSnarePerBar.toFixed(2)} rideQ ${data.hits.rideQuarterMinusSkipDb}`)
  return lines.join('\n')
}

function summarize(data) {
  const pc = data.perChorus
  const n = data.choruses
  const headIdx = [0]
  if (n >= 3) headIdx.push(n - 1)
  const soloIdx = []
  for (let i = 0; i < n; i++) if (!headIdx.includes(i)) soloIdx.push(i)
  const avg = (arr, idx) => {
    const xs = idx.map((i) => arr[i])
    return xs.reduce((s, v) => s + v, 0) / xs.length
  }
  const mix = pc.mix
  const drums = pc.drums
  const bass = pc.bass
  const piano = pc.piano
  const ride = pc.ride
  const snare = pc.snare
  const kick = pc.kick
  const hat = pc.hat
  const rideBand = pc.rideBand
  const snareBand = pc.snareBand
  const rel = (stem, chorus) => {
    const bars = data.perBar[stem][chorus]
    const chorusDb = data.perChorus[stem][chorus]
    const out = {}
    for (const bar of [4, 8, 12, 16, 20, 24, 28, 32]) out[bar] = round(bars[bar - 1] - chorusDb)
    const early = bars.slice(1, 15)
    out.earlyMean = round(early.reduce((s, v) => s + v, 0) / early.length - chorusDb)
    return out
  }
  const soloChorus = soloIdx[0] ?? 1
  return {
    choruses: n,
    fillsMode: data.fillsMode,
    peak: round(data.peak),
    perChorus: {
      mix: mix.map(round),
      drums: drums.map(round),
      bass: bass.map(round),
      piano: piano.map(round),
      ride: ride.map(round),
      snare: snare.map(round),
      kick: kick.map(round),
      hat: hat.map(round),
      rideBand: rideBand.map(round),
      snareBand: snareBand.map(round),
      kickBand: pc.kickBand.map(round),
    },
    headVsSolo: {
      drums: round(avg(drums, soloIdx) - avg(drums, headIdx)),
      rideBand: round(avg(rideBand, soloIdx) - avg(rideBand, headIdx)),
      rideStem: round(avg(ride, soloIdx) - avg(ride, headIdx)),
      snareStem: round(avg(snare, soloIdx) - avg(snare, headIdx)),
      mix: round(avg(mix, soloIdx) - avg(mix, headIdx)),
      bass: round(avg(bass, soloIdx) - avg(bass, headIdx)),
      piano: round(avg(piano, soloIdx) - avg(piano, headIdx)),
      rideMinusSnareSolo: round(avg(rideBand, soloIdx) - avg(snareBand, soloIdx)),
      rideStemMinusSnareSolo: round(avg(ride, soloIdx) - avg(snare, soloIdx)),
      drumsMinusBassSolo: round(avg(drums, soloIdx) - avg(bass, soloIdx)),
      pianoVsMix: round(avg(piano, soloIdx.concat(headIdx)) - avg(mix, soloIdx.concat(headIdx))),
      bassRange: round(Math.max(...bass) - Math.min(...bass)),
    },
    blockSteps: {
      drums: diff(drums),
      ride: diff(ride),
      snare: diff(snare),
      rideBand: diff(rideBand),
      piano: diff(piano),
    },
    fillsSolo: {
      drums: rel('drums', soloChorus),
      snare: rel('snare', soloChorus),
      kick: rel('kick', soloChorus),
      rideBand: rel('rideBand', soloChorus),
      snareBand: rel('snareBand', soloChorus),
    },
    fillsHead: {
      drums: rel('drums', 0),
      snare: rel('snare', 0),
      kick: rel('kick', 0),
    },
    hits: data.hits,
  }
}

function diff(arr) {
  const out = []
  for (let i = 1; i < arr.length; i++) out.push(round(arr[i] - arr[i - 1]))
  return out
}

function round(n) {
  return Math.round(n * 10) / 10
}
