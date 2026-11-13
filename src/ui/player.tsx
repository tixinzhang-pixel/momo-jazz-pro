import { useEffect } from 'preact/hooks'
import { STYLE_LABEL } from '../data/tunes.ts'
import type { Playhead } from '../audio/engine.ts'
import { stepRepeats, type DynamicsMode } from '../dynamics.ts'
import { DYNAMICS_LABEL } from './sheets.tsx'
import { chartSemitoneShift, displayKey, parseChord, soundingKey, spellChord, transposeModel } from '../theory.ts'
import { chorusSwapsHands, turnAt } from '../trading.ts'
import type { ChartId, StyleId, Tune } from '../types.ts'
import type { RoleId } from '../types.ts'
import { ChordGlyph } from './chord.tsx'

export function Player({
  tune,
  role,
  chart,
  bpm,
  transpose,
  style,
  tradeOn,
  tradeLen,
  userStarts,
  loop,
  anchor,
  head,
  playing,
  loading,
  error,
  peek,
  repeats,
  dynamics,
  onBack,
  onPlay,
  onBpm,
  onTranspose,
  onLoopBar,
  onClearLoop,
  onToggleTrade,
  onMix,
  onPractice,
  onFeedback,
  onPeek,
  onRepeats,
  onDynamics,
}: {
  tune: Tune
  role: RoleId
  chart: ChartId
  bpm: number
  transpose: number
  style: StyleId
  tradeOn: boolean
  tradeLen: 4 | 8
  userStarts: boolean
  loop: { start: number; end: number } | null
  anchor: number | null
  head: Playhead
  playing: boolean
  loading: number | null
  error: string | null
  peek: boolean
  repeats: number | null
  dynamics: DynamicsMode
  onBack: () => void
  onPlay: () => void
  onBpm: (bpm: number) => void
  onTranspose: (semitones: number) => void
  onLoopBar: (index: number) => void
  onClearLoop: () => void
  onToggleTrade: () => void
  onMix: () => void
  onPractice: () => void
  onFeedback: () => void
  onPeek: () => void
  onRepeats: (repeats: number | null) => void
  onDynamics: (mode: DynamicsMode) => void
}) {
  const sound = soundingKey(tune.key, transpose)
  const shown = displayKey(tune.key, transpose, chart)
  const shift = chartSemitoneShift(transpose, chart)
  const turn = turnAt(head.status === 'playing' ? head.playBar : 0, tradeLen, userStarts, role)
  const inIntro = head.introBar != null
  const formBar = head.status === 'playing' && !inIntro ? head.bar : 0
  const current = tune.bars[Math.min(formBar, tune.bars.length - 1)]

  useEffect(() => {
    if (head.status !== 'playing') return
    const el = document.querySelector(`[data-bar="${head.bar}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [head.bar, head.chorus, head.status])

  return (
    <section class="player">
      <header class="topbar player-bar">
        <button type="button" class="back" onClick={onBack} aria-label="回曲库">
          曲库
        </button>
        <div class="now-title">
          <h1>
            {tune.title}
            {tune.review === 'pending-dean' && <span class="badge-pending">待审</span>}
          </h1>
          <p>
            演奏 {sound.name}
            {chart !== 'concert' && ` · ${chartName(chart)}谱 ${shown.name}`}
          </p>
        </div>
        <button type="button" class="icon-btn" onClick={onFeedback} aria-label="反馈">
          反馈
        </button>
      </header>

      <div class="stage-wrap">
        {tradeOn && !peek ? (
          <TradingStage
            tune={tune}
            turn={turn}
            head={head}
            shift={shift}
            sharp={shown.sharp}
            formBar={current}
          />
        ) : (
          <div class="chart-scroll">
            <div class="paper">
              <div class="paper-meta">
                <span>{STYLE_LABEL[style]}</span>
                <span>{inIntro ? `前奏 ${head.introBar! + 1}` : `${tune.bars.length} 小节`}</span>
                <span>{shown.name}</span>
              </div>
              <div class="bars">
                {tune.bars.map((bar, index) => {
                  const active = head.status === 'playing' && !inIntro && head.bar === index
                  const inLoop = loop != null && index >= loop.start && index <= loop.end
                  return (
                    <button
                      key={index}
                      type="button"
                      data-bar={index}
                      class={`bar${active ? ' is-now' : ''}${inLoop ? ' in-loop' : ''}`}
                      onClick={() => onLoopBar(index)}
                    >
                      {bar.section && <span class="sec">{bar.section}</span>}
                      <span class={bar.chords.length > 1 ? 'chords dense-row' : 'chords'}>
                        {bar.chords.map((slot, chordIndex) => (
                          <ChordGlyph
                            key={chordIndex}
                            dense={bar.chords.length > 1 || slot.symbol.length > 6}
                            chord={spellChord(transposeModel(parseChord(slot.symbol), shift), shown.sharp)}
                          />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {head.status === 'count' && <div class="count-overlay">{(head.countBeat ?? 0) + 1}</div>}
          </div>
        )}
        {tradeOn && (
          <button type="button" class="peek" onClick={onPeek}>
            {peek ? '看对四' : '看谱'}
          </button>
        )}
      </div>

      {loading != null && (
        <div class="veil" role="status">
          <p>乐队就位</p>
          <div class="meter">
            <span style={{ width: `${Math.round(loading * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p class="error">{error}</p>}

      <footer class="dock">
        <div class="transport">
          <div class="cluster">
            <button type="button" class="step" onClick={() => onBpm(bpm - 1)} aria-label="慢一点">
              −
            </button>
            <label class="readout">
              <input
                type="range"
                min="40"
                max="280"
                value={bpm}
                aria-label="速度"
                onInput={(e) => onBpm(Number((e.target as HTMLInputElement).value))}
              />
              <strong>{Math.round(bpm)}</strong>
              <span>BPM</span>
            </label>
            <button type="button" class="step" onClick={() => onBpm(bpm + 1)} aria-label="快一点">
              +
            </button>
          </div>
          <button type="button" class={playing ? 'play on' : 'play'} onClick={onPlay} aria-label={playing ? '停止' : '播放'}>
            {playing ? <span class="stop-mark" /> : <span class="play-mark" />}
          </button>
          <div class="cluster">
            <button type="button" class="step" onClick={() => onTranspose(transpose - 1)} aria-label="降半音">
              −
            </button>
            <div class="readout key">
              <strong>{sound.name}</strong>
              <span>调</span>
            </div>
            <button type="button" class="step" onClick={() => onTranspose(transpose + 1)} aria-label="升半音">
              +
            </button>
          </div>
        </div>
        <div class="repeat-row">
          <span class="repeat-label">遍数</span>
          <button type="button" class="step" aria-label="少一遍" onClick={() => onRepeats(stepRepeats(repeats, -1))}>
            −
          </button>
          <div class="repeat-value" aria-live="polite">
            <strong>{repeatReadout(repeats, playing, head)}</strong>
            <span>遍</span>
          </div>
          <button type="button" class="step" aria-label="多一遍" onClick={() => onRepeats(stepRepeats(repeats, 1))}>
            +
          </button>
          <button
            type="button"
            class={repeats == null ? 'chip on' : 'chip'}
            aria-label="一直循环"
            aria-pressed={repeats == null}
            onClick={() => onRepeats(repeats == null ? 4 : null)}
          >
            一直
          </button>
          <button type="button" class={dynamics === 'auto' ? 'chip' : 'chip on'} aria-label="力度" onClick={() => onDynamics(cycleDynamics(dynamics))}>
            力度 {DYNAMICS_LABEL[dynamics]}
          </button>
        </div>
        <div class="dock-row">
          <button type="button" class="chip" onClick={onPractice}>
            练习
          </button>
          <button type="button" class={loop ? 'chip on' : 'chip'} onClick={onClearLoop}>
            {loop ? `${loop.start + 1}–${loop.end + 1} 小节` : '全曲'}
          </button>
          <button type="button" class={tradeOn ? 'chip on' : 'chip'} onClick={onToggleTrade}>
            {tradeOn ? '退出对奏' : tradeLen === 8 ? '对八' : '对四'}
          </button>
          <button type="button" class="chip" onClick={onMix}>
            混音
          </button>
        </div>
        {anchor != null && <p class="dock-hint">再点一小节，连成循环</p>}
      </footer>
    </section>
  )
}

function TradingStage({
  tune,
  turn,
  head,
  shift,
  sharp,
  formBar,
}: {
  tune: Tune
  turn: ReturnType<typeof turnAt>
  head: Playhead
  shift: number
  sharp: boolean
  formBar: Tune['bars'][number]
}) {
  const beat = head.status === 'count' ? (head.countBeat ?? 0) + 1 : head.status === 'playing' ? head.beat + 1 : '–'
  return (
    <div class={turn.user ? 'stage you' : 'stage band'} aria-live="polite">
      <p class="stage-kicker">{head.status === 'count' ? '预备' : turn.user ? '轮到你' : turn.partnerLabel}</p>
      {head.status === 'playing' && turn.prep && <p class="prep">准备接</p>}
      {head.status === 'playing' && turn.handoff && <p class="prep">准备交给乐队</p>}
      <div class="stage-chords">
        {formBar.chords.map((slot, index) => (
          <ChordGlyph key={index} chord={spellChord(transposeModel(parseChord(slot.symbol), shift), sharp)} />
        ))}
      </div>
      <div class="beatnum">{beat}</div>
      <div class="pips" aria-hidden="true">
        {Array.from({ length: turn.len }, (_, index) => (
          <i key={index} class={head.status === 'playing' && index === turn.barInTurn ? 'on' : ''} />
        ))}
      </div>
      <p class="stage-meta">
        {head.status === 'playing' ? `${turn.barInTurn + 1} / ${turn.len}` : '按下播放'}
        {chorusSwapsHands(tune.bars.length, turn.len) ? ' · 下一遍换先手' : ''}
        {head.chorus > 0 ? ` · 第 ${head.chorus + 1} 遍` : ''}
      </p>
    </div>
  )
}

function repeatReadout(repeats: number | null, playing: boolean, head: Playhead): string {
  if (playing && head.status !== 'stopped') {
    const now = head.status === 'count' ? 1 : head.chorus + 1
    return `${now}/${repeats ?? '∞'}`
  }
  return repeats == null ? '∞' : String(repeats)
}

function cycleDynamics(mode: DynamicsMode): DynamicsMode {
  if (mode === 'auto') return 'low'
  if (mode === 'low') return 'med'
  if (mode === 'med') return 'high'
  return 'auto'
}

function chartName(chart: ChartId): string {
  if (chart === 'bb') return '降 B'
  if (chart === 'eb') return '降 E'
  if (chart === 'f') return 'F'
  return 'C'
}
