import { useState } from 'preact/hooks'
import { STYLE_LABEL, TUNES } from '../data/tunes.ts'
import { inWeChat } from '../feedback.ts'
import { roleInfo } from '../session.ts'
import type { RoleId, Tune } from '../types.ts'

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'swing', label: 'Swing' },
  { id: 'bossa', label: 'Bossa' },
  { id: 'ballad', label: 'Ballad' },
] as const

export function Library({
  role,
  hintHidden,
  onOpen,
  onRole,
  onAbout,
  onHideHint,
}: {
  role: RoleId
  hintHidden: boolean
  onOpen: (id: string) => void
  onRole: () => void
  onAbout: () => void
  onHideHint: () => void
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const info = roleInfo(role)
  const tunes = TUNES.filter((tune) => {
    if (filter === 'all') return true
    if (filter === 'swing') return tune.style === 'swing' || tune.style === 'up'
    return tune.style === filter
  })
  return (
    <section class="library">
      <header class="topbar">
        <div class="brand">
          <p class="brand-en">MOMO</p>
          <p class="brand-sub">Jazz Pro</p>
        </div>
        <button type="button" class="pill" onClick={onRole}>
          {info.name}
        </button>
      </header>
      {inWeChat() ? (
        <p class="banner">微信里可以直接练。要装到主屏幕、离线用，请点右上角，用浏览器打开。</p>
      ) : (
        !hintHidden && (
          <p class="banner">
            添加到主屏幕后，像 App 一样打开。第一次播放会缓存采样，之后没网也能练。
            <button type="button" onClick={onHideHint}>知道了</button>
          </p>
        )
      )}
      <div class="lib-head">
        <h1>今晚练什么</h1>
        <div class="filters" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              class={filter === item.id ? 'chip on' : 'chip'}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div class="setlist">
        {tunes.length === 0 && <p class="empty">这一类还没有曲子。</p>}
        {tunes.map((tune) => (
          <TuneRow key={tune.id} tune={tune} onOpen={onOpen} />
        ))}
      </div>
      <footer class="lib-foot">
        <p>只有和弦进行，没有旋律和歌词。谱面待教务复核。</p>
        <button type="button" class="text-btn" onClick={onAbout}>
          采样与版本
        </button>
      </footer>
    </section>
  )
}

function TuneRow({ tune, onOpen }: { tune: Tune; onOpen: (id: string) => void }) {
  return (
    <button type="button" class="tune" onClick={() => onOpen(tune.id)}>
      <span class="tempo">{tune.bpm}</span>
      <span class="tune-body">
        <span class="tune-title">{tune.title}</span>
        <span class="tune-meta">
          {tune.titleEn} · {tune.key.replace('b', '♭').replace('#', '♯')} · {tune.bars.length} 小节
        </span>
        <span class="blurb">{tune.blurb}</span>
      </span>
      <span class={`stamp ${tune.style}`}>{STYLE_LABEL[tune.style]}</span>
    </button>
  )
}
