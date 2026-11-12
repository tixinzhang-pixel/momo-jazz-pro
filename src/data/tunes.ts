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
  {
    id: 'summertime',
    title: 'Summertime',
    titleEn: 'Summertime',
    composer: 'George Gershwin',
    blurb: '经典小调摇摆，十六小节。注意第 7 小节的降 B 属七。',
    key: 'Dm',
    style: 'swing',
    bpm: 110,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Dm6 | Em7b5 A7alt | Dm6 | Em7b5 A7alt |
      Dm6 | G7 | Bb7 | A7alt |
      [B] Dm6 | Em7b5 A7alt | Dm6 | G7 |
      Fmaj7 Dm7 | Gm7 C7 | Fmaj7 | Em7b5 A7alt |
    `,
  },
  {
    id: 'all-the-things-you-are',
    title: 'All the Things You Are',
    titleEn: 'All the Things You Are',
    composer: 'Jerome Kern',
    blurb: '和弦进行名篇。跨越降 A、C、降 E、G、E 多调。',
    key: 'Ab',
    style: 'swing',
    bpm: 136,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Fm7 | Bbm7 | Eb7 | Abmaj7 |
      Dbmaj7 | G7 | Cmaj7 | Cmaj7 |
      [B] Cm7 | Fm7 | Bb7 | Ebmaj7 |
      Abmaj7 | D7 | Gmaj7 | Gmaj7 |
      [C] Am7 | D7 | Gmaj7 | Gmaj7 |
      F#m7b5 | B7 | Emaj7 | C7alt |
      [D] Fm7 | Bbm7 | Eb7 | Abmaj7 |
      Dbmaj7 | Dbm7 | Cm7 | Bdim7 |
      Bbm7 | Eb7 | Abmaj7 | G7alt C7alt |
    `,
  },
  {
    id: 'take-the-a-train',
    title: '搭乘 A 号列车',
    titleEn: "Take the 'A' Train",
    composer: 'Billy Strayhorn',
    blurb: '经典 AABA。第 3 小节的 II7b5 (D7b5) 是灵魂色彩。',
    key: 'C',
    style: 'swing',
    bpm: 156,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Cmaj7 | Cmaj7 | D7b5 | D7b5 |
      Dm7 | G7 | Cmaj7 | Dm7 G7 |
      [A] Cmaj7 | Cmaj7 | D7b5 | D7b5 |
      Dm7 | G7 | Cmaj7 | Gm7 C7 |
      [B] Fmaj7 | Fmaj7 | Fmaj7 | Fmaj7 |
      D7 | D7 | Dm7 | G7 |
      [A] Cmaj7 | Cmaj7 | D7b5 | D7b5 |
      Dm7 | G7 | Cmaj7 | Dm7 G7 |
    `,
  },
  {
    id: 'satin-doll',
    title: 'Satin Doll',
    titleEn: 'Satin Doll',
    composer: 'Duke Ellington / Billy Strayhorn',
    blurb: '经典的连续 ii–V 模进练习曲。',
    key: 'C',
    style: 'swing',
    bpm: 128,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Dm7 | G7 | Dm7 | G7 |
      Em7 | A7 | Em7 | A7 |
      Am7 | D7 | Abm7 | Db7 |
      Cmaj7 | % | Dm7 | G7 |
      [A] Dm7 | G7 | Dm7 | G7 |
      Em7 | A7 | Em7 | A7 |
      Am7 | D7 | Abm7 | Db7 |
      Cmaj7 | % | Gm7 | C7 |
      [B] Fmaj7 | % | G7 | % |
      Em7 | % | A7 | % |
      Am7 | % | D7 | % |
      Dm7 | % | G7 | % |
      [A] Dm7 | G7 | Dm7 | G7 |
      Em7 | A7 | Em7 | A7 |
      Am7 | D7 | Abm7 | Db7 |
      Cmaj7 | % | Dm7 | G7 |
    `,
  },
  {
    id: 'fly-me-to-the-moon',
    title: '带我飞向月球',
    titleEn: 'Fly Me to the Moon',
    composer: 'Bart Howard',
    blurb: '五度圈进行，平行大小调交叠。',
    key: 'C',
    style: 'swing',
    bpm: 124,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Am7 | Dm7 | G7 | Cmaj7 |
      Fmaj7 | Bm7b5 | E7 | Am7 A7 |
      Dm7 | G7 | Cmaj7 | A7 |
      Dm7 | G7 | Cmaj7 | E7 |
      [B] Am7 | Dm7 | G7 | Cmaj7 |
      Fmaj7 | Bm7b5 | E7 | Am7 A7 |
      Dm7 | G7 | Em7 | A7 |
      Dm7 | G7 | Cmaj7 | Bm7b5 E7 |
    `,
  },
  {
    id: 'there-will-never-be-another-you',
    title: '绝不会有另一个你',
    titleEn: 'There Will Never Be Another You',
    composer: 'Harry Warren',
    blurb: '降 E 大调经典快速 swing 练习曲，ABAC 结构。',
    key: 'Eb',
    style: 'swing',
    bpm: 160,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Ebmaj7 | % | Dm7b5 | G7 |
      Cm7 | % | Bbm7 | Eb7 |
      Abmaj7 | Db7 | Ebmaj7 | C7alt |
      F7 | % | Fm7 | Bb7 |
      [B] Ebmaj7 | % | Dm7b5 | G7 |
      Cm7 | % | Bbm7 | Eb7 |
      Abmaj7 | Db7 | Ebmaj7 | C7alt |
      Fm7 | Bb7 | Ebmaj7 | Fm7 Bb7 |
    `,
  },
  {
    id: 'misty',
    title: 'Misty',
    titleEn: 'Misty',
    composer: 'Erroll Garner',
    blurb: '经典爵士慢歌抒情曲，丰富的 ii–V 替代。',
    key: 'Eb',
    style: 'ballad',
    bpm: 68,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 |
      Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7 |
      [A] Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 |
      Ebmaj7 Cm7 | Fm7 Bb7 | Ebmaj7 Ab7 | Ebmaj7 |
      [B] Bbm7 | Eb7 | Abmaj7 | % |
      Am7 | D7 | Gmaj7 | Fm7 Bb7 |
      [A] Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 |
      Ebmaj7 Cm7 | Fm7 Bb7 | Ebmaj7 Ab7 | Ebmaj7 Bb7 |
    `,
  },
  {
    id: 'footprints',
    title: 'Footprints',
    titleEn: 'Footprints',
    composer: 'Wayne Shorter',
    blurb: '三拍子小调布鲁斯，独特的后半段模进。',
    key: 'Cm',
    style: 'swing',
    bpm: 148,
    timeSignature: '3/4',
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Cm7 | % | % | % |
      % | % | % | % |
      Fm7 | % | % | % |
      Cm7 | % | % | % |
      F#m7b5 | % | B7alt | % |
      Em7b5 | A7alt | Cm7 | % |
    `,
  },
  {
    id: 'cantaloupe-island',
    title: 'Cantaloupe Island',
    titleEn: 'Cantaloupe Island',
    composer: 'Herbie Hancock',
    blurb: '模态爵士代表作，十六小节 Shuffle 律动。',
    key: 'Fm',
    style: 'shuffle',
    bpm: 128,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Fm7 | % | % | % |
      Db7 | % | % | % |
      Dm7 | % | % | % |
      Fm7 | % | % | % |
    `,
  },
  {
    id: 'billies-bounce',
    title: "Billie's Bounce",
    titleEn: "Billie's Bounce",
    composer: 'Charlie Parker',
    blurb: '查理·帕克 F 调波普布鲁斯经典。',
    key: 'F',
    style: 'swing',
    bpm: 154,
    blues: true,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] F7 | C7alt | F7 | % |
      Bb7 | % | F7 | D7alt |
      Gm7 | C7 | F7 D7alt | Gm7 C7 |
    `,
  },
  {
    id: 'bags-groove',
    title: "Bag's Groove",
    titleEn: "Bag's Groove",
    composer: 'Milt Jackson',
    blurb: '最基础纯粹的 F 调传统大调布鲁斯。',
    key: 'F',
    style: 'swing',
    bpm: 126,
    blues: true,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] F7 | Bb7 | F7 | % |
      Bb7 | % | F7 | % |
      Gm7 | C7 | F7 | Gm7 C7 |
    `,
  },
  {
    id: 'impressions',
    title: 'Impressions',
    titleEn: 'Impressions',
    composer: 'John Coltrane',
    blurb: '多利亚调式经典，AABA 结构，钢琴适合四度叠置。',
    key: 'Dm',
    style: 'up',
    bpm: 192,
    voicing: 'quartal',
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Dm7 | % | % | % | % | % | % | % |
      % | % | % | % | % | % | % | % |
      [B] Ebm7 | % | % | % | % | % | % | % |
      [A] Dm7 | % | % | % | % | % | % | % |
    `,
  },
  {
    id: 'song-for-my-father',
    title: '给父亲的歌',
    titleEn: 'Song for My Father',
    composer: 'Horace Silver',
    blurb: '硬波普经典 Bossa 律动，二十四小节 AAB。',
    key: 'Fm',
    style: 'bossa',
    bpm: 128,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Fm7 | % | Eb7 | % |
      Db7 | C7alt | Fm7 | % |
      [A] Fm7 | % | Eb7 | % |
      Db7 | C7alt | Fm7 | % |
      [B] Eb7 | % | Fm7 | % |
      Db7 | C7alt | Fm7 | % |
    `,
  },
  {
    id: 'the-girl-from-ipanema',
    title: '伊帕内玛女孩',
    titleEn: 'The Girl from Ipanema',
    composer: 'Antônio Carlos Jobim',
    blurb: 'Bossa Nova 丰碑之作，四十小节 AABA，B 段调性游走。',
    key: 'F',
    style: 'bossa',
    bpm: 128,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] Fmaj7 | % | G7 | % |
      Gm7 | C7 | Fmaj7 | Gb7 |
      [A] Fmaj7 | % | G7 | % |
      Gm7 | C7 | Fmaj7 | % |
      [B] Gbmaj7 | % | B7 | % |
      F#m7 | % | D7 | % |
      Gm7 | % | Eb7 | % |
      Am7 | D7alt | Gm7 | C7alt |
      [A] Fmaj7 | % | G7 | % |
      Gm7 | C7 | Fmaj7 | Gb7 |
    `,
  },
  {
    id: 'watermelon-man',
    title: '西瓜人',
    titleEn: 'Watermelon Man',
    composer: 'Herbie Hancock',
    blurb: '十六小节布鲁斯变体，Funky / Shuffle 律动。',
    key: 'F',
    style: 'shuffle',
    bpm: 128,
    blues: true,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['jazz-standard'],
    chart: `
      [A] F7 | % | % | % |
      Bb7 | % | F7 | % |
      C7 | Bb7 | C7 | Bb7 |
      C7 | Bb7 | F7 | % |
    `,
  },
  {
    id: 'let-it-be',
    title: 'Let It Be',
    titleEn: 'Let It Be',
    composer: 'The Beatles',
    blurb: '披头士流行传世经典，I–V–vi–IV 轴心进行练习。',
    key: 'C',
    style: 'ballad',
    bpm: 72,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] C | G | Am | Fmaj7 |
      C | G | F | C |
      [B] Am | G | F | C |
      C | G | F | C |
    `,
  },
  {
    id: 'yesterday',
    title: 'Yesterday',
    titleEn: 'Yesterday',
    composer: 'The Beatles',
    blurb: '披头士十五小节经典，A 段不规则七小节结构。',
    key: 'F',
    style: 'ballad',
    bpm: 84,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] F | Em7 A7 | Dm | Bb C7 |
      F | Dm7 G7 | Bb F |
      [B] Em7 A7 | Dm C | Bb Dm | Gm C7 |
      Em7 A7 | Dm C | Bb Dm | Gm C7 |
    `,
  },
  {
    id: 'isnt-she-lovely',
    title: 'Isn’t She Lovely',
    titleEn: 'Isn’t She Lovely',
    composer: 'Stevie Wonder',
    blurb: '史提夫·汪达流行爵士律动名作，十六小节单段循环。',
    key: 'E',
    style: 'shuffle',
    bpm: 120,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] C#m7 | F#7 | B7sus | Emaj7 |
      C#m7 | F#7 | B7sus | Emaj7 |
      Amaj7 | G#7alt | C#m7 | F#7 |
      F#m7 | B7 | Emaj7 | % |
    `,
  },
  {
    id: 'just-the-way-you-are',
    title: '素颜如你',
    titleEn: 'Just the Way You Are',
    composer: 'Billy Joel',
    blurb: '比利·乔流行爵士抒情歌，优美的属和弦过渡。',
    key: 'D',
    style: 'ballad',
    bpm: 68,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] Dmaj7 | Bm7 | Em7 | G A7 |
      Dmaj7 | Bm7 | Em7 | G A7 |
      [B] Gmaj7 | Gm6 | F#m7 | B7 |
      Em7 | A7 | Dmaj7 | Em7 A7 |
    `,
  },
  {
    id: 'moon-river',
    title: '月河',
    titleEn: 'Moon River',
    composer: 'Henry Mancini',
    blurb: '经典三拍子流行抒情曲，三十二小节 ABAC 形式。',
    key: 'C',
    style: 'ballad',
    bpm: 80,
    timeSignature: '3/4',
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] C | Am | F | C |
      F | C | Dm7 | G7 |
      [B] Am | C7 | F | Fm |
      C | Am | Dm7 | G7 |
      [A] C | Am | F | C |
      F | C | Dm7 | G7 |
      [C] Am | Em | F | C |
      F | C | Dm7 G7 | C |
    `,
  },
  {
    id: 'dont-know-why',
    title: "Don't Know Why",
    titleEn: "Don't Know Why",
    composer: 'Jesse Harris (Norah Jones)',
    blurb: '诺拉·琼斯名曲，十六小节 Pop/Jazz 慢摇。',
    key: 'Bb',
    style: 'ballad',
    bpm: 86,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] Bbmaj7 | Bb7 | Ebmaj7 | D7alt |
      Gm7 | C7 | F7sus | F7 |
      [B] Bbmaj7 | Bb7 | Ebmaj7 | D7alt |
      Gm7 | C7 | F7 | Bbmaj7 |
    `,
  },
  {
    id: 'englishman-in-new-york',
    title: 'Englishman in New York',
    titleEn: 'Englishman in New York',
    composer: 'Sting',
    blurb: '斯汀经典，简练而充满律动的 pop/shuffle 进行。',
    key: 'Em',
    style: 'shuffle',
    bpm: 104,
    review: 'pending-dean',
    source: 'momo-written',
    tags: ['pop'],
    chart: `
      [A] Em7 | A | Bm7 | Bm7 |
      Em7 | A | Bm7 | Bm7 |
      [B] Em7 | A | Bm7 | Bm7 |
      G | A | Bm7 | Bm7 |
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
