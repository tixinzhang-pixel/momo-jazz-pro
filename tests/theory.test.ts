import { describe, expect, it } from 'vitest'
import { TUNES } from '../src/data/tunes.ts'
import { chorusSwapsHands, turnAt } from '../src/trading.ts'
import {
  chordKind,
  chordTones,
  displayKey,
  parseChart,
  parseChord,
  preferSharps,
  soundingKey,
  spellChord,
  transposeModel,
} from '../src/theory.ts'

describe('chords', () => {
  it('parses the qualities the old prototype got wrong', () => {
    expect(chordKind('7sus')).toBe('7sus')
    expect(chordKind('m7b5')).toBe('m7b5')
    expect(chordKind('ø')).toBe('m7b5')
    expect(chordKind('-6')).toBe('m6')
    expect(chordKind('h7')).toBe('m7b5')
    expect(chordTones(chordKind('7sus'))).not.toContain(4)
    expect(chordTones(chordKind('7sus'))).toContain(5)
    expect(parseChord('F#m7b5').kind).toBe('m7b5')
    expect(parseChord('F#m7b5').root).toBe(6)
    expect(parseChord('F7/A')).toMatchObject({ root: 5, bass: 9, hasSlash: true, kind: '7' })
    expect(parseChord('C6/9').kind).toBe('6')
    expect(parseChord('C6/9').hasSlash).toBe(false)
    expect(parseChord('D7alt').kind).toBe('7alt')
    expect(parseChord('Bbmaj7').root).toBe(10)
    expect(parseChord('Edim7').kind).toBe('dim7')
  })

  it('transposes sounding pitch and chart display independently', () => {
    const f7 = parseChord('F7')
    const up = transposeModel(f7, 2)
    expect(up.root).toBe(7)
    const concert = soundingKey('F', 0)
    expect(concert.name).toBe('F')
    const bb = displayKey('F', 0, 'bb')
    expect(bb.name).toBe('G')
    const eb = displayKey('F', 0, 'eb')
    expect(eb.name).toBe('D')
    const horn = displayKey('C', 0, 'f')
    expect(horn.name).toBe('G')
    const spelled = spellChord(transposeModel(parseChord('F7'), 2), bb.sharp)
    expect(`${spelled.letter}${spelled.accidental}`).toBe('G')
    expect(spelled.quality).toBe('7')
  })

  it('spells flat keys with flats and sharp keys with sharps', () => {
    expect(preferSharps(10, false)).toBe(false)
    expect(soundingKey('Em', 0).name).toBe('Em')
    expect(soundingKey('Em', 2).name).toBe('F♯m')
    expect(soundingKey('F', 1).name).toBe('G♭')
    expect(soundingKey('Bb', 0).sharp).toBe(false)
  })

  it('parses charts, repeats and uneven bars', () => {
    const bars = parseChart('[A] F7 | % | Cm7 F7 | F7@3 D7alt@1 |')
    expect(bars).toHaveLength(4)
    expect(bars[0].section).toBe('A')
    expect(bars[1].chords[0].symbol).toBe('F7')
    expect(bars[2].chords.map((c) => c.beats)).toEqual([2, 2])
    expect(bars[3].chords[0].beats).toBe(3)
    expect(bars[3].chords[1].beats).toBe(1)
  })

  it('loads the starter book with the expected forms', () => {
    const byId = Object.fromEntries(TUNES.map((tune) => [tune.id, tune.bars.length]))
    expect(byId['jazz-blues-f']).toBe(12)
    expect(byId['rhythm-bb']).toBe(32)
    expect(byId['autumn-leaves']).toBe(32)
    expect(byId['so-what']).toBe(32)
    expect(byId['blue-bossa']).toBe(16)
    expect(byId['solar']).toBe(12)
    expect(byId['major-ii-v-i']).toBe(48)
    expect(TUNES.length).toBeGreaterThanOrEqual(12)
  })
})

describe('trading', () => {
  it('alternates fours and swaps hands on the second chorus of a blues', () => {
    expect(chorusSwapsHands(12, 4)).toBe(true)
    expect(chorusSwapsHands(32, 4)).toBe(false)
    expect(turnAt(0, 4, false, 'bb').user).toBe(false)
    expect(turnAt(0, 4, false, 'bb').partnerLabel).toBe('鼓手在奏')
    expect(turnAt(4, 4, false, 'bb').user).toBe(true)
    expect(turnAt(4, 4, false, 'bb').prep).toBe(false)
    expect(turnAt(3, 4, false, 'bb').prep).toBe(true)
    expect(turnAt(12, 4, false, 'bb').user).toBe(true)
    expect(turnAt(0, 4, false, 'drums').partner).toBe('piano')
    expect(turnAt(0, 4, true, 'vocal').user).toBe(true)
  })
})
