import { arrangeBar, endingHits } from '../arrange.ts'
import { findTune } from '../data/tunes.ts'
import { DEFAULT_DRUM_MIX } from '../session.ts'
import { loadBank } from './bank.ts'
import { applyDrumMix, createGraph } from './graph.ts'
import { createBook, playHit } from './play.ts'

/**
 * Two choruses of medium swing on Jazz Blues in F, auto dynamics, rebalanced kit, then a button.
 * Chorus 1 is the restrained head. Chorus 2 builds. Used for the founder demo.
 */
export async function renderBluesWav(): Promise<{ blob: Blob; peak: number; seconds: number }> {
  const tune = findTune('jazz-blues-f')
  if (!tune) throw new Error('missing blues')
  const bpm = 132
  const choruses = 2
  const bars = tune.bars.length * choruses
  const seconds = (60 / bpm) * 4 * bars + 4.2
  const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100)
  const bank = await loadBank(ctx, () => {})
  const graph = createGraph(ctx)
  graph.master.gain.value = 0.9
  graph.drums.gain.value = 0.88
  graph.bass.gain.value = 0.8
  graph.piano.gain.value = 0.66
  graph.guitar.gain.value = 0
  graph.wet.gain.value = 0.24
  applyDrumMix(graph, DEFAULT_DRUM_MIX, 0)
  const book = createBook()
  let t = 0.08
  const barDur = (60 / bpm) * 4
  for (let i = 0; i < bars; i++) {
    const bar = i % tune.bars.length
    const chorus = Math.floor(i / tune.bars.length)
    const hits = arrangeBar({
      tune,
      barIndex: bar,
      chorus,
      playBar: i,
      bpm,
      style: 'swing',
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: true,
      dynamics: 'auto',
      repeats: choruses,
    }).filter((hit) => hit.part !== 'guitar')
    for (const hit of hits) playHit(ctx, graph, bank, book, hit, t)
    t += barDur
  }
  for (const hit of endingHits({ tune, bpm, style: 'swing', transpose: 0, humanize: true })) {
    if (hit.part !== 'guitar') playHit(ctx, graph, bank, book, hit, t)
  }
  const audio = await ctx.startRendering()
  let peak = 0
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c)
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  }
  return { blob: encodeWav(audio), peak, seconds }
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const length = buffer.length
  const bytes = length * channels * 2
  const ab = new ArrayBuffer(44 + bytes)
  const view = new DataView(ab)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, bytes, true)
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
