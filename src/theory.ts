import type { ChartBar, ChartId, ChordKind, ChordModel, SpelledChord } from './types.ts'

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const CHART_SEMITONES: Record<ChartId, number> = {
  concert: 0,
  bb: 2,
  eb: 9,
  f: 7,
}

export function mod(n: number): number {
  return ((n % 12) + 12) % 12
}

export function pcOf(letter: string, accidental = ''): number {
  let pc = LETTER[letter] ?? 0
  if (accidental === '#') pc += 1
  if (accidental === 'b') pc -= 1
  return mod(pc)
}

/** Jazz spelling: flat keys stay flat, sharp keys stay sharp, Gb rather than F#, F#m rather than Gbm. */
export function preferSharps(pc: number, minor: boolean): boolean {
  const p = mod(pc)
  if (!minor && p === 6) return false
  if (minor && p === 6) return true
  const majorPc = minor ? mod(p + 3) : p
  return [7, 2, 9, 4, 11, 6].includes(majorPc)
}

export function spellPc(pc: number, sharp: boolean): { letter: string; accidental: '' | '♭' | '♯' } {
  const name = (sharp ? SHARP : FLAT)[mod(pc)]
  const letter = name[0] ?? 'C'
  const accidental = (name.slice(1) || '') as '' | '♭' | '♯'
  return { letter, accidental }
}

export function formatKey(pc: number, minor: boolean): string {
  const { letter, accidental } = spellPc(pc, preferSharps(pc, minor))
  return `${letter}${accidental}${minor ? 'm' : ''}`
}

export function parseKeyName(name: string): { pc: number; minor: boolean } {
  const m = /^([A-G])([#b]?)(m)?$/.exec(name.trim())
  if (!m) return { pc: 0, minor: false }
  return { pc: pcOf(m[1], m[2]), minor: Boolean(m[3]) }
}

export function soundingKey(tuneKey: string, transpose: number): { pc: number; minor: boolean; name: string; sharp: boolean } {
  const k = parseKeyName(tuneKey)
  const pc = mod(k.pc + transpose)
  const sharp = preferSharps(pc, k.minor)
  return { pc, minor: k.minor, name: formatKey(pc, k.minor), sharp }
}

export function displayKey(
  tuneKey: string,
  soundingTranspose: number,
  chart: ChartId,
): { pc: number; minor: boolean; name: string; sharp: boolean } {
  const k = parseKeyName(tuneKey)
  const pc = mod(k.pc + soundingTranspose + CHART_SEMITONES[chart])
  return { pc, minor: k.minor, name: formatKey(pc, k.minor), sharp: preferSharps(pc, k.minor) }
}

const QUALITY: Record<ChordKind, string> = {
  maj: '',
  maj7: 'Δ7',
  6: '6',
  m: '–',
  m7: '–7',
  m6: '–6',
  m9: '–9',
  m11: '–11',
  mmaj: '–Δ7',
  7: '7',
  9: '9',
  13: '13',
  '7alt': '7alt',
  '7b9': '7♭9',
  '7#9': '7♯9',
  '7b13': '7♭13',
  '7#11': '7♯11',
  '7sus': '7sus',
  m7b5: '∅',
  dim7: '°7',
  sus: 'sus',
  aug: '+',
}

export function chordKind(raw: string): ChordKind {
  const q = raw
    .trim()
    .replace(/Δ/g, '^')
    .replace(/[−–]/g, '-')
    .replace(/Ø/g, 'ø')
    .replace(/°/g, 'o')
  const l = q.toLowerCase()
  if (q === '' || l === 'maj' || l === 'major') return 'maj'
  if (/^(m7b5|-7b5|mi7b5|min7b5|ø7?|h7)$/i.test(q)) return 'm7b5'
  if (/^(dim7|o7|dim|o)$/i.test(q)) return 'dim7'
  if (/^(mmaj7|m\^7|-\^7|minmaj7|-maj7)$/i.test(q)) return 'mmaj'
  if (/^(maj9|\^9)$/i.test(q)) return 'maj7'
  if (/^(maj7|\^7|\^|M7|major7)$/.test(q)) return 'maj7'
  if (/^(6\/9|69)$/i.test(q)) return '6'
  if (/^(6|maj6|\^6)$/i.test(q)) return '6'
  if (/^(m11|-11|min11|mi11)$/i.test(q)) return 'm11'
  if (/^(m9|-9|min9|mi9)$/i.test(q)) return 'm9'
  if (/^(m6|-6|min6|mi6)$/i.test(q)) return 'm6'
  if (/^(m7|-7|min7|mi7)$/i.test(q)) return 'm7'
  if (/^(m|-|min|mi)$/i.test(q)) return 'm'
  if (/^(7alt|alt)$/i.test(q)) return '7alt'
  if (/^(7sus4|7sus|sus7)$/i.test(q)) return '7sus'
  if (l === '7b9') return '7b9'
  if (l === '7#9') return '7#9'
  if (l === '7b13') return '7b13'
  if (l === '7#11' || l === '7b5') return '7#11'
  if (l === '7#5') return '7alt'
  if (l === 'aug' || q === '+') return 'aug'
  if (l === 'sus4' || l === 'sus') return 'sus'
  if (l === '13') return '13'
  if (l === '11') return '7sus'
  if (l === '9') return '9'
  if (l === '7') return '7'
  if (l.includes('m7b5') || q.includes('ø')) return 'm7b5'
  if (l.includes('dim') || /(^|[^a-z])o/.test(l)) return 'dim7'
  if (l.startsWith('m') || q.startsWith('-')) return 'm7'
  if (q.includes('^') || l.includes('maj')) return 'maj7'
  if (q.includes('7')) return '7'
  return 'maj'
}

export function parseChord(symbol: string): ChordModel {
  const raw = symbol.trim()
  let head = raw
  let bassNote: string | null = null
  const slash = raw.lastIndexOf('/')
  if (slash > 0) {
    const maybe = raw.slice(slash + 1)
    if (/^[A-G](#|b)?$/.test(maybe)) {
      bassNote = maybe
      head = raw.slice(0, slash)
    }
  }
  const m = /^([A-G])(#|b)?(.*)$/.exec(head)
  if (!m) return { root: 0, bass: 0, kind: 'maj', hasSlash: false }
  const root = pcOf(m[1], m[2] ?? '')
  const kind = chordKind(m[3] ?? '')
  const bass = bassNote ? pcOf(bassNote[0] ?? 'C', bassNote.slice(1)) : root
  return { root, bass, kind, hasSlash: bassNote != null }
}

export function transposeModel(ch: ChordModel, semitones: number): ChordModel {
  return { ...ch, root: mod(ch.root + semitones), bass: mod(ch.bass + semitones) }
}

export function spellChord(ch: ChordModel, sharp: boolean): SpelledChord {
  const root = spellPc(ch.root, sharp)
  const bass = spellPc(ch.bass, sharp)
  const slash = ch.hasSlash ? bass : null
  return { ...ch, letter: root.letter, accidental: root.accidental, quality: QUALITY[ch.kind], slash }
}

export function chordTones(kind: ChordKind): number[] {
  switch (kind) {
    case 'maj':
    case 'maj7':
      return [0, 4, 7, 11]
    case '6':
      return [0, 4, 7, 9]
    case 'm':
    case 'm7':
    case 'm9':
    case 'm11':
      return [0, 3, 7, 10]
    case 'm6':
      return [0, 3, 7, 9]
    case 'mmaj':
      return [0, 3, 7, 11]
    case '7':
    case '9':
    case '13':
    case '7b9':
    case '7#9':
    case '7b13':
    case '7#11':
      return [0, 4, 7, 10]
    case '7alt':
      return [0, 4, 8, 10]
    case '7sus':
    case 'sus':
      return [0, 5, 7, 10]
    case 'm7b5':
      return [0, 3, 6, 10]
    case 'dim7':
      return [0, 3, 6, 9]
    case 'aug':
      return [0, 4, 8]
    default:
      return [0, 4, 7, 11]
  }
}

export function chordScale(kind: ChordKind): number[] {
  switch (kind) {
    case 'maj':
    case 'maj7':
    case '6':
    case 'mmaj':
      return [0, 2, 4, 5, 7, 9, 11]
    case 'm':
    case 'm7':
    case 'm6':
    case 'm9':
    case 'm11':
      return [0, 2, 3, 5, 7, 9, 10]
    case '7':
    case '9':
    case '13':
    case '7#11':
      return [0, 2, 4, 5, 7, 9, 10]
    case '7b9':
    case '7#9':
    case '7b13':
    case '7alt':
      return [0, 1, 3, 4, 6, 8, 10]
    case '7sus':
    case 'sus':
      return [0, 2, 5, 7, 9, 10]
    case 'm7b5':
      return [0, 2, 3, 5, 6, 8, 10]
    case 'dim7':
      return [0, 2, 3, 5, 6, 8, 9, 11]
    case 'aug':
      return [0, 2, 4, 6, 8, 10]
    default:
      return [0, 2, 4, 5, 7, 9, 11]
  }
}

/** Guide tones: third (or fourth on sus) and seventh. */
export function guideIntervals(kind: ChordKind): [number, number] {
  switch (kind) {
    case 'm':
    case 'm7':
    case 'm6':
    case 'm9':
    case 'm11':
    case 'm7b5':
      return [3, 10]
    case 'mmaj':
      return [3, 11]
    case '7sus':
    case 'sus':
      return [5, 10]
    case 'dim7':
      return [3, 9]
    case 'maj':
    case 'maj7':
    case '6':
      return [4, 11]
    default:
      return [4, 10]
  }
}

export function parseChart(chart: string): ChartBar[] {
  const text = chart.replace(/\s+/g, ' ').trim()
  const tokens = text.split('|').map((s) => s.trim()).filter(Boolean)
  const bars: ChartBar[] = []
  let prev: ChartBar['chords'] = [{ symbol: 'C', beats: 4 }]
  let active = 'A'
  for (const token of tokens) {
    let body = token
    let section: string | null = null
    const sec = /^\[([A-Za-z0-9]+)\]\s*(.*)$/.exec(body)
    if (sec) {
      section = sec[1]
      active = section
      body = sec[2].trim()
    }
    let chords: ChartBar['chords']
    if (body === '' || body === '%') chords = prev.map((c) => ({ ...c }))
    else chords = parseBarBody(body)
    prev = chords
    bars.push({ section, activeSection: active, chords })
  }
  return bars
}

function parseBarBody(body: string): ChartBar['chords'] {
  const parts = body.split(/\s+/).filter(Boolean).map((part) => {
    const m = /^(.*)@(\d+(?:\.\d+)?)$/.exec(part)
    if (m) return { symbol: m[1], beats: Number(m[2]) }
    return { symbol: part, beats: null as number | null }
  })
  if (parts.every((p) => p.beats == null)) {
    const beats = 4 / parts.length
    return parts.map((p) => ({ symbol: p.symbol, beats }))
  }
  const specified = parts.reduce((sum, p) => sum + (p.beats ?? 0), 0)
  const missing = parts.filter((p) => p.beats == null).length
  const each = missing > 0 ? (4 - specified) / missing : 0
  return parts.map((p) => ({ symbol: p.symbol, beats: p.beats ?? each }))
}

export function chartSemitoneShift(soundingTranspose: number, chart: ChartId): number {
  return soundingTranspose + CHART_SEMITONES[chart]
}
