import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const out = '/opt/cursor/artifacts'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
})
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto('http://127.0.0.1:4731/', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '降 B' }).click()
await page.getByRole('heading', { name: '今晚练什么' }).waitFor()
await page.screenshot({ path: `${out}/library-phone.png` })

await page.getByRole('button', { name: /Jazz Blues in F/ }).click()
await page.getByRole('heading', { name: '爵士布鲁斯' }).waitFor()
const header = await page.locator('.now-title p').innerText()
if (!header.includes('演奏 F') || !header.includes('G')) {
  throw new Error(`expected transposed header, got ${header}`)
}
const firstChord = await page.locator('.bar').first().innerText()
if (!firstChord.includes('G')) throw new Error(`expected G chord on Bb chart, got ${firstChord}`)
await page.getByRole('button', { name: '少一遍' }).click()
await page.locator('.repeat-value strong').filter({ hasText: '4' }).waitFor()
await page.screenshot({ path: `${out}/player-phone.png` })

await page.getByRole('button', { name: '对四' }).click()
await page.getByText('鼓手在奏').waitFor()
await page.screenshot({ path: `${out}/trading-phone.png` })

await page.getByRole('button', { name: '练习' }).click()
await page.getByRole('button', { name: '我先' }).click()
await page.getByRole('button', { name: '完成' }).click()
await page.getByText('轮到你').waitFor()
await page.screenshot({ path: `${out}/trading-you-phone.png` })

await page.getByRole('button', { name: '播放' }).click()
await page.locator('.beatnum').getByText(/^[1-4]$/).waitFor({ timeout: 20000 })
await page.screenshot({ path: `${out}/trading-playing-phone.png` })
await page.getByRole('button', { name: '停止' }).click()

await page.getByRole('button', { name: '混音' }).click()
await page.getByRole('button', { name: '鼓组内部' }).click()
await page.getByLabel('Ride').waitFor()
await page.screenshot({ path: `${out}/mixer-drums-phone.png` })
await page.getByRole('button', { name: '完成' }).click()

await page.getByRole('button', { name: '反馈' }).click()
await page.locator('textarea').fill('中速的 ride 还可以再松一点')
await page.getByRole('button', { name: '复制文字' }).click()
await page.waitForTimeout(200)
const clip = await page.evaluate(() => navigator.clipboard.readText())
if (!clip.includes('中速的 ride') || !clip.includes('爵士布鲁斯') || !clip.includes('降 B')) {
  throw new Error(`clipboard missing context:\n${clip}`)
}
await page.getByRole('button', { name: '完成' }).click()

await page.setViewportSize({ width: 360, height: 740 })
await page.screenshot({ path: `${out}/player-narrow.png` })

const render = await page.evaluate(async () => window.__momo.renderBluesWav())
const wav = Buffer.from(render.base64, 'base64')
await writeFile(`${out}/blues-two-choruses.wav`, wav)
console.log(JSON.stringify({ header, firstChord, clipOk: true, peak: render.peak, wavBytes: wav.length, errors }, null, 2))
await browser.close()
