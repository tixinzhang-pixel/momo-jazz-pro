import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { APP_VERSION } from '../version.ts'
import { FEEDBACK_KINDS, buildFeedback, type FeedbackContext, type FeedbackKind } from '../feedback.ts'
import { CHARTS } from '../session.ts'
import type { DynamicsMode } from '../dynamics.ts'
import type { ChartId, ClickMode, DrumMix, Mixer, StyleId } from '../types.ts'
import { STYLE_LABEL } from '../data/tunes.ts'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-back" onClick={onClose}>
      <div
        class="sheet"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="sheet-handle" />
        <div class="sheet-title">
          <h2>{title}</h2>
          <button type="button" class="text-btn" onClick={onClose}>
            完成
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const PARTS: { id: keyof Mixer['mute']; label: string }[] = [
  { id: 'drums', label: '鼓' },
  { id: 'bass', label: '贝斯' },
  { id: 'piano', label: '钢琴' },
  { id: 'guitar', label: '吉他' },
]

const DRUM_FADERS: { id: keyof DrumMix; label: string }[] = [
  { id: 'ride', label: 'Ride' },
  { id: 'hat', label: '踩镲（脚）' },
  { id: 'snare', label: '军鼓 / Comping' },
  { id: 'kick', label: '底鼓' },
  { id: 'brush', label: '刷子' },
]

export const DYNAMICS_LABEL: Record<DynamicsMode, string> = {
  auto: '自动',
  low: '轻',
  med: '中',
  high: '强',
}

export function MixSheet({
  mixer,
  onMixer,
  onClose,
}: {
  mixer: Mixer
  onMixer: (mixer: Mixer) => void
  onClose: () => void
}) {
  const [kitOpen, setKitOpen] = useState(false)
  const set = (partial: Partial<Mixer>) => onMixer({ ...mixer, ...partial })
  const setDrum = (id: keyof DrumMix, value: number) =>
    onMixer({ ...mixer, drumMix: { ...mixer.drumMix, [id]: value } })
  return (
    <Sheet title="混音" onClose={onClose}>
      <label class="fader">
        <span>总音量</span>
        <input type="range" min="0" max="1" step="0.01" value={mixer.master} onInput={(e) => set({ master: num(e) })} />
      </label>
      {PARTS.map((part) => (
        <div class="fader part" key={part.id}>
          <div class="fader-name">
            <span>{part.label}</span>
            <button
              type="button"
              class={mixer.mute[part.id] ? 'mute on' : 'mute'}
              aria-pressed={mixer.mute[part.id]}
              onClick={() => set({ mute: { ...mixer.mute, [part.id]: !mixer.mute[part.id] } })}
            >
              {mixer.mute[part.id] ? '已静音' : '静音'}
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={mixer[part.id]}
            onInput={(e) => set({ [part.id]: num(e) } as Partial<Mixer>)}
          />
          {part.id === 'drums' && (
            <button
              type="button"
              class="text-btn kit-toggle"
              aria-expanded={kitOpen}
              onClick={() => setKitOpen((open) => !open)}
            >
              {kitOpen ? '收起鼓组' : '鼓组内部'}
            </button>
          )}
          {part.id === 'drums' && kitOpen && (
            <div class="submix">
              {DRUM_FADERS.map((fader) => (
                <label class="fader" key={fader.id}>
                  <span>{fader.label}</span>
                  <input
                    type="range"
                    min="0"
                    max="1.4"
                    step="0.01"
                    value={mixer.drumMix[fader.id]}
                    aria-label={fader.label}
                    onInput={(e) => setDrum(fader.id, num(e))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <label class="fader">
        <span>节拍器</span>
        <input type="range" min="0" max="1" step="0.01" value={mixer.click} onInput={(e) => set({ click: num(e) })} />
      </label>
      <label class="fader">
        <span>房间</span>
        <input type="range" min="0" max="1" step="0.01" value={mixer.reverb} onInput={(e) => set({ reverb: num(e) })} />
      </label>
      <p class="sheet-note">吉他默认关掉。鼓、贝斯、钢琴先出来。</p>
    </Sheet>
  )
}

export function PracticeSheet({
  countIn,
  click,
  tradeLen,
  userStarts,
  autoBpm,
  chart,
  style,
  dynamics,
  onChange,
  onClose,
}: {
  countIn: 0 | 1 | 2
  click: ClickMode
  tradeLen: 4 | 8
  userStarts: boolean
  autoBpm: boolean
  chart: ChartId
  style: StyleId
  dynamics: DynamicsMode
  onChange: (partial: {
    countIn?: 0 | 1 | 2
    click?: ClickMode
    tradeLen?: 4 | 8
    userStarts?: boolean
    autoBpm?: boolean
    chart?: ChartId
    style?: StyleId
    dynamics?: DynamicsMode
  }) => void
  onClose: () => void
}) {
  return (
    <Sheet title="练习" onClose={onClose}>
      <p class="field-label">力度</p>
      <div class="segment">
        {(Object.keys(DYNAMICS_LABEL) as DynamicsMode[]).map((id) => (
          <button key={id} type="button" class={dynamics === id ? 'on' : ''} onClick={() => onChange({ dynamics: id })}>
            {DYNAMICS_LABEL[id]}
          </button>
        ))}
      </div>
      <p class="sheet-note">自动会按主题、独奏和最后一遍自己起伏。轻 / 中 / 强是整首一个力度。</p>
      <p class="field-label">风格</p>
      <div class="segment">
        {(Object.keys(STYLE_LABEL) as StyleId[]).map((id) => (
          <button key={id} type="button" class={style === id ? 'on' : ''} onClick={() => onChange({ style: id })}>
            {STYLE_LABEL[id]}
          </button>
        ))}
      </div>
      <p class="field-label">谱面显示</p>
      <div class="segment">
        {CHARTS.map((item) => (
          <button key={item.id} type="button" class={chart === item.id ? 'on' : ''} onClick={() => onChange({ chart: item.id })}>
            {item.label}
          </button>
        ))}
      </div>
      <p class="field-label">预备拍</p>
      <div class="segment">
        {([0, 1, 2] as const).map((n) => (
          <button key={n} type="button" class={countIn === n ? 'on' : ''} onClick={() => onChange({ countIn: n })}>
            {n === 0 ? '无' : `${n} 小节`}
          </button>
        ))}
      </div>
      <p class="field-label">节拍器</p>
      <div class="segment">
        <button type="button" class={click === 'off' ? 'on' : ''} onClick={() => onChange({ click: 'off' })}>关</button>
        <button type="button" class={click === 'backbeat' ? 'on' : ''} onClick={() => onChange({ click: 'backbeat' })}>2 和 4</button>
        <button type="button" class={click === 'all' ? 'on' : ''} onClick={() => onChange({ click: 'all' })}>每拍</button>
      </div>
      <p class="field-label">对四长度</p>
      <div class="segment">
        <button type="button" class={tradeLen === 4 ? 'on' : ''} onClick={() => onChange({ tradeLen: 4 })}>四小节</button>
        <button type="button" class={tradeLen === 8 ? 'on' : ''} onClick={() => onChange({ tradeLen: 8 })}>八小节</button>
      </div>
      <p class="field-label">谁先</p>
      <div class="segment">
        <button type="button" class={!userStarts ? 'on' : ''} onClick={() => onChange({ userStarts: false })}>乐队</button>
        <button type="button" class={userStarts ? 'on' : ''} onClick={() => onChange({ userStarts: true })}>我先</button>
      </div>
      <button type="button" class={autoBpm ? 'toggle on' : 'toggle'} onClick={() => onChange({ autoBpm: !autoBpm })}>
        <span>每遍 +5 BPM</span>
        <span>{autoBpm ? '开' : '关'}</span>
      </button>
    </Sheet>
  )
}

export function FeedbackSheet({ context, onClose }: { context: Omit<FeedbackContext, 'kind' | 'note'>; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('sound')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const text = buildFeedback({ ...context, kind, note })
  async function copy() {
    const ok = await copyText(text)
    setCopied(ok ? 'ok' : 'fail')
  }
  return (
    <Sheet title="反馈" onClose={onClose}>
      <p class="sheet-note">写一句就够。曲目、调、速度和设备会自动附上。复制后贴到微信内测群。</p>
      <div class="segment wrap">
        {FEEDBACK_KINDS.map((item) => (
          <button key={item.id} type="button" class={kind === item.id ? 'on' : ''} onClick={() => setKind(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <textarea value={note} placeholder="比如：中速 Swing 的 ride 还是有点紧" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      <button type="button" class="solid" onClick={() => void copy()}>
        复制文字
      </button>
      {copied === 'ok' && <p class="ok">已复制。打开微信内测群，粘贴发送。</p>}
      {copied === 'fail' && (
        <>
          <p class="sheet-note">复制没成功，请长按下面的文字手动复制。</p>
          <textarea readOnly value={text} />
        </>
      )}
    </Sheet>
  )
}

export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="采样与版本" onClose={onClose}>
      <p class="about-version">Momo Jazz Pro · v{APP_VERSION}</p>
      <p>
        鼓、低音提琴、钢琴、闷音吉他来自 Frank Wen 的 FluidR3 GM（MIT）。鼓的单音取自 WebAudioFont 对同一音源的提取；钢琴、贝斯和吉他的 MP3 来自 midi-js-soundfonts（CC BY 3.0）。
      </p>
      <p>刷子的刷奏是程序合成的，不是采样。采样包可以整包替换，见 <span class="mono">public/samples/bank.json</span>。</p>
      <p>曲库只有和弦进行，没有旋律和歌词，待教务复核。第一轮没有主题旋律。</p>
    </Sheet>
  )
}

function num(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.left = '-999px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}
