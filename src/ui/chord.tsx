import type { SpelledChord } from '../types.ts'

export function ChordGlyph({ chord, dense = false }: { chord: SpelledChord; dense?: boolean }) {
  return (
    <span class={dense ? 'chord dense' : 'chord'}>
      <span class="letter">
        {chord.letter}
        {chord.accidental && <span class="acc">{chord.accidental}</span>}
      </span>
      {chord.quality && <span class="qual">{chord.quality}</span>}
      {chord.slash && (
        <span class="slash">
          /
          <span class="letter slash-letter">
            {chord.slash.letter}
            {chord.slash.accidental && <span class="acc">{chord.slash.accidental}</span>}
          </span>
        </span>
      )}
    </span>
  )
}
