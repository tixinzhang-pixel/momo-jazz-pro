export type StyleId = 'swing' | 'up' | 'ballad' | 'bossa'

export type RoleId = 'drums' | 'bass' | 'piano' | 'guitar' | 'bb' | 'eb' | 'f' | 'vocal'

export type ChartId = 'concert' | 'bb' | 'eb' | 'f'

export type PartId = 'drums' | 'bass' | 'piano' | 'guitar' | 'click'

export type ClickMode = 'off' | 'backbeat' | 'all'

export type ChordKind =
  | 'maj'
  | 'maj7'
  | '6'
  | 'm'
  | 'm7'
  | 'm6'
  | 'm9'
  | 'm11'
  | 'mmaj'
  | '7'
  | '9'
  | '13'
  | '7alt'
  | '7b9'
  | '7#9'
  | '7b13'
  | '7#11'
  | '7sus'
  | 'm7b5'
  | 'dim7'
  | 'sus'
  | 'aug'

export interface ChordModel {
  root: number
  bass: number
  kind: ChordKind
  hasSlash: boolean
}

export interface SpelledChord extends ChordModel {
  letter: string
  accidental: '' | '♭' | '♯'
  quality: string
  slash: { letter: string; accidental: '' | '♭' | '♯' } | null
}

export interface ChartSlot {
  symbol: string
  beats: number
}

export interface ChartBar {
  section: string | null
  activeSection: string
  chords: ChartSlot[]
}

export interface Tune {
  id: string
  title: string
  titleEn: string
  blurb: string
  key: string
  style: StyleId
  bpm: number
  /** 12-bar blues forms swap who starts a trade on the next chorus, because 12 / 4 is odd. */
  blues: boolean
  voicing?: 'quartal'
  original?: boolean
  bars: ChartBar[]
}

/** Linear gains for the drum sub-mix. 1 is unity, ride ships a few dB under that. */
export interface DrumMix {
  ride: number
  hat: number
  snare: number
  kick: number
  brush: number
}

export interface Mixer {
  master: number
  drums: number
  bass: number
  piano: number
  guitar: number
  click: number
  reverb: number
  mute: Record<'drums' | 'bass' | 'piano' | 'guitar', boolean>
  drumMix: DrumMix
}

export type DrumId =
  | 'kick'
  | 'snare'
  | 'sidestick'
  | 'hatClosed'
  | 'hatPedal'
  | 'hatOpen'
  | 'ride'
  | 'rideBell'
  | 'crash'
  | 'tomL'
  | 'tomM'
  | 'tomH'
  | 'brushSwirl'
  | 'brushTap'

export interface Hit {
  /** Seconds from the downbeat. May be slightly negative for notes that sit ahead of the beat. */
  time: number
  part: PartId
  drum?: DrumId
  midi?: number
  velocity: number
  /** Seconds. 0 means let a one-shot ring for its natural length. */
  duration: number
  pan: number
}

export interface TradeSettings {
  on: boolean
  len: 4 | 8
  userStarts: boolean
  role: RoleId
}

export interface Turn {
  user: boolean
  partner: 'piano' | 'drums'
  partnerLabel: string
  barInTurn: number
  len: 4 | 8
  /** Last bar of the partner's turn: tell the player to get ready. */
  prep: boolean
  /** Last bar of the player's turn. */
  handoff: boolean
}
