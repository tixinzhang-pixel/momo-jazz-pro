import { useState } from 'preact/hooks'
import { STYLE_LABEL, TUNES } from '../data/tunes.ts'
import { inWeChat } from '../feedback.ts'
import { roleInfo } from '../session.ts'
import type { RoleId, Tune } from '../types.ts'

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'standards', label: '标准曲' },
  { id: 'pop', label: '流行' },
  { id: 'swing', label: 'Swing' },
  { id: 'bossa', label: 'Bossa' },
  { id: 'ballad', label: 'Ballad' },
  { id: 'shuffle', label: 'Shuffle' },
  { id: 'original', label: '原创' },
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
  const [query, setQuery] = useState('')
  const info = roleInfo(role)
  const q = query.trim().toLowerCase()
  const tunes = TUNES.filter((tune) => {
    if (filter === 'standards' && !tune.tags.includes('jazz-standard')) return false
    if (filter === 'pop' && !tune.tags.includes('pop')) return false
    if (filter === 'original' && !tune.tags.includes('momo-original')) return false
    if (filter === 'swing' && tune.style !== 'swing' && tune.style !== 'up') return false
    if (filter === 'bossa' && tune.style !== 'bossa') return false
    if (filter === 'ballad' && tune.style !== 'ballad') return false
    if (filter === 'shuffle' && tune.style !== 'shuffle') return false

    if (q) {
      const match =
        tune.title.toLowerCase().includes(q) ||
        tune.titleEn.toLowerCase().includes(q) ||
        (tune.composer && tune.composer.toLowerCase().includes(q)) ||
        tune.key.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
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
        <input
          type="search"
          class="search-input"
          placeholder="搜索曲名、英文名、作曲家、调性..."
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
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
        {tunes.length === 0 && <p class="empty">没有找到匹配的曲子。</p>}
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
        <span class="tune-title">
          {tune.title}
          {tune.review === 'pending-dean' && <span class="badge-pending">待审</span>}
        </span>
        <span class="tune-meta">
          {tune.composer ? `${tune.composer} · ` : ''}
          {tune.titleEn} · {tune.key.replace('b', '♭').replace('#', '♯')} · {tune.bars.length} 小节
        </span>
        <span class="blurb">{tune.blurb}</span>
      </span>
      <span class={`stamp ${tune.style}`}>{STYLE_LABEL[tune.style]}</span>
    </button>
  )
}
