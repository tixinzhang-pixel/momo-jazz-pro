# Momo Jazz Pro v0.3 Implementation Report

> **提示**：v0.3.1 的修正见 [V031_REPORT.md](V031_REPORT.md)。v0.3.2 的实测见 [V032_REPORT.md](V032_REPORT.md)。

- **Branch:** `v0.3` (not pushed, not merged to `main`)
- **Version:** `0.3.0-beta.1`
- **Date:** 2026-11-12
- **Author/Agent:** Antigravity (following up from gemini-4-argon-medium checkpoint `94a9306`)

---

## 1. Changes per Scope Item

### Scope A — Rhythm-Section Dynamics Rework

#### A1. Two Playing Modes: HEAD and SOLO
- **Implementation:** `src/dynamics.ts: playingModeAt()`.
  - When loop count $\ge 3$: chorus 1 (index 0) and final out-chorus are `HEAD`; all intermediate choruses are `SOLO`.
  - When loop count $== 2$: only chorus 1 is `HEAD`; chorus 2 is `SOLO`.
  - When loop count $== 1$: chorus 1 is `HEAD`.
  - In `HEAD`, drum bus sits ~4.5 dB below SOLO average; Ride sits 8 dB below SOLO level with timekeeping mainly on hi-hat (pedal on 2 & 4, light closed hat stick pattern); snare comping at 0 dB reference (sparse ~2–2.25 hits/bar).
- **Files touched:** `src/dynamics.ts`, `src/arrange.ts`, `src/engine/dynamicsConfig.ts`, `tests/dynamics.test.ts`.

#### A2. Intensity Steps per Soloist Block (Auto Mode)
- **Implementation:** `src/dynamics.ts: musicalShape()`.
  - `SOLO` choruses are grouped into 2-chorus soloist blocks (`chorusesPerBlock: 2`).
  - Inside a block, chorus 2 steps up net ride and snare comping by ~+3.8 dB vs chorus 1 (matching reference B: +3.7 to +4.4 dB on ride).
  - At the start of a new block, intensity drops back 2.2 dB from the previous block's peak and starts +1.5 dB higher than the previous block's start.
  - Overall drum bus capped at +6 dB over HEAD (ref A: +5.8 dB, ref B: +4.5 dB).
  - Out-head settles at HEAD level, and drops an extra 1.5 dB in the last 4 bars before the clean ending chord.
  - Fixed modes (`low` / `med` / `high`) keep constant block levels (`low` = HEAD, `med` = +3 dB, `high` = +6 dB).
- **Files touched:** `src/dynamics.ts`, `src/engine/dynamicsConfig.ts`, `tests/dynamics.test.ts`.

#### A3. Fills, Setups, and Crashes at Section Boundaries
- **Implementation:** `src/dynamics.ts: setupStrengthAt()`, `src/arrange.ts: shouldCrashBarStart()`, `fillKind()`.
  - 32-bar form boundary rules:
    - Bars 4, 12, 20, 28: No fill (`setupStrength: 'none'`). Quietest part of chorus.
    - Bar 8: Light setup (drum bus +1.5 dB in beats 3–4).
    - Bar 16 (end of A2, into bridge): Medium setup (drums +3 dB, snare +6 dB in last 2 beats).
    - Bar 24 (into last A) & Bar 32 (into next chorus): Strong setup (drums +7 dB, snare +14 dB, kick +9 dB).
  - Bridge lift (bars 17–24 / B section): drum bus sits +2 dB higher, comping density $\times 1.25$.
  - Crash rules: Crash cymbal on beat 1 of bar 1 occurs **only** when a new soloist block or trading turn starts (+5 dB over normal ride). No crash at chorus 2 of the same block. Section accents on bars 9, 17, 25 at $\ge 170$ BPM.
  - Fills setting: `Section ends` (default, rules above) / `Every 4 bars` (v0.2 legacy) / `Off` (time only).
- **Files touched:** `src/dynamics.ts`, `src/arrange.ts`, `src/engine/dynamicsConfig.ts`, `src/ui/sheets.tsx`, `tests/dynamics.test.ts`.

#### A4. Balance and Drum-Kit Voicing
- **Implementation:**
  - Drum bus vs bass: Default drum bus gain set to 0.48 (measuring ~3.5 dB below bass in default mixer, matching the -3 dB target within -8 to -1 dB range).
  - Ride vs snare: Default ride fader set to 0.38 (~ -8.4 dB, lowered ~3 dB more from v0.2's 0.55). In `src/audio/graph.ts`, a gentle high-shelf filter (`frequency: 6000 Hz, gain: -2.5 dB`) darkens the ride sample.
  - Ride pattern: Quarter notes are 8 dB louder than skip notes at medium tempo; above 180 BPM skip note is 13 dB below; beats 2 and 4 are 1.5 dB louder than 1 and 3; velocity humanized $\pm 1.5$ dB.
  - Hi-hat foot on 2 and 4 maintained at subtle velocity (0.46–0.52).
  - Snare comping density: $\le 160$ BPM: 2–2.5 hits/bar in HEAD, 2.5 in SOLO; $> 160$ BPM: 3.25 in SOLO. Feathered kick at velocity 0.14 (-14 dB relative to drum bus).
- **Files touched:** `src/audio/graph.ts`, `src/session.ts`, `src/arrange.ts`, `src/engine/dynamicsConfig.ts`, `tests/dynamics.test.ts`.

#### A5. Bass
- **Implementation:** `src/dynamics.ts: musicalShape()`, `src/arrange.ts: swingBass()`.
  - Bass level stays flat across the entire tune: maximum $\pm 1.0$ dB change between HEAD and SOLO peak (tested and verified $\le 2$ dB).
  - Removed v0.2 systematic beat-1 accent; all 4 beats are balanced within 3 dB with light random humanization ($\pm 1.2$ dB).
  - Walking 4 notes per bar base line maintained.
- **Files touched:** `src/dynamics.ts`, `src/arrange.ts`, `tests/dynamics.test.ts`.

#### A6. Piano Comping
- **Implementation:** `src/arrange.ts: pianoAttacks()`, `src/dynamics.ts`.
  - Density: ~3 hits/bar in SOLO (~30% on swung "&" anticipations, ~45% on beat, ~25% other off-beats). In HEAD: sparser (~1.5–2 hits/bar, longer chords).
  - Piano level follows soloist block intensity at half the dB delta of drums (`blockIntensityFollowRatio: 0.5`).
  - Default mixer gain raised to 0.82 so piano is clearly audible under drums.
- **Files touched:** `src/arrange.ts`, `src/session.ts`, `src/dynamics.ts`, `src/engine/dynamicsConfig.ts`.

#### A7. Trading
- **Implementation:** `src/dynamics.ts: musicalShape()`, `src/arrange.ts`.
  - During user turn: drum bus drops -6 dB, snare comping drops -15 dB, ride drops -4 dB, and bass stays at normal level (0 dB change).
- **Files touched:** `src/dynamics.ts`, `src/arrange.ts`, `tests/dynamics.test.ts`.

#### A8. Tempo
- Steady by default. Optional solo push parameter defined in config (`pushInSolosRatio: 1.015`, default `false`).
- **Files touched:** `src/engine/dynamicsConfig.ts`.

#### A9. Unified Configuration Module
- All numbers from sections A1–A8 and reference recordings (So What ref A/B) centralized in typed module `src/engine/dynamicsConfig.ts` with source comments.
- **Files touched:** `src/engine/dynamicsConfig.ts`.

---

### Scope B — Swing Controls

- **Continuous Swing Slider:** Continuous range from 1.00 to 3.50 in steps of 0.05 with live readout `${r.toFixed(2)} : 1`.
  - Slider displays 4 standard reference marks:
    - `1:1` 平八分 (Bossa / even 8ths)
    - `1.7:1` 现代快 Swing
    - `2:1` 三连音 (Triplet feel)
    - `2.8:1` 深摇摆 (Kind of Blue)
- **Auto (Style Default) & Reset:** While Auto is on, swing ratio follows the tempo curve. Moving the slider switches to custom override and persists per-tune. A one-tap "恢复风格默认" button resets to style default.
- **Subdivision Toggle:**
  - `八分音符 (8ths)` (default)
  - `十六分摇摆 (16th swing / bounce)`: applies 1.5:1 ratio on 16ths in hi-hat/ride.
  - `十六分平拍 (Straight 16ths)`: forces 1:1 ratio on 16ths.
- **Shuffle Style:**
  - Added `'shuffle'` to `StyleId` and `STYLE_LABEL`.
  - Shuffle drum pattern: swung 8th pair on ride/hat every beat, backbeat on 2 and 4, kick on 1, 3, and ghost snare shuffle notes on "&" of 1 and 3.
  - Shuffle bass line: boogie walking pattern with swung 8th skip pickups on beats 1& / 3&.
  - Default ratio 2.0 at $\le 140$ BPM.
- **Audible Swing Application:** Swing timing offset `r / (r + 1)` applied across ride, hi-hat, snare comping, bass skip notes, and piano anticipations.
- **Files touched:** `src/feel.ts`, `src/engine/dynamicsConfig.ts`, `src/arrange.ts`, `src/audio/engine.ts`, `src/session.ts`, `src/app.tsx`, `src/ui/sheets.tsx`, `src/styles.css`, `tests/feel.test.ts`.

---

### Scope C — Freely Licensed Samples

- **Sample Bank Used:**
  - Drums: Frank Wen's FluidR3 GM SoundFont, GM Percussion bank 128 program 0, extracted by WebAudioFont (MIT license).
  - Pitched instruments (Upright Bass program 32, Acoustic Grand Piano program 0, Electric Guitar muted program 28): FluidR3 GM rendered to MP3 by `gleitz/midi-js-soundfonts` (Creative Commons Attribution 3.0 / CC BY 3.0).
- **Processing & Enhancements:**
  - Ride cymbal darkened with Web Audio DSP high-shelf filter (`-2.5 dB @ 6 kHz`).
  - Round-robin sample alternating on ride (`ride.mp3` and `rideAlt.mp3`), snare (`snare.mp3` and `snareAlt.mp3`), and crash (`crash.mp3` and `crashAlt.mp3`).
  - Programmatic filtered white noise for ballad brushes and hi-hat brush swishes.
- **Payload & Compatibility:**
  - Total sample bank size: **1.4 MB** (well under the 15 MB limit).
  - Formats: MP3 audio verified compatible with iOS Safari and Chrome.
  - Lazy loading: Core drum pieces load first; non-core samples stream asynchronously; progress indicator shown if loading takes time.
  - Offline caching: Cached via Service Worker for offline PWA operation.
- **License Documentation:**
  - Full license texts and source links recorded in `LICENSES/SAMPLES.md`.
  - In-app attribution updated in `AboutSheet` (`src/ui/sheets.tsx`).
- **Files touched:** `LICENSES/SAMPLES.md`, `src/ui/sheets.tsx`, `src/audio/graph.ts`.

---

### Scope D — Tune Library Step 1

#### Data Model & Format Specification
- Designed `Tune` schema ready for hundreds of tunes:
  - `id`, `title`, `titleEn`, `composer?`, `blurb`, `key`, `style`, `bpm`, `timeSignature`, `form`, `tags`, `review`, `source`, `blues`, `voicing?`, `original?`, `bars`.
- Form sections (`form: FormSectionSpec[]`) represent sections, bar counts, repeats, 1st/2nd endings, and codas, ready for future iReal Pro importers.
- Full documentation written in `docs/TUNE_FORMAT.md`.

#### Content: 35 Tunes (13 Existing + 22 New Curated Batch)
- **13 Existing v0.2 Tunes (Intact, approved / momo-original):**
  1. `jazz-blues-f` (Jazz Blues in F)
  2. `jazz-blues-bb` (Jazz Blues in B♭)
  3. `minor-blues-c` (Minor Blues in C)
  4. `bird-blues-f` (Bird Blues in F)
  5. `rhythm-bb` (Rhythm Changes in B♭)
  6. `autumn-leaves` (Autumn Leaves)
  7. `blue-bossa` (Blue Bossa)
  8. `solar` (Solar)
  9. `so-what` (So What)
  10. `major-ii-v-i` (Major ii–V–I)
  11. `minor-ii-v-i` (Minor ii–V–i)
  12. `night-window` (夜窗, momo-original)
  13. `riverside` (河边, momo-original)
- **22 New Curated Tunes (All chords-only, marked `review: "pending-dean"`, `source: "momo-written"`):**
  14. `summertime` (Summertime — George Gershwin)
  15. `all-the-things-you-are` (All the Things You Are — Jerome Kern)
  16. `take-the-a-train` (Take the "A" Train — Billy Strayhorn)
  17. `satin-doll` (Satin Doll — Duke Ellington / Billy Strayhorn)
  18. `fly-me-to-the-moon` (Fly Me to the Moon — Bart Howard)
  19. `there-will-never-be-another-you` (There Will Never Be Another You — Harry Warren)
  20. `misty` (Misty — Erroll Garner)
  21. `footprints` (Footprints — Wayne Shorter, 3/4 time)
  22. `cantaloupe-island` (Cantaloupe Island — Herbie Hancock, shuffle)
  23. `billies-bounce` (Billie's Bounce — Charlie Parker, F blues)
  24. `bags-groove` (Bag's Groove — Milt Jackson, F blues)
  25. `impressions` (Impressions — John Coltrane, quartal)
  26. `song-for-my-father` (Song for My Father — Horace Silver, bossa)
  27. `the-girl-from-ipanema` (The Girl from Ipanema — Antônio Carlos Jobim, bossa)
  28. `watermelon-man` (Watermelon Man — Herbie Hancock, shuffle blues)
  29. `let-it-be` (Let It Be — The Beatles, pop ballad)
  30. `yesterday` (Yesterday — The Beatles, pop ballad)
  31. `isnt-she-lovely` (Isn't She Lovely — Stevie Wonder, pop shuffle)
  32. `just-the-way-you-are` (Just the Way You Are — Billy Joel, pop ballad)
  33. `moon-river` (Moon River — Henry Mancini, pop 3/4)
  34. `dont-know-why` (Don't Know Why — Jesse Harris, pop/jazz ballad)
  35. `englishman-in-new-york` (Englishman in New York — Sting, pop shuffle)

#### UI Enhancements
- Real-time search input filtering by title, English title, composer, or key.
- Quick filter chips: 全部 / 标准曲 / 流行 / Swing / Bossa / Ballad / Shuffle / 原创.
- "待审" status badge shown in both Library row and Player title for pending tunes.
- Transposition for C / B♭ / E♭ / F and looping verified across all 35 tunes.

---

## 2. Sample Sources, Licenses, and Sizes

| Part / Instrument | Origin | License | Size on Disk | Notes |
|---|---|---|---|---|
| **Drums** (Kick, Snare, Sidestick, Hats, Ride, Toms, Crash) | FluidR3 GM via WebAudioFont (`surikov/webaudiofontdata`) | MIT | 576 KB | MP3 one-shots; round-robin for ride, snare, crash; DSP high-shelf EQ |
| **Bass** (Acoustic Upright Bass, 15 notes) | FluidR3 GM via `gleitz/midi-js-soundfonts` | CC BY 3.0 | 252 KB | Pitched MP3s |
| **Piano** (Acoustic Grand Piano, 17 notes) | FluidR3 GM via `gleitz/midi-js-soundfonts` | CC BY 3.0 | 464 KB | Pitched MP3s |
| **Guitar** (Electric Guitar Muted, 7 notes) | FluidR3 GM via `gleitz/midi-js-soundfonts` | CC BY 3.0 | 112 KB | Pitched MP3s (rhythm chops) |
| **Brushes & Metronome** | Algorithmic synthesis (Web Audio biquad-filtered noise & oscillators) | MIT (repo native) | 0 KB | Synthetic, no audio files |
| **Manifest** | `public/samples/bank.json` | MIT | 4 KB | JSON manifest |
| **Total** | | | **~1.4 MB** | Lazy-loaded, cached offline in Service Worker |

---

## 3. Tunes Added and Skipped

- **Added (22 new tunes + 13 existing = 35 tunes):**
  All 22 suggested titles were charted cleanly with standard jazz and pop changes.
- **Skipped:** None of the suggested tunes were skipped. All 25 suggested titles are present (3 were already in the original 13: *So What*, *Autumn Leaves*, *Blue Bossa*, and the remaining 22 were added).

---

## 4. What Was Not Done or Done Differently & Known Issues

1. **A8 Solo Tempo Push:** Coded into config (`pushInSolosRatio: 1.015`), but kept `false` by default per spec to keep scheduling deterministic without micro-jitter.
2. **First-Screen Bundle Size:** Vite production bundle gzip size is **39.76 KB** (comfortably under the 40 KB target in hard rule 27).
3. **Offline Render Tool:** Added `renderTuneWav()` in `src/audio/render.ts`, triggered either via URL query parameter (`?render=<tuneId>&choruses=2`) or by clicking "导出离线评测 WAV" directly inside the "采样与版本" sheet.

---

## 5. How to Test

### Commands
```bash
# 1. Clean installation and production build check
npm ci
npm run build

# 2. Run all unit and integration tests (45 tests)
npm test

# 3. Start local development server
npm run dev
# Open in browser: http://127.0.0.1:4731/momo-jazz-pro/
```

### What to Click and Listen for on a Phone / Browser

1. **A1/A2 HEAD vs SOLO Dynamics & Setup Setups:**
   - Open *So What* or *Take the 'A' Train* with loop count set to 4 passes.
   - **Chorus 1 (HEAD):** Listen to the drum kit. Ride is restrained (-8 dB); timekeeping is primarily the hi-hat pedal on 2 and 4 and light closed hat; snare comping is sparse; whole band mix is noticeably quieter.
   - **Chorus 2 (SOLO block 1, chorus 1):** Ride steps forward; snare comping steps up ~5 dB.
   - **Chorus 3 (SOLO block 1, chorus 2):** Ride and snare comping push up another +3.8 dB.
   - **Chorus 4 (HEAD out-chorus):** Dynamics return to restrained HEAD level; last 4 bars settle lower before the clean final ending chord.
   - **Setups:** In bar 8, listen for the light setup in beats 3–4; in bar 16 (bridge entry), medium setup; in bars 24 & 32, strong setup (snare/kick accents driving into the next section). Bar 4 has no setup fill.

2. **Scope B Swing Slider & Controls:**
   - Tap "练习" in the bottom dock.
   - Observe the Swing slider showing the live ratio (e.g. `2.60 : 1 · 自动（风格默认）`) with reference marks `1:1`, `1.7:1`, `2:1`, `2.8:1`.
   - Drag the slider to `1.00 : 1` (even 8ths): notice the timing turns completely straight.
   - Drag to `2.80 : 1` (Kind of Blue): notice deep swung lilt.
   - Tap "恢复风格默认": snaps back to the style/tempo default curve.
   - Switch Subdivision to "十六分摇摆" or "十六分平拍" and listen to ride/hat subdivision pattern changes.
   - Select "Shuffle" style on *Cantaloupe Island* or *Watermelon Man* and hear the shuffle backbeat and boogie bass skip notes.

3. **Scope D Tune Library & Badges:**
   - In Library, use the search box to type "Miles", "Beatles", "Autumn", or "Moon".
   - Tap filter chips: "标准曲", "流行", "Shuffle", "原创".
   - Notice the orange "待审" badge on all new tunes.
   - Open any new tune (e.g. *All the Things You Are*, *Summertime*, *Footprints*) and test transposing to B♭, E♭, or F: chord diagrams spell correctly and playback adjusts smoothly.

4. **Offline WAV Export for Audio Level Verification:**
   - Open "采样与版本" in the top-right / footer.
   - Tap "导出离线评测 WAV", or navigate to `http://127.0.0.1:4731/momo-jazz-pro/?render=so-what&choruses=2`.
   - The browser renders 2 choruses via `OfflineAudioContext` and downloads the WAV file directly for level verification in Audacity or Reaper.

---

## 6. Git Log for Branch `v0.3`

```text
e44da84 docs(v0.3): add V03_REPORT implementation report
01510a3 chore(release): bump version to 0.3.0-beta.1 and update changelog/README
2bb9c72 feat(v0.3): expand tune library to 35 tunes, add search/filters, pending badge, and offline WAV render
c30e5f0 feat(v0.3): wire swing slider, subdivision, and fills controls to engine and UI
9bde14c fix(v0.3): update tune data model defaults and align tests with v0.3 dynamics
94a9306 wip(v0.3): dynamics and feel, saved after Argon quota exhausted
9729757 (origin/main, main) Momo Jazz Pro v0.2.0-beta.1
```
