# Momo Jazz Pro — Tune Format Specification

Version: 1.0 (v0.3.0-beta.1)

This document specifies the tune data structure used by Momo Jazz Pro (`src/types.ts` and `src/data/tunes.ts`). It is designed to hold hundreds of jazz standards, pop progressions, originals, and educational exercises, and to serve as the target schema for future importers (such as iReal share links).

## 1. Principles

1. **Chords only:** No theme melodies, no lyrics, no copyrighted sheet-music engravings.
2. **Deterministic arrangement:** The playback engine arranges drums, walking bass, piano voicings, and guitar rhythm strictly from chord symbols, time signature, style, and tempo.
3. **Form-aware:** Sections, repeats, first/second endings, and coda markers are first-class fields so the engine can schedule dynamics, setups, crashes, and trading turns accurately.
4. **Human-editable:** The compact chart DSL uses pipe-delimited bars (`|`), section headers (`[A]`), and beat durations (`@beats`), allowing musicians and educators (such as Dean) to edit changes in plain text.

---

## 2. TypeScript Data Model

```typescript
export type StyleId = 'swing' | 'up' | 'ballad' | 'bossa' | 'shuffle'
export type TuneTag = 'jazz-standard' | 'pop' | 'momo-original' | 'teaching'
export type ReviewStatus = 'pending-dean' | 'approved'
export type TuneSourceKind = 'momo-written'

export interface FormSectionSpec {
  label: string        // e.g. "A", "B", "C", "Intro", "Outro"
  bars: number         // Number of bars in this section pass
  repeats?: number     // e.g. 2 for repeated A section
  endings?: number     // e.g. 2 for 1st / 2nd ending
  coda?: boolean       // True if this section is a Coda
}

export interface ChartSlot {
  symbol: string       // Chord symbol, e.g. "Cmaj7", "D7alt", "Dm7b5", "F7/A"
  beats: number        // Duration in beats (e.g. 4 for full bar, 2 for half bar)
}

export interface ChartBar {
  section: string | null     // Present on the first bar of a new section (e.g. "A")
  activeSection: string      // Active section label for this bar
  chords: ChartSlot[]        // 1 to 4 chords per bar
  repeatStart?: boolean      // Forward repeat barline (:|)
  repeatEnd?: boolean        // Backward repeat barline (|:)
  ending?: 1 | 2             // 1st or 2nd ending indicator
  coda?: boolean             // Jump to coda / coda sign
}

export interface Tune {
  id: string                 // URL-friendly unique identifier (e.g. "so-what")
  title: string              // Chinese or common title (e.g. "So What", "秋叶")
  titleEn: string            // English standard title (e.g. "Autumn Leaves")
  composer?: string          // Composer attribution (e.g. "Miles Davis")
  blurb: string              // Practice notes or educational tips
  key: string                // Nominal tonal center (e.g. "C", "F", "Dm", "Eb")
  style: StyleId             // Default musical style
  bpm: number                // Default tempo in beats per minute
  timeSignature: '4/4' | '3/4'
  form: FormSectionSpec[]    // High-level form outline (e.g. AABA, 32 bars)
  tags: TuneTag[]            // Library categorization tags
  review: ReviewStatus       // Editorial status ("pending-dean" or "approved")
  source: TuneSourceKind     // Origin indicator ("momo-written")
  blues: boolean             // 12-bar blues trading hand-swap flag
  voicing?: 'quartal'        // Optional specialized voicing hint (e.g. quartal for So What)
  original?: boolean         // Momo studio original composition
  bars: ChartBar[]           // Parsed bars and chord slots
}
```

---

## 3. Compact Chart DSL Syntax

The `chart` property is written as a multi-line string:

- **Barlines:** Bars are separated by the pipe character `|`.
- **Sections:** Section declarations are prefixed with brackets, e.g. `[A]`, `[B]`, `[C]`. A section tag attaches to the first bar that follows it.
- **Repeats:** `%` indicates that the bar repeats the previous bar's chords.
- **Multiple chords per bar:**
  - If no `@beats` suffix is provided, chords in a bar divide the 4 beats equally:
    - `Dm7 G7 |` -> Dm7 (2 beats), G7 (2 beats).
    - `Cmaj7 Am7 Dm7 G7 |` -> 1 beat each.
  - For uneven beat distributions, use `@beats`:
    - `F7@3 D7alt@1 |` -> F7 for 3 beats, D7alt for 1 beat.
- **Chord symbols supported:**
  - Major: `Cmaj7`, `C^7`, `CΔ7`, `C6`, `Cmaj9`
  - Minor: `Cm7`, `C-7`, `Cm6`, `Cm9`, `Cm11`
  - Dominant: `C7`, `C9`, `C13`, `C7alt`, `C7sus`, `C7b9`, `C7#9`, `C7b13`
  - Half-diminished: `Cm7b5`, `Cø`
  - Diminished: `Cdim7`, `C°7`
  - Slash bass: `F7/A`, `Bb7/D`, `C/E`

---

## 4. Importer Compatibility (iReal Pro Mapping)

When an importer parses iReal Pro share URLs in future releases:
- Cell structures map directly to `chords` per `ChartBar`.
- Section brackets `*A`, `*B`, `*C` map to `[A]`, `[B]`, `[C]`.
- First and second endings `N1`, `N2` map to `ending: 1` and `ending: 2`.
- Repeat signs `{` and `}` map to `repeatStart` and `repeatEnd`.
- Codas `Q` and `S` map to `coda: true`.
- All imported tunes will default to `review: "pending-dean"` and `source: "momo-written"`.
