import type { DrumMix } from '../types.ts'
import { DEFAULT_DRUM_MIX } from '../session.ts'
import { DYNAMICS_CONFIG } from '../engine/dynamicsConfig.ts'

export interface DrumKit {
  ride: GainNode
  hat: GainNode
  snare: GainNode
  kick: GainNode
  brush: GainNode
}

export interface Graph {
  drums: GainNode
  kit: DrumKit
  bass: GainNode
  piano: GainNode
  guitar: GainNode
  click: GainNode
  master: GainNode
  wet: GainNode
  /** Post-compressor, post-trim node. Connected to the context destination unless `output` is set. */
  preOut: AudioNode
}

export function createGraph(ctx: BaseAudioContext, opts?: { output?: AudioNode | null }): Graph {
  const master = ctx.createGain()
  master.gain.value = 0.92
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 28
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 8
  comp.ratio.value = 3.5
  comp.attack.value = 0.01
  comp.release.value = 0.2
  const shaper = ctx.createWaveShaper()
  shaper.curve = softClip()
  shaper.oversample = '2x'
  const trim = ctx.createGain()
  trim.gain.value = 0.86

  master.connect(highpass)
  highpass.connect(comp)
  comp.connect(shaper)
  shaper.connect(trim)
  const output = opts && 'output' in opts ? opts.output : ctx.destination
  if (output) trim.connect(output)

  const convolver = ctx.createConvolver()
  convolver.normalize = true
  convolver.buffer = roomImpulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.26
  convolver.connect(wet)
  wet.connect(master)

  const bus = (send: number) => {
    const gain = ctx.createGain()
    gain.connect(master)
    if (send > 0) {
      const tap = ctx.createGain()
      tap.gain.value = send
      gain.connect(tap)
      tap.connect(convolver)
    }
    return gain
  }

  const drums = bus(0.18)
  const rideFilter = ctx.createBiquadFilter()
  rideFilter.type = 'highshelf'
  rideFilter.frequency.value = DYNAMICS_CONFIG.voicing.rideHighShelfHz
  rideFilter.gain.value = DYNAMICS_CONFIG.voicing.rideHighShelfDb
  rideFilter.connect(drums)
  const piece = (dest: AudioNode = drums) => {
    const gain = ctx.createGain()
    gain.connect(dest)
    return gain
  }
  const kit: DrumKit = {
    ride: piece(rideFilter),
    hat: piece(),
    snare: piece(),
    kick: piece(),
    brush: piece(),
  }
  const graph = {
    drums,
    kit,
    bass: bus(0.05),
    piano: bus(0.32),
    guitar: bus(0.16),
    click: bus(0),
    master,
    wet,
    preOut: trim,
  }
  applyDrumMix(graph, DEFAULT_DRUM_MIX, 0)
  return graph
}

export function applyDrumMix(graph: Graph, mix: DrumMix, at = 0): void {
  const ramp = (gain: GainNode, value: number) => {
    if (at <= 0) {
      gain.gain.value = value
      return
    }
    gain.gain.cancelScheduledValues(at)
    gain.gain.setTargetAtTime(Math.max(0, value), at, 0.015)
  }
  ramp(graph.kit.ride, mix.ride)
  ramp(graph.kit.hat, mix.hat)
  ramp(graph.kit.snare, mix.snare)
  ramp(graph.kit.kick, mix.kick)
  ramp(graph.kit.brush, mix.brush)
}

function softClip(): Float32Array<ArrayBuffer> {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 1.35)
  }
  return curve
}

function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * 1.05)
  const buffer = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    let low = 0
    for (let i = 0; i < len; i++) {
      const t = i / rate
      const white = Math.random() * 2 - 1
      low += 0.2 * (white - low)
      const early = t < 0.018 ? t / 0.018 : 1
      const tap = (t > 0.013 && t < 0.016) || (t > 0.027 && t < 0.03) ? 0.35 : 0
      const env = Math.pow(1 - i / len, 2.6) * early
      data[i] = (low * 0.62 + white * tap) * env * (c === 0 ? 1 : 0.9)
    }
  }
  return buffer
}
