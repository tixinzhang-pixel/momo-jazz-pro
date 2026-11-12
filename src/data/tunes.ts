import { parseChart } from '../theory.ts'
import type { FormSectionSpec, ReviewStatus, StyleId, Tune, TuneSourceKind, TuneTag } from '../types.ts'

export interface TuneSource {
  id: string
  title: string
  titleEn: string
  composer?: string
  blurb: string
  key: string
  style: StyleId
  bpm: number
  timeSignature?: '4/4' | '3/4'
  form?: FormSectionSpec[]
  tags?: TuneTag[]
  review?: ReviewStatus
  source?: TuneSourceKind
  blues?: boolean
  voicing?: 'quartal'
  original?: boolean
  chart: string
}

export function deriveFormSections(bars: ReturnType<typeof parseChart>): FormSectionSpec[] {
  const sections: FormSectionSpec[] = []
  let currentLabel = bars[0]?.section || bars[0]?.activeSection || 'A'
  let count = 0
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    if (bar.section != null && i > 0 && count > 0) {
      sections.push({ label: currentLabel, bars: count })
      currentLabel = bar.section
      count = 0
    }
    count++
  }
  if (count > 0) {
    sections.push({ label: currentLabel, bars: count })
  }
  return sections
}

function tune(src: TuneSource): Tune {
  const bars = parseChart(src.chart)
  const form = src.form ?? deriveFormSections(bars)
  let tags: TuneTag[] = src.tags ?? ['jazz-standard']
  if (!src.tags) {
    if (src.original) {
      tags = ['momo-original']
    } else if (src.id.includes('ii-v-i')) {
      tags = ['teaching']
    }
  }
  return {
    id: src.id,
    title: src.title,
    titleEn: src.titleEn,
    composer: src.composer,
    blurb: src.blurb,
    key: src.key,
    style: src.style,
    bpm: src.bpm,
    timeSignature: src.timeSignature ?? '4/4',
    form,
    tags,
    review: src.review ?? 'approved',
    source: src.source ?? 'momo-written',
    blues: Boolean(src.blues),
    voicing: src.voicing,
    original: src.original,
    bars,
  }
}

/**
 * Chord changes only. No melodies, no lyrics.
 * Symbols: maj7 / ^7 / Δ7, -7 / m7, ø / m7b5, dim7, 7alt, 7sus, slash bass, % repeats a bar.
 * Uneven bars: F7@3 D7alt@1
 * Dean can edit the chart strings. review status is intentionally still "draft".
 */
const SOURCES: TuneSource[] = [
  {
    id: 'jazz-blues-f',
    title: '爵士布鲁斯',
    titleEn: 'Jazz Blues in F',
    blurb: '十二小节，带 ii–V。把 turnaround 走顺。',
    key: 'F',
    style: 'swing',
    bpm: 132,
    blues: true,
    chart: `
      [A] F7 | Bb7 | F7 | Cm7 F7 |
      Bb7 | Bdim7 | F7/A | D7alt |
      Gm7 | C7 | F7 D7alt | Gm7 C7 |
    `,
  },
  {
    id: 'jazz-blues-bb',
    title: '爵士布鲁斯',
    titleEn: 'Jazz Blues in B♭',
    blurb: '降 B 布鲁斯，管乐常用调。',
    key: 'Bb',
    style: 'swing',
    bpm: 116,
    blues: true,
    chart: `
      [A] Bb7 | Eb7 | Bb7 | Fm7 Bb7 |
      Eb7 | Edim7 | Bb7/D | G7alt |
      Cm7 | F7 | Bb7 G7alt | Cm7 F7 |
    `,
  },
  {
    id: 'minor-blues-c',
    title: '小调布鲁斯',
    titleEn: 'Minor Blues in C',
    blurb: '小调布鲁斯。注意第 8 小节的变化属七。',
    key: 'Cm',
    style: 'swing',
    bpm: 112,
    blues: true,
    chart: `
      [A] Cm7 | Fm7 | Cm7 | Cm7 |
      Fm7 | Fm7 | Cm7 | G7alt |
      Ab7 | G7alt | Cm7 | Dm7b5 G7alt |
    `,
  },
  {
    id: 'bird-blues-f',
    title: 'Bird 布鲁斯',
    titleEn: 'Bird Blues in F',
    blurb: '帕克式布鲁斯：每两拍一组 ii–V。不含旋律。',
    key: 'F',
    style: 'up',
    bpm: 176,
    blues: true,
    chart: `
      [A] Fmaj7 | Em7b5 A7alt | Dm7 G7 | Cm7 F7 |
      Bb7 | Bbm7 Eb7 | Am7 D7 | Abm7 Db7 |
      Gm7 | C7 | Fmaj7 D7alt | Gm7 C7 |
    `,
  },
  {
    id: 'rhythm-bb',
    title: 'Rhythm Changes',
    titleEn: 'Rhythm Changes in B♭',
    blurb: 'AABA。桥是一串属七，A 段是 I–VI–ii–V。',
    key: 'Bb',
    style: 'up',
    bpm: 168,
    chart: `
      [A] Bbmaj7 G7 | Cm7 F7 | Bbmaj7 G7 | Cm7 F7 |
      Fm7 Bb7 | Ebmaj7 Edim7 | Cm7 F7 | Bb6 D7 |
      [A] Bbmaj7 G7 | Cm7 F7 | Bbmaj7 G7 | Cm7 F7 |
      Fm7 Bb7 | Ebmaj7 Edim7 | Cm7 F7 | Bb6 |
      [B] D7 | D7 | G7 | G7 |
      C7 | C7 | F7 | F7 |
      [A] Bbmaj7 G7 | Cm7 F7 | Bbmaj7 G7 | Cm7 F7 |
      Fm7 Bb7 | Ebmaj7 Edim7 | Cm7 F7 | Bb6 |
    `,
  },
  {
    id: 'autumn-leaves',
    title: 'Autumn Leaves',
    titleEn: 'Autumn Leaves in E minor',
    blurb: '大调 ii–V–I 接小调 ii–V–i。不含旋律。',
    key: 'Em',
    style: 'swing',
    bpm: 144,
    chart: `
      [A] Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | Em7 |
      [A] Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | Em7 |
      [B] F#m7b5 | B7 | Em7 | Em7 | Am7 | D7 | Gmaj7 | Cmaj7 |
      [A] Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | Em7 |
    `,
  },
  {
    id: 'blue-bossa',
    title: 'Blue Bossa',
    titleEn: 'Blue Bossa',
    blurb: '小调 bossa，中段转到降 D 大调。不含旋律。',
    key: 'Cm',
    style: 'bossa',
    bpm: 132,
    chart: `
      [A] Cm7 | Cm7 | Fm7 | Fm7 |
      Dm7b5 | G7 | Cm7 | Cm7 |
      [B] Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 |
      Dm7b5 | G7 | Cm7 | Dm7b5 G7 |
    `,
  },
  {
    id: 'solar',
    title: 'Solar',
    titleEn: 'Solar',
    blurb: '十二小节，短而转调密。不含旋律。',
    key: 'Cm',
    style: 'swing',
    bpm: 152,
    chart: `
      [A] Cm | Cm | Gm7 | C7 |
      Fmaj7 | Fmaj7 | Fm7 | Bb7 |
      Ebmaj7 | Ebm7 Ab7 | Dbmaj7 | Dm7b5 G7alt |
    `,
  },
  {
    id: 'so-what',
    title: 'So What',
    titleEn: 'So What',
    blurb: '十六小节 D 多利亚，八小节升半音，再回来。钢琴用四度叠置。',
    key: 'Dm',
    style: 'swing',
    bpm: 136,
    voicing: 'quartal',
    chart: `
      [A] Dm7 | % | % | % | % | % | % | % |
      % | % | % | % | % | % | % | % |
      [B] Ebm7 | % | % | % | % | % | % | % |
      [A] Dm7 | % | % | % | % | % | % | % |
    `,
  },
  {
    id: 'major-ii-v-i',
    title: '大调 ii–V–I',
    titleEn: 'Major ii–V–I',
    blurb: '十二个调，顺着四度圈。一小节 ii，一小节 V，两小节 I。',
    key: 'C',
    style: 'swing',
    bpm: 108,
    chart: `
      [C] Dm7 | G7 | Cmaj7 | Cmaj7 |
      [F] Gm7 | C7 | Fmaj7 | Fmaj7 |
      [Bb] Cm7 | F7 | Bbmaj7 | Bbmaj7 |
      [Eb] Fm7 | Bb7 | Ebmaj7 | Ebmaj7 |
      [Ab] Bbm7 | Eb7 | Abmaj7 | Abmaj7 |
      [Db] Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 |
      [Gb] Abm7 | Db7 | Gbmaj7 | Gbmaj7 |
      [B] C#m7 | F#7 | Bmaj7 | Bmaj7 |
      [E] F#m7 | B7 | Emaj7 | Emaj7 |
      [A] Bm7 | E7 | Amaj7 | Amaj7 |
      [D] Em7 | A7 | Dmaj7 | Dmaj7 |
      [G] Am7 | D7 | Gmaj7 | Gmaj7 |
    `,
  },
  {
    id: 'minor-ii-v-i',
    title: '小调 ii–V–i',
    titleEn: 'Minor ii–V–i',
    blurb: '半减到变化属七，解决到小调。十二个调。',
    key: 'Cm',
    style: 'swing',
    bpm: 100,
    chart: `
      [Cm] Dm7b5 | G7alt | Cm7 | Cm7 |
      [Fm] Gm7b5 | C7alt | Fm7 | Fm7 |
      [Bbm] Cm7b5 | F7alt | Bbm7 | Bbm7 |
      [Ebm] Fm7b5 | Bb7alt | Ebm7 | Ebm7 |
      [Gbm] Abm7b5 | Db7alt | Gbm7 | Gbm7 |
      [Bm] C#m7b5 | F#7alt | Bm7 | Bm7 |
      [Em] F#m7b5 | B7alt | Em7 | Em7 |
      [Am] Bm7b5 | E7alt | Am7 | Am7 |
      [Dm] Em7b5 | A7alt | Dm7 | Dm7 |
      [Gm] Am7b5 | D7alt | Gm7 | Gm7 |
    `,
  },
  {
    id: 'night-window',
    title: '夜窗',
    titleEn: 'Night Window',
    blurb: '原创抒情练习，降 B，不是某首名曲。',
    key: 'Bb',
    style: 'ballad',
    bpm: 66,
    original: true,
    chart: `
      [A] Bbmaj7 | Am7b5 D7 | Gm7 | Gm7 |
      Cm7 | F7 | Bbmaj7 | Cm7 F7 |
      [A] Bbmaj7 | Am7b5 D7 | Gm7 | Gm7 |
      Cm7 | F7 | Bbmaj7 | Bbmaj7 |
      [B] Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 |
      Dm7 | G7 | Cm7 | F7 |
      [A] Bbmaj7 | Am7b5 D7 | Gm7 | Cm7 F7 |
      Bbmaj7 | D7alt | Gm7 C7 | Bbmaj7 |
    `,
  },
  {
    id: 'riverside',
    title: '河边',
    titleEn: 'Riverside',
    blurb: '原创 bossa，C 大调。不是某首名曲。',
    key: 'C',
    style: 'bossa',
    bpm: 124,
    original: true,
    chart: `
      [A] Cmaj7 | Cmaj7 | Bm7b5 | E7 |
      Am7 | D7 | Dm7 | G7 |
      [B] Em7 | A7 | Dm7 | G7 |
      Em7 A7 | Dm7 G7 | Cmaj7 | Dm7 G7 |
    `,
  },
]

export const TUNES: Tune[] = SOURCES.map(tune)

export function findTune(id: string | null | undefined): Tune | undefined {
  return TUNES.find((t) => t.id === id)
}

export const STYLE_LABEL: Record<StyleId, string> = {
  swing: 'Swing',
  up: 'Up Swing',
  ballad: 'Ballad',
  bossa: 'Bossa',
  shuffle: 'Shuffle',
}
