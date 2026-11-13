/**
 * Render a tune in 2-chorus pieces (the offline context finishes), then concatenate.
 * Usage: node scripts/render-listen.mjs port out.wav tuneId choruses [trade|intro]
 */
import { chromium } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.argv[2] || 4742)
const outPath = process.argv[3]
const tuneId = process.argv[4] || 'so-what'
const choruses = Number(process.argv[5] || 2)
const flag = process.argv[6] || ''
const trade = flag === 'trade'
const intro = flag === 'intro'

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})
const dir = mkdtempSync(join(tmpdir(), 'momo-listen-'))
const parts = []
for (let start = 0; start < choruses; start += 2) {
  const n = Math.min(2, choruses - start)
  const part = join(dir, `part-${start}.wav`)
  parts.push(part)
  const page = await browser.newPage()
  page.setDefaultTimeout(300000)
  await page.goto(`http://127.0.0.1:${port}/momo-jazz-pro/`, { waitUntil: 'domcontentloaded' })
  const downloadPromise = page.waitForEvent('download', { timeout: 300000 })
  const meta = await page.evaluate(
    async ({ tuneId, n, start, choruses, trade, intro }) => {
      const { renderTuneWav } = await import('/momo-jazz-pro/src/audio/render.ts')
      const { blob, peak, seconds } = await renderTuneWav({
        tuneId,
        choruses: n,
        chorusStart: start,
        repeats: choruses,
        trade: trade ? { on: true, len: 4, userStarts: true, role: 'bb' } : null,
        introBars: intro && start === 0 ? 4 : 0,
        ending: start + n >= choruses,
        dynamics: 'auto',
        fillsMode: 'section',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'listen.wav'
      document.body.appendChild(a)
      a.click()
      return { peak, seconds }
    },
    { tuneId, n, start, choruses, trade, intro },
  )
  const download = await downloadPromise
  await download.saveAs(part)
  console.log(JSON.stringify({ part, start, ...meta }))
  await page.close()
}
await browser.close()

if (parts.length === 1) {
  spawnSync('cp', [parts[0], outPath], { stdio: 'inherit' })
} else {
  const list = join(dir, 'list.txt')
  writeFileSync(list, parts.map((part) => `file '${part}'`).join('\n'))
  const merged = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outPath], { encoding: 'utf8' })
  if (merged.status !== 0) {
    console.error(merged.stderr)
    process.exit(merged.status ?? 1)
  }
}
rmSync(dir, { recursive: true, force: true })
console.log(JSON.stringify({ outPath }))
