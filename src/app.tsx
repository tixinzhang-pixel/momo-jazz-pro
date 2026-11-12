import { useEffect, useRef, useState } from 'preact/hooks'
import { Engine, type Playhead } from './audio/engine.ts'
import { findTune, STYLE_LABEL, TUNES } from './data/tunes.ts'
import type { DynamicsMode } from './dynamics.ts'
import { deviceSummary } from './feedback.ts'
import {
  defaultMixer,
  loadSession,
  roleInfo,
  saveSession,
  type Session,
} from './session.ts'
import { displayKey, soundingKey } from './theory.ts'
import { turnAt } from './trading.ts'
import type { ChartId, ClickMode, Mixer, RoleId, StyleId } from './types.ts'
import { Gate } from './ui/gate.tsx'
import { Library } from './ui/library.tsx'
import { Player } from './ui/player.tsx'
import { AboutSheet, FeedbackSheet, MixSheet, PracticeSheet } from './ui/sheets.tsx'

type Screen = 'gate' | 'library' | 'player'
type SheetName = 'mix' | 'practice' | 'feedback' | 'about' | 'role' | null

function boot(): { session: Session; screen: Screen } {
  const loaded = loadSession()
  const query = new URLSearchParams(location.search).get('tune')
  let session = loaded
  if (query && findTune(query)) {
    const tune = findTune(query)!
    const memory = loaded.byTune[query]
    session = {
      ...loaded,
      tuneId: query,
      bpm: memory?.bpm ?? tune.bpm,
      style: memory?.style ?? tune.style,
      transpose: memory?.transpose ?? 0,
      swingRatioOverride: memory?.swingRatioOverride ?? null,
      subdivision: memory?.subdivision ?? '8ths',
    }
  }
  const screen: Screen = !session.role ? 'gate' : query && findTune(query) ? 'player' : 'library'
  return { session, screen }
}

const initial = boot()

export function App() {
  const [session, setSession] = useState<Session>(initial.session)
  const [screen, setScreen] = useState<Screen>(initial.screen)
  const [sheet, setSheet] = useState<SheetName>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [peek, setPeek] = useState(false)
  const [head, setHead] = useState<Playhead>({
    status: 'stopped',
    bar: 0,
    beat: 0,
    chorus: 0,
    playBar: 0,
    countBeat: null,
    bpm: initial.session.bpm,
  })
  const engine = useRef(new Engine())
  const sessionRef = useRef(session)
  const loopRef = useRef(loop)
  sessionRef.current = session
  loopRef.current = loop

  function patch(partial: Partial<Session>) {
    const prev = sessionRef.current
    const next: Session = { ...prev, ...partial }
    if (
      partial.bpm != null ||
      partial.transpose != null ||
      partial.style != null ||
      partial.tuneId != null ||
      partial.swingRatioOverride !== undefined ||
      partial.subdivision != null
    ) {
      next.byTune = {
        ...prev.byTune,
        [next.tuneId]: {
          bpm: next.bpm,
          transpose: next.transpose,
          style: next.style,
          swingRatioOverride: next.swingRatioOverride,
          subdivision: next.subdivision,
        },
      }
    }
    sessionRef.current = next
    setSession(next)
    saveSession(next)
  }

  useEffect(() => {
    engine.current.snapshot = () => {
      const current = sessionRef.current
      const tune = findTune(current.tuneId) ?? TUNES[0]
      return {
        tune,
        bpm: current.bpm,
        transpose: current.transpose,
        style: current.style,
        countIn: current.countIn,
        click: current.click,
        loop: loopRef.current,
        trade: current.tradeOn
          ? { on: true, len: current.tradeLen, userStarts: current.userStarts, role: current.role ?? 'bb' }
          : null,
        autoBpm: current.autoBpm,
        repeats: current.repeats,
        dynamics: current.dynamics,
        fillsMode: current.fillsMode,
        swingRatioOverride: current.swingRatioOverride,
        subdivision: current.subdivision,
      }
    }
    engine.current.onTempo = (bpm) => patch({ bpm })
    engine.current.onEnded = () => setPlaying(false)
  }, [])

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const next = engine.current.getPlayhead()
      setHead((prev) => (sameHead(prev, next) ? prev : next))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const renderParam = params.get('render')
    if (renderParam) {
      const choruses = Number(params.get('choruses')) || 2
      const targetTune = renderParam === '1' || renderParam === 'true' ? sessionRef.current.tuneId : renderParam
      console.log(`[Dev Render] Starting offline render for ${targetTune} (${choruses} choruses)...`)
      void import('./audio/render.ts')
        .then(({ renderTuneWav }) =>
          renderTuneWav({
            tuneId: targetTune,
            choruses,
            bpm: sessionRef.current.bpm,
            style: sessionRef.current.style,
            dynamics: sessionRef.current.dynamics,
            fillsMode: sessionRef.current.fillsMode,
            swingRatioOverride: sessionRef.current.swingRatioOverride,
            subdivision: sessionRef.current.subdivision,
          }),
        )
        .then(({ blob, peak, seconds }) => {
          console.log(`[Dev Render] Done: ${seconds.toFixed(1)}s, peak=${peak.toFixed(3)}`)
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${targetTune}-${choruses}c-render.wav`
          a.click()
          URL.revokeObjectURL(url)
        })
        .catch((err) => {
          console.error('[Dev Render] Failed:', err)
        })
    }
  }, [])

  useEffect(() => {
    engine.current.setMixer(session.mixer)
  }, [session.mixer])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (screen !== 'player') return
      event.preventDefault()
      void togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tune = findTune(session.tuneId) ?? TUNES[0]

  async function togglePlay() {
    if (engine.current.isRunning) {
      engine.current.stop()
      setPlaying(false)
      return
    }
    setError(null)
    setLoading(0.04)
    try {
      await engine.current.unlock((ratio) => setLoading(ratio))
      engine.current.setMixer(sessionRef.current.mixer)
      engine.current.start()
      setPlaying(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '这台浏览器没能出声')
      setPlaying(false)
    } finally {
      setLoading(null)
    }
  }

  function openTune(id: string) {
    const next = findTune(id)
    if (!next) return
    engine.current.stop()
    setPlaying(false)
    const memory = sessionRef.current.byTune[id]
    patch({
      tuneId: id,
      bpm: memory?.bpm ?? next.bpm,
      style: memory?.style ?? next.style,
      transpose: memory?.transpose ?? 0,
      swingRatioOverride: memory?.swingRatioOverride ?? null,
      subdivision: memory?.subdivision ?? '8ths',
    })
    setLoop(null)
    setAnchor(null)
    setPeek(false)
    setScreen('player')
  }

  function chooseRole(id: RoleId) {
    const info = roleInfo(id)
    const hadRole = sessionRef.current.role != null
    const drumMix = sessionRef.current.mixer.drumMix
    patch({ role: id, chart: info.chart, mixer: { ...defaultMixer(id), drumMix } })
    setSheet(null)
    if (!hadRole) {
      const query = new URLSearchParams(location.search).get('tune')
      setScreen(query && findTune(query) ? 'player' : 'library')
    }
  }

  function back() {
    engine.current.stop()
    setPlaying(false)
    setScreen('library')
  }

  const sound = soundingKey(tune.key, session.transpose)
  const shown = displayKey(tune.key, session.transpose, session.chart)
  const turn = turnAt(head.status === 'playing' ? head.playBar : 0, session.tradeLen, session.userStarts, session.role ?? 'bb')
  const mode = !session.tradeOn
    ? head.status === 'playing'
      ? `伴奏 · 第 ${head.bar + 1} 小节`
      : '伴奏'
    : `${session.tradeLen === 8 ? '对八' : '对四'} · 第 ${(head.status === 'playing' ? head.bar : 0) + 1} 小节 · ${turn.user ? '轮到你' : turn.partnerLabel}`

  return (
    <main class="app">
      {screen === 'gate' && <Gate onChoose={chooseRole} />}
      {screen === 'library' && session.role && (
        <Library
          role={session.role}
          hintHidden={session.hintHidden}
          onOpen={openTune}
          onRole={() => setSheet('role')}
          onAbout={() => setSheet('about')}
          onHideHint={() => patch({ hintHidden: true })}
        />
      )}
      {screen === 'player' && session.role && (
        <Player
          tune={tune}
          role={session.role}
          chart={session.chart}
          bpm={session.bpm}
          transpose={session.transpose}
          style={session.style}
          tradeOn={session.tradeOn}
          tradeLen={session.tradeLen}
          userStarts={session.userStarts}
          loop={loop}
          anchor={anchor}
          head={head}
          playing={playing}
          loading={loading}
          error={error}
          peek={peek}
          repeats={session.repeats}
          dynamics={session.dynamics}
          onBack={back}
          onPlay={() => void togglePlay()}
          onBpm={(bpm) => patch({ bpm: Math.max(40, Math.min(280, Math.round(bpm))) })}
          onTranspose={(semitones) => patch({ transpose: Math.max(-6, Math.min(6, semitones)) })}
          onLoopBar={(index) => {
            if (anchor == null) {
              setAnchor(index)
              setLoop({ start: index, end: index })
            } else {
              setLoop({ start: Math.min(anchor, index), end: Math.max(anchor, index) })
              setAnchor(null)
            }
          }}
          onClearLoop={() => {
            setLoop(null)
            setAnchor(null)
          }}
          onToggleTrade={() => {
            patch({ tradeOn: !session.tradeOn })
            setPeek(false)
          }}
          onMix={() => setSheet('mix')}
          onPractice={() => setSheet('practice')}
          onFeedback={() => setSheet('feedback')}
          onPeek={() => setPeek((value) => !value)}
          onRepeats={(repeats) => patch({ repeats })}
          onDynamics={(dynamics: DynamicsMode) => patch({ dynamics })}
        />
      )}

      {sheet === 'role' && (
        <div class="sheet-back" onClick={() => setSheet(null)}>
          <div class="sheet role-sheet" onClick={(event) => event.stopPropagation()}>
            <Gate onChoose={chooseRole} />
          </div>
        </div>
      )}
      {sheet === 'mix' && <MixSheet mixer={session.mixer} onMixer={(mixer: Mixer) => patch({ mixer })} onClose={() => setSheet(null)} />}
      {sheet === 'practice' && (
        <PracticeSheet
          countIn={session.countIn}
          click={session.click}
          tradeLen={session.tradeLen}
          userStarts={session.userStarts}
          autoBpm={session.autoBpm}
          chart={session.chart}
          style={session.style}
          dynamics={session.dynamics}
          fillsMode={session.fillsMode}
          swingRatioOverride={session.swingRatioOverride}
          subdivision={session.subdivision}
          bpm={session.bpm}
          onChange={(partial: {
            countIn?: 0 | 1 | 2
            click?: ClickMode
            tradeLen?: 4 | 8
            userStarts?: boolean
            autoBpm?: boolean
            chart?: ChartId
            style?: StyleId
            dynamics?: DynamicsMode
            fillsMode?: import('./engine/dynamicsConfig.ts').FillsMode
            swingRatioOverride?: number | null
            subdivision?: import('./engine/dynamicsConfig.ts').SubdivisionMode
          }) => patch(partial)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'feedback' && (
        <FeedbackSheet
          context={{
            tune: `${tune.title} · ${tune.titleEn}`,
            soundingKey: sound.name,
            transpose: session.transpose,
            chartLabel: session.chart === 'concert' ? `音乐会（${shown.name}）` : `${chartLabel(session.chart)}（${shown.name}）`,
            bpm: session.bpm,
            style: STYLE_LABEL[session.style],
            role: roleInfo(session.role).name,
            mode,
            device: deviceSummary(),
            when: new Date().toLocaleString('zh-CN', { hour12: false }),
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'about' && (
        <AboutSheet
          tuneTitle={tune.title}
          onExportWav={async () => {
            const { renderTuneWav } = await import('./audio/render.ts')
            const { blob, peak } = await renderTuneWav({
              tuneId: session.tuneId,
              choruses: session.repeats ?? 2,
              bpm: session.bpm,
              style: session.style,
              dynamics: session.dynamics,
              fillsMode: session.fillsMode,
              swingRatioOverride: session.swingRatioOverride,
              subdivision: session.subdivision,
            })
            console.log(`Rendered ${session.tuneId} WAV, peak=${peak.toFixed(3)}`)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${session.tuneId}-v03-render.wav`
            a.click()
            URL.revokeObjectURL(url)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  )
}

function sameHead(a: Playhead, b: Playhead): boolean {
  return a.status === b.status && a.bar === b.bar && a.beat === b.beat && a.chorus === b.chorus && a.countBeat === b.countBeat && a.playBar === b.playBar
}

function chartLabel(chart: ChartId): string {
  if (chart === 'bb') return '降 B 谱'
  if (chart === 'eb') return '降 E 谱'
  if (chart === 'f') return 'F 谱'
  return '音乐会'
}
