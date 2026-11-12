import { arrangeBar, endingHits } from '../arrange.ts'
import { findTune } from '../data/tunes.ts'
import type { DynamicsMode } from '../dynamics.ts'
import { DYNAMICS_CONFIG, type FillsMode, type SubdivisionMode } from '../engine/dynamicsConfig.ts'
import { DEFAULT_DRUM_MIX } from '../session.ts'
import type { StyleId } from '../types.ts'
import { loadBank } from './bank.ts'
import { applyDrumMix, createGraph } from './graph.ts'
import { createBook, playHit } from './play.ts'

export interface RenderOptions {
  tuneId?: string
  choruses?: number
  bpm?: number
  style?: StyleId
  dynamics?: DynamicsMode
  fillsMode?: FillsMode
  swingRatioOverride?: number | null
  subdivision?: SubdivisionMode
}

/**
 * OfflineAudioContext renderer for Miles to verify levels across N choruses.
 * Can be called via dev script, URL flag (?render=<tuneId>), or in-app export button.
 */
export async function renderTuneWav(
  options: RenderOptions = {},
): Promise<{ blob: Blob; peak: number; seconds: number; audio: AudioBuffer }> {
  const tuneId = options.tuneId ?? 'so-what'
  const tune = findTune(tuneId) ?? findTune('jazz-blues-f')!
  const bpm = options.bpm ?? tune.bpm
  const choruses = options.choruses ?? 2
  const style = options.style ?? tune.style
  const dynamics = options.dynamics ?? 'auto'
  const fillsMode = options.fillsMode ?? 'section'
  const swingRatioOverride = options.swingRatioOverride ?? null
  const subdivision = options.subdivision ?? '8ths'
  const bars = tune.bars.length * choruses
  const barDur = (60 / bpm) * 4
  const seconds = barDur * bars + 4.2
  const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100)
  const bank = await loadBank(ctx, () => {})
  const graph = createGraph(ctx)
  graph.master.gain.value = 0.9
  graph.drums.gain.value = DYNAMICS_CONFIG.voicing.defaultDrumBusGain
  graph.bass.gain.value = 0.86
  graph.piano.gain.value = DYNAMICS_CONFIG.piano.defaultMixerGain
  graph.guitar.gain.value = 0
  graph.wet.gain.value = 0.24
  applyDrumMix(graph, DEFAULT_DRUM_MIX, 0)
  const book = createBook()
  let t = 0.08
  for (let i = 0; i < bars; i++) {
    const bar = i % tune.bars.length
    const chorus = Math.floor(i / tune.bars.length)
    const hits = arrangeBar({
      tune,
      barIndex: bar,
      chorus,
      playBar: i,
      bpm,
      style,
      transpose: 0,
      trade: null,
      click: 'off',
      humanize: true,
      dynamics,
      repeats: choruses,
      fillsMode,
      swingRatioOverride,
      subdivision,
    }).filter((hit) => hit.part !== 'guitar')
    for (const hit of hits) playHit(ctx, graph, bank, book, hit, t)
    t += barDur
  }
  for (const hit of endingHits({ tune, bpm, style, transpose: 0, humanize: true })) {
    if (hit.part !== 'guitar') playHit(ctx, graph, bank, book, hit, t)
  }
  const audio = await ctx.startRendering()
  let peak = 0
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c)
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  }
  return { blob: encodeWav(audio), peak, seconds, audio }
}

export async function renderBluesWav(): Promise<{ blob: Blob; peak: number; seconds: number }> {
  const res = await renderTuneWav({ tuneId: 'jazz-blues-f', choruses: 2, bpm: 132, style: 'swing' })
  return { blob: res.blob, peak: res.peak, seconds: res.seconds }
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
