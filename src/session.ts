import type { DynamicsMode } from './dynamics.ts'
import type { ChartId, ClickMode, DrumMix, Mixer, RoleId, StyleId } from './types.ts'

/** Ride sits about −5 dB under the rest of the kit. Snare and feathered kick are a touch forward. */
export const DEFAULT_DRUM_MIX: DrumMix = {
  ride: 0.55,
  hat: 1,
  snare: 1.18,
  kick: 1.26,
  brush: 1,
}

export interface RoleInfo {
  id: RoleId
  name: string
  mark: string
  hint: string
  chart: ChartId
  mute: keyof Mixer['mute'] | null
}

export const ROLES: RoleInfo[] = [
  { id: 'drums', name: '鼓', mark: '鼓', hint: '钢琴跟你对四。你的四小节只留 2、4 拍踩镲。', chart: 'concert', mute: null },
  { id: 'bass', name: '贝斯', mark: '贝', hint: '贝斯关掉，鼓手跟你对四。', chart: 'concert', mute: 'bass' },
  { id: 'piano', name: '钢琴', mark: '钢', hint: '钢琴关掉，鼓手跟你对四。', chart: 'concert', mute: 'piano' },
  { id: 'guitar', name: '吉他', mark: '吉', hint: '吉他关掉，鼓手跟你对四。', chart: 'concert', mute: 'guitar' },
  { id: 'bb', name: '降 B', mark: 'B♭', hint: '小号、次中音、高音萨克斯。谱面按降 B 显示。', chart: 'bb', mute: null },
  { id: 'eb', name: '降 E', mark: 'E♭', hint: '中音、上低音萨克斯。谱面按降 E 显示。', chart: 'eb', mute: null },
  { id: 'f', name: 'F', mark: 'F', hint: '圆号。谱面按 F 调显示。', chart: 'f', mute: null },
  { id: 'vocal', name: '声乐', mark: '声', hint: '任意转调找调。鼓手跟你对四。', chart: 'concert', mute: null },
]

export const CHARTS: { id: ChartId; label: string }[] = [
  { id: 'concert', label: '音乐会 C' },
  { id: 'bb', label: '降 B' },
  { id: 'eb', label: '降 E' },
  { id: 'f', label: 'F' },
]

export function roleInfo(id: RoleId | null): RoleInfo {
  return ROLES.find((role) => role.id === id) ?? ROLES[0]
}

export function defaultMixer(role: RoleId): Mixer {
  const mute = { drums: false, bass: false, piano: false, guitar: true }
  const part = roleInfo(role).mute
  if (part) mute[part] = true
  return {
    master: 0.9,
    drums: 0.86,
    bass: 0.8,
    piano: 0.7,
    guitar: 0.46,
    click: 0.62,
    reverb: 0.28,
    mute,
    drumMix: { ...DEFAULT_DRUM_MIX },
  }
}

export interface TuneMemory {
  bpm: number
  transpose: number
  style: StyleId
}

export interface Session {
  role: RoleId | null
  chart: ChartId
  mixer: Mixer
  countIn: 0 | 1 | 2
  click: ClickMode
  tradeOn: boolean
  tradeLen: 4 | 8
  userStarts: boolean
  autoBpm: boolean
  /** null = keep playing. 1–30 = that many passes, then a button and stop. */
  repeats: number | null
  dynamics: DynamicsMode
  tuneId: string
  bpm: number
  transpose: number
  style: StyleId
  hintHidden: boolean
  byTune: Record<string, TuneMemory>
}

const KEY = 'momo-jazz-pro-v1'

export function freshSession(): Session {
  return {
    role: null,
    chart: 'concert',
    mixer: defaultMixer('bb'),
    countIn: 1,
    click: 'off',
    tradeOn: false,
    tradeLen: 4,
    userStarts: false,
    autoBpm: false,
    repeats: null,
    dynamics: 'auto',
    tuneId: 'jazz-blues-f',
    bpm: 132,
    transpose: 0,
    style: 'swing',
    hintHidden: false,
    byTune: {},
  }
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return freshSession()
    const parsed = JSON.parse(raw) as Partial<Session>
    const base = freshSession()
    return {
      ...base,
      ...parsed,
      repeats: parsed.repeats === undefined ? null : parsed.repeats,
      dynamics: parsed.dynamics ?? 'auto',
      mixer: {
        ...base.mixer,
        ...parsed.mixer,
        mute: { ...base.mixer.mute, ...parsed.mixer?.mute },
        drumMix: { ...DEFAULT_DRUM_MIX, ...parsed.mixer?.drumMix },
      },
    }
  } catch {
    return freshSession()
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* private mode */
  }
}
