import type { DrumId, Hit } from '../types.ts'
import { nearestPitched, type LoadedBank } from './bank.ts'
import type { Graph } from './graph.ts'

export interface VoiceBook {
  rr: Record<string, number>
  openHats: GainNode[]
  active: AudioScheduledSourceNode[]
  noise: AudioBuffer | null
}

export function createBook(): VoiceBook {
  return { rr: {}, openHats: [], active: [], noise: null }
}

export function playHit(
  ctx: BaseAudioContext,
  graph: Graph,
  bank: LoadedBank,
  book: VoiceBook,
  hit: Hit,
  barStart: number,
): void {
  const when = Math.max(ctx.currentTime + 0.005, barStart + hit.time)
  if (hit.part === 'click') {
    playClick(ctx, graph.click, book, when, hit.velocity)
    return
  }
  const gain = hit.gain ?? 1
  if (hit.drum === 'brushSwirl' || hit.drum === 'brushTap') {
    playBrush(ctx, graph.kit.brush, book, when, hit.duration, hit.velocity, gain, hit.drum === 'brushSwirl', hit.pan)
    return
  }
  if (hit.part === 'drums' && hit.drum) {
    playDrum(ctx, graph, bank, book, hit.drum, when, hit.velocity, gain, hit.duration, hit.pan)
    return
  }
  if (hit.midi == null) return
  const list = hit.part === 'bass' ? bank.bass : hit.part === 'guitar' ? bank.guitar : bank.piano
  const sample = nearestPitched(list, hit.midi)
  if (!sample) return
  const dest = hit.part === 'bass' ? graph.bass : hit.part === 'guitar' ? graph.guitar : graph.piano
  const level = hit.velocity * gain
  playSample(ctx, dest, book, sample.buffer, when, level, hit.duration, hit.pan, {
    rate: Math.pow(2, (hit.midi - sample.midi) / 12),
    filterHz: hit.part === 'bass' ? 700 + level * 2200 : hit.part === 'guitar' ? 1400 + level * 2800 : 1800 + level * 6400,
    trackGain: false,
    legato: hit.part === 'bass',
    pianoRelease: hit.part === 'piano' ? (hit.release ?? 'normal') : undefined,
    midi: hit.midi,
  })
  if (hit.part === 'bass') playFinger(ctx, graph.bass, book, when, level)
}

function playDrum(
  ctx: BaseAudioContext,
  graph: Graph,
  bank: LoadedBank,
  book: VoiceBook,
  drum: DrumId,
  when: number,
  velocity: number,
  gain: number,
  duration: number,
  pan: number,
): void {
  if (drum === 'hatClosed' || drum === 'hatPedal') chokeHats(book, when)
  const list = bank.drums[drum]
  if (!list?.length) return
  const index = book.rr[drum] ?? 0
  book.rr[drum] = index + 1
  const buffer = list[index % list.length]
  if (!buffer) return
  const cents = ((index % 5) - 2) * 9
  const hat = drum === 'hatOpen'
  const node = playSample(ctx, drumBus(graph, drum), book, buffer, when, velocity * gain, duration, pan, {
    detuneCents: cents,
    filterHz: drumFilter(drum, velocity),
    trackGain: hat,
  })
  if (hat && node) book.openHats.push(node)
}

function drumBus(graph: Graph, drum: DrumId): GainNode {
  if (drum === 'kick') return graph.kit.kick
  if (drum === 'ride' || drum === 'rideBell' || drum === 'crash') return graph.kit.ride
  if (drum === 'hatClosed' || drum === 'hatPedal' || drum === 'hatOpen') return graph.kit.hat
  if (drum === 'brushSwirl' || drum === 'brushTap') return graph.kit.brush
  return graph.kit.snare
}

function drumFilter(drum: DrumId, velocity: number): number {
  if (drum === 'kick') return 1500
  if (drum === 'snare') return 3200 + velocity * 2800
  if (drum === 'sidestick') return 4800
  if (drum.startsWith('tom')) return 2400 + velocity * 1800
  if (drum === 'hatClosed' || drum === 'hatPedal') return 6200
  return 7000 + velocity * 5000
}

function playSample(
  ctx: BaseAudioContext,
  dest: AudioNode,
  book: VoiceBook,
  buffer: AudioBuffer,
  when: number,
  velocity: number,
  duration: number,
  pan: number,
  opts: {
    rate?: number
    detuneCents?: number
    filterHz: number
    trackGain: boolean
    legato?: boolean
    pianoRelease?: 'soft' | 'normal'
    midi?: number
  },
): GainNode | null {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const rate = (opts.rate ?? 1) * Math.pow(2, (opts.detuneCents ?? 0) / 1200)
  src.playbackRate.value = rate
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = opts.filterHz
  filter.Q.value = 0.6
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  const drum = opts.detuneCents != null
  const amp = Math.pow(velocity, drum ? 1.15 : 1.35) * (drum ? 0.95 : 0.78)
  const natural = buffer.duration / Math.max(0.25, rate)
  const hold = duration > 0 ? Math.min(duration, natural) : natural
  gain.gain.setValueAtTime(Math.max(0.0008, amp), when)
  if (opts.pianoRelease && duration > 0) {
    const reg = Math.min(1, Math.max(0, ((opts.midi ?? 60) - 48) / 30))
    const wobble = ((opts.midi ?? 60) % 7) / 7
    let tau1 = (0.016 + 0.01 * wobble) * (1.15 - 0.3 * reg)
    let tau2 = (0.05 + 0.025 * (((opts.midi ?? 60) * 3) % 7) / 7) * (1.2 - 0.4 * reg)
    if (opts.pianoRelease === 'soft') {
      tau1 *= 1.5
      tau2 *= 1.35
    }
    const tail = Math.min(0.45, Math.max(0.12, tau2 * 8))
    const curve = new Float32Array(64)
    for (let i = 0; i < curve.length; i++) {
      const t = (i / (curve.length - 1)) * tail
      const g = 0.72 * Math.exp(-t / tau1) + 0.28 * Math.exp(-t / tau2)
      curve[i] = Math.max(0.0008, amp * g)
    }
    const holdEnd = when + Math.max(0.02, hold)
    gain.gain.setValueCurveAtTime(curve, holdEnd, tail)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(panner)
    panner.connect(dest)
    src.start(when)
    src.stop(holdEnd + tail + 0.02)
    book.active.push(src)
    return opts.trackGain ? gain : null
  }
  if (duration > 0 && duration < natural - 0.02) {
    // Bass stays up until 6 ms before the next onset, then a short overlap.
    // Other notes keep the older 30 ms release.
    const release = opts.legato ? 0.006 : 0.03
    const fadeAt = when + Math.max(0.012, hold - release)
    gain.gain.setValueAtTime(Math.max(0.0008, amp), fadeAt)
    if (opts.legato) gain.gain.setTargetAtTime(0.0008, fadeAt, 0.007)
    else gain.gain.exponentialRampToValueAtTime(0.0008, fadeAt + 0.035)
  }
  src.connect(filter)
  filter.connect(gain)
  gain.connect(panner)
  panner.connect(dest)
  src.start(when)
  src.stop(when + hold + (opts.legato ? 0.045 : 0.06))
  book.active.push(src)
  return opts.trackGain ? gain : null
}

function chokeHats(book: VoiceBook, when: number): void {
  for (const gain of book.openHats) {
    gain.gain.cancelScheduledValues(when)
    gain.gain.setTargetAtTime(0.0008, when, 0.012)
  }
  book.openHats.length = 0
}

function playFinger(ctx: BaseAudioContext, dest: AudioNode, book: VoiceBook, when: number, velocity: number): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, book)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1400
  filter.Q.value = 0.8
  const gain = ctx.createGain()
  const amp = 0.09 * velocity
  gain.gain.setValueAtTime(amp, when)
  gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.018)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  src.start(when)
  src.stop(when + 0.03)
  book.active.push(src)
}

function playBrush(
  ctx: BaseAudioContext,
  dest: AudioNode,
  book: VoiceBook,
  when: number,
  duration: number,
  velocity: number,
  hitGain: number,
  swirl: boolean,
  pan: number,
): void {
  velocity *= hitGain
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, book)
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = swirl ? 1600 : 2400
  filter.Q.value = swirl ? 0.55 : 1.6
  const gain = ctx.createGain()
  const amp = (swirl ? 0.22 : 0.16) * velocity
  if (swirl) {
    gain.gain.setValueAtTime(0.0008, when)
    gain.gain.linearRampToValueAtTime(amp, when + duration * 0.42)
    gain.gain.linearRampToValueAtTime(0.0008, when + duration)
  } else {
    gain.gain.setValueAtTime(amp, when)
    gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.07)
  }
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  src.connect(filter)
  filter.connect(gain)
  gain.connect(panner)
  panner.connect(dest)
  const stop = when + Math.max(duration, 0.08) + 0.02
  src.start(when)
  src.stop(stop)
  book.active.push(src)
}

function playClick(ctx: BaseAudioContext, dest: AudioNode, book: VoiceBook, when: number, velocity: number): void {
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(velocity > 0.8 ? 1450 : 980, when)
  osc.frequency.exponentialRampToValueAtTime(280, when + 0.04)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.18 * velocity, when)
  gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.045)
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 400
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  osc.start(when)
  osc.stop(when + 0.05)
  book.active.push(osc)
}

function noiseBuffer(ctx: BaseAudioContext, book: VoiceBook): AudioBuffer {
  if (book.noise && book.noise.sampleRate === ctx.sampleRate) return book.noise
  const len = Math.floor(ctx.sampleRate * 0.5)
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  book.noise = buffer
  return buffer
}

export function silence(book: VoiceBook, when: number): void {
  for (const src of book.active) {
    try {
      src.stop(when)
    } catch {
      /* already stopped */
    }
  }
  book.active.length = 0
  book.openHats.length = 0
}
