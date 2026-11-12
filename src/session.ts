import type { DynamicsMode } from './dynamics.ts'
import {
  DYNAMICS_CONFIG,
  type FillsMode,
  type SubdivisionMode,
} from './engine/dynamicsConfig.ts'
import type { ChartId, ClickMode, DrumMix, Mixer, RoleId, StyleId } from './types.ts'

/**
 * v0.3 A4: Ride sits about -8 dB under unity (~3 dB lower than v0.2's 0.55) so the ride band
 * sits 2-3 dB below the snare band in SOLO. Snare and kick sit slightly above unity.
 */
export const DEFAULT_DRUM_MIX: DrumMix = {
  ride: DYNAMICS_CONFIG.voicing.defaultRideFaderGain, // 0.38 (~ -8.4 dB)
  hat: 0.92,
  snare: 1.24,
  kick: 1.18,
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
    drums: DYNAMICS_CONFIG.voicing.defaultDrumBusGain, // 0.48 (about 3-5 dB below bass)
    bass: 0.86,
    piano: DYNAMICS_CONFIG.piano.defaultMixerGain, // 0.82 (audible under drums)
    guitar: 0.46,
    click: 0.62,
    reverb: 0.24,
    mute,
    drumMix: { ...DEFAULT_DRUM_MIX },
  }
}

export interface TuneMemory {
  bpm: number
  transpose: number
  style: StyleId
  swingRatioOverride?: number | null
  subdivision?: SubdivisionMode
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
  /** A3 Fills setting: 'section' (default), 'every4', or 'off'. */
  fillsMode: FillsMode
  /**
   * Scope B Swing ratio override (1.0 to 3.5).
   * null = Auto (follows per-style, per-tempo default curve).
   */
  swingRatioOverride: number | null
  /** Scope B Subdivision toggle: '8ths' | '16th-swing' | '16th-straight'. */
  subdivision: SubdivisionMode
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
    fillsMode: 'section',
    swingRatioOverride: null,
    subdivision: '8ths',
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
      fillsMode: parsed.fillsMode ?? 'section',
      swingRatioOverride: parsed.swingRatioOverride === undefined ? null : parsed.swingRatioOverride,
      subdivision: parsed.subdivision ?? '8ths',
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
