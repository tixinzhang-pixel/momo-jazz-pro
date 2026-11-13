import type { DynamicsMode } from '../dynamics.ts'
import { effectiveBpm, passCompleted, playingModeAt } from '../dynamics.ts'
import type { arrangeBar, endingHits } from '../arrange.ts'
import type { FillsMode, SubdivisionMode } from '../engine/dynamicsConfig.ts'
import type { ClickMode, Mixer, StyleId, TradeSettings, Tune } from '../types.ts'
import { loadBank, type LoadedBank } from './bank.ts'
import { applyDrumMix, createGraph, type Graph } from './graph.ts'
import { createBook, playHit, silence, type VoiceBook } from './play.ts'

export interface Snapshot {
  tune: Tune
  bpm: number
  transpose: number
  style: StyleId
  countIn: 0 | 1 | 2
  click: ClickMode
  loop: { start: number; end: number } | null
  trade: TradeSettings | null
  autoBpm: boolean
  repeats: number | null
  dynamics: DynamicsMode
  fillsMode?: FillsMode
  swingRatioOverride?: number | null
  subdivision?: SubdivisionMode
  introBars?: 0 | 4 | 8
}

export interface Playhead {
  status: 'stopped' | 'count' | 'playing'
  bar: number
  beat: number
  chorus: number
  playBar: number
  countBeat: number | null
  bpm: number
  /** Set during a So What bass-call intro. The chart bar is not the form bar. */
  introBar: number | null
}

interface Marker {
  kind: 'count' | 'bar' | 'intro'
  time: number
  beat: number
  bar: number
  chorus: number
  playBar: number
  dur: number
  bpm: number
  introBar?: number
}

export class Engine {
  private ctx: AudioContext | null = null
  private graph: Graph | null = null
  private bank: LoadedBank | null = null
  private book: VoiceBook = createBook()
  private timer = 0
  private epoch = 0
  private running = false
  private nextTime = 0
  private bar = 0
  private chorus = 0
  private playBar = 0
  private phase: 'count' | 'play' | 'ending' = 'play'
  private countLeft = 0
  private introLeft = 0
  private introIndex = 0
  private finishAt = 0
  private arrange: { arrangeBar: typeof arrangeBar; endingHits: typeof endingHits } | null = null
  private markers: Marker[] = []
  private wakeLock: WakeLockSentinel | null = null

  snapshot: () => Snapshot = () => {
    throw new Error('snapshot missing')
  }

  onTempo: (bpm: number) => void = () => {}
  onEnded: () => void = () => {}

  async unlock(onProgress: (ratio: number) => void): Promise<void> {
    this.ensureContext()
    const ctx = this.ctx
    if (!ctx) return
    const resumed = ctx.resume()
    const silent = ctx.createBuffer(1, 8, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = silent
    src.connect(ctx.destination)
    src.start()
    await resumed
    this.arrange ??= await import('../arrange.ts')
    if (!this.bank) {
      if (!this.graph) this.graph = createGraph(ctx)
      this.bank = await loadBank(ctx, onProgress)
    }
  }

  start(): void {
    if (!this.ctx || !this.graph || !this.bank || !this.arrange) return
    void this.ctx.resume()
    this.haltSources()
    this.running = true
    this.epoch += 1
    const epoch = this.epoch
    const snap = this.snapshot()
    this.bar = snap.loop?.start ?? 0
    this.chorus = 0
    this.playBar = 0
    this.phase = snap.countIn > 0 ? 'count' : 'play'
    this.countLeft = snap.countIn * 4
    const intro = snap.tune.id === 'so-what' && !snap.loop ? (snap.introBars ?? 0) : 0
    this.introLeft = intro
    this.introIndex = 0
    this.nextTime = this.ctx.currentTime + 0.07
    this.markers = []
    this.book = createBook()
    const tick = () => {
      if (epoch !== this.epoch) return
      if (this.phase === 'ending' && this.ctx && this.ctx.currentTime >= this.finishAt) {
        this.finishNaturally()
        return
      }
      this.ahead()
      this.timer = window.setTimeout(tick, 25)
    }
    tick()
    void this.requestWake()
  }

  stop(): void {
    this.epoch += 1
    window.clearTimeout(this.timer)
    this.running = false
    this.haltSources()
    this.markers = []
    void this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
  }

  get isRunning(): boolean {
    return this.running
  }

  setMixer(mixer: Mixer): void {
    if (!this.ctx || !this.graph) return
    const now = this.ctx.currentTime
    const ramp = (gain: GainNode, value: number) => {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setTargetAtTime(Math.max(0, value), now, 0.015)
    }
    ramp(this.graph.master, mixer.master)
    ramp(this.graph.drums, mixer.mute.drums ? 0 : mixer.drums)
    ramp(this.graph.bass, mixer.mute.bass ? 0 : mixer.bass)
    ramp(this.graph.piano, mixer.mute.piano ? 0 : mixer.piano)
    ramp(this.graph.guitar, mixer.mute.guitar ? 0 : mixer.guitar)
    ramp(this.graph.click, mixer.click)
    ramp(this.graph.wet, mixer.reverb)
    applyDrumMix(this.graph, mixer.drumMix, now)
  }

  getPlayhead(): Playhead {
    const snapBpm = this.safeBpm()
    if (!this.ctx || !this.running) {
      return { status: 'stopped', bar: 0, beat: 0, chorus: 0, playBar: 0, countBeat: null, bpm: snapBpm, introBar: null }
    }
    const heard = this.ctx.currentTime - (this.ctx.outputLatency || 0)
    let marker: Marker | null = null
    for (const item of this.markers) if (item.time <= heard) marker = item
    if (!marker || marker.kind === 'count') {
      return {
        status: 'count',
        bar: 0,
        beat: marker?.beat ?? 0,
        chorus: 0,
        playBar: 0,
        countBeat: marker?.beat ?? 0,
        bpm: marker?.bpm ?? snapBpm,
        introBar: null,
      }
    }
    if (marker.kind === 'intro') {
      const beatLen = marker.dur / 4
      const beat = beatLen > 0 ? Math.min(3, Math.max(0, Math.floor((heard - marker.time) / beatLen))) : 0
      return {
        status: 'playing',
        bar: 0,
        beat,
        chorus: 0,
        playBar: 0,
        countBeat: null,
        bpm: marker.bpm,
        introBar: marker.introBar ?? 0,
      }
    }
    const beatLen = marker.dur / 4
    const beat = beatLen > 0 ? Math.min(3, Math.max(0, Math.floor((heard - marker.time) / beatLen))) : 0
    return {
      status: 'playing',
      bar: marker.bar,
      beat,
      chorus: marker.chorus,
      playBar: marker.playBar,
      countBeat: null,
      bpm: marker.bpm,
      introBar: null,
    }
  }

  private finishNaturally(): void {
    this.epoch += 1
    window.clearTimeout(this.timer)
    this.running = false
    this.phase = 'play'
    void this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
    this.onEnded()
  }

  private ahead(): void {
    if (!this.ctx || !this.graph || !this.bank || !this.arrange || this.phase === 'ending') return
    const horizon = this.ctx.currentTime + 0.12
    let guard = 0
    while (this.nextTime < horizon && guard < 6) {
      guard += 1
      const snap = this.snapshot()
      const countSec = 60 / snap.bpm
      if (this.phase === 'count') {
        const beat = (4 - (this.countLeft % 4)) % 4
        playHit(
          this.ctx,
          this.graph,
          this.bank,
          this.book,
          { time: 0, part: 'click', velocity: beat === 0 ? 0.95 : 0.64, duration: 0.04, pan: 0 },
          this.nextTime,
        )
        this.markers.push({
          kind: 'count',
          time: this.nextTime,
          beat,
          bar: 0,
          chorus: 0,
          playBar: 0,
          dur: countSec,
          bpm: snap.bpm,
        })
        this.nextTime += countSec
        this.countLeft -= 1
        if (this.countLeft <= 0) this.phase = 'play'
        continue
      }
      const playing = this.introLeft > 0 ? 'HEAD' : playingModeAt(this.chorus, snap.repeats)
      const bpm = effectiveBpm(snap.bpm, playing, snap.dynamics)
      const beatSec = 60 / bpm
      if (this.introLeft > 0) {
        const introBar = this.introIndex
        const hits = this.arrange.arrangeBar({
          tune: snap.tune,
          barIndex: introBar % 2,
          chorus: 0,
          playBar: introBar,
          bpm,
          style: snap.style,
          transpose: snap.transpose,
          trade: null,
          click: snap.click,
          humanize: true,
          dynamics: snap.dynamics,
          repeats: 1,
          fillsMode: 'off',
          swingRatioOverride: snap.swingRatioOverride,
          subdivision: snap.subdivision,
          intro: true,
        })
        for (const hit of hits) playHit(this.ctx, this.graph, this.bank, this.book, hit, this.nextTime)
        const dur = beatSec * 4
        this.markers.push({
          kind: 'intro',
          time: this.nextTime,
          beat: 0,
          bar: 0,
          chorus: 0,
          playBar: 0,
          dur,
          bpm,
          introBar,
        })
        this.nextTime += dur
        this.introIndex += 1
        this.introLeft -= 1
        continue
      }
      const hits = this.arrange.arrangeBar({
        tune: snap.tune,
        barIndex: this.bar,
        chorus: this.chorus,
        playBar: this.playBar,
        bpm,
        style: snap.style,
        transpose: snap.transpose,
        trade: snap.trade,
        click: snap.click,
        humanize: true,
        dynamics: snap.dynamics,
        repeats: snap.repeats,
        fillsMode: snap.fillsMode,
        swingRatioOverride: snap.swingRatioOverride,
        subdivision: snap.subdivision,
      })
      for (const hit of hits) playHit(this.ctx, this.graph, this.bank, this.book, hit, this.nextTime)
      const dur = beatSec * 4
      this.markers.push({
        kind: 'bar',
        time: this.nextTime,
        beat: 0,
        bar: this.bar,
        chorus: this.chorus,
        playBar: this.playBar,
        dur,
        bpm,
      })
      this.nextTime += dur
      this.playBar += 1
      const end = snap.loop?.end ?? snap.tune.bars.length - 1
      const start = snap.loop?.start ?? 0
      if (this.bar >= end) {
        const completed = this.chorus + 1
        if (passCompleted(completed, snap.repeats)) {
          const ending = this.arrange.endingHits({
            tune: snap.tune,
            bpm: snap.bpm,
            style: snap.style,
            transpose: snap.transpose,
            humanize: true,
          })
          for (const hit of ending) playHit(this.ctx, this.graph, this.bank, this.book, hit, this.nextTime)
          this.markers.push({
            kind: 'bar',
            time: this.nextTime,
            beat: 0,
            bar: start,
            chorus: this.chorus,
            playBar: this.playBar,
            dur: beatSec * 2,
            bpm: snap.bpm,
          })
          this.phase = 'ending'
          this.finishAt = this.nextTime + beatSec * 3.2
          break
        }
        this.bar = start
        this.chorus += 1
        if (snap.autoBpm) this.onTempo(Math.min(280, Math.round(snap.bpm + 5)))
      } else {
        this.bar += 1
      }
      if (this.markers.length > 16) this.markers.splice(0, this.markers.length - 16)
    }
  }

  private ensureContext(): void {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) throw new Error('这台浏览器没有 Web Audio')
    this.ctx = new Ctx()
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    this.graph = createGraph(this.ctx)
  }

  private haltSources(): void {
    if (!this.ctx) return
    silence(this.book, this.ctx.currentTime)
  }

  private safeBpm(): number {
    try {
      return this.snapshot().bpm
    } catch {
      return 120
    }
  }

  private async requestWake(): Promise<void> {
    try {
      this.wakeLock = await navigator.wakeLock?.request('screen')
    } catch {
      this.wakeLock = null
    }
  }
}
