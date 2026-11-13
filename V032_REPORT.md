# Momo Jazz Pro v0.3.2 — measured report

Version `0.3.2-beta.3`, branch off `v0.3` at `f44baa2`. This report replaces the claims in `V031_REPORT.md` and the beta.1 fill table. Feel numbers below were measured on beta.3. The fill table is the beta.2 measurement; a beta.3 recheck of the same v0.3.1 metric landed within 0.1 dB (bar 8 still +1.5, bar 16 +3.3, bars 24/32 +6.4/+6.2, kick 0–120 Hz +9.4/+7.7). Where a target is missed, it is marked missed.

## How it was measured

Stereo renders use the app path: `arrangeBar` → `createGraph` → `playHit` in an `OfflineAudioContext` at 44.1 kHz, So What at 136 BPM, Auto, humanized, six choruses unless noted. No intro on these takes. Reverb is seeded so repeats match. Fills in section mode unless noted.

Two fill metrics are both published. They do not agree, and the v0.3.1 review uses the first one.

- **v0.3.1 fill metric.** Last two beats of the bar, RMS, minus the median of those last-two-beat levels across the 32 bars of that chorus. The table averages the four solo choruses. Bands: ride 5–12 kHz, snare 150–400 Hz, kick 0–120 Hz (4th-order lowpass). This is the metric the acceptance used when it called the fills hot.
- **Whole-bar metric.** The bar’s RMS minus that chorus’s RMS. The beta.1 report used this, often on the first solo chorus only, with the kick band at 40–140 Hz. It makes the same fills look quieter. Both columns are in the fill rows.
- **Mix, bass, piano, drum bus.** The instrument is soloed through the same master chain (compressor, soft clip, trim). Chorus figures are stereo RMS.
- **Ride / snare / kick bands** are 4th-order limits of that drum-bus render. Kick band for the v0.3.1 column is 0–120 Hz. The 40–140 Hz band is only in the whole-bar column where it differs.
- **Snare peak** is the kit snare bus tapped before the master, max absolute sample, on the loudest solo chorus plus the out-head.
- **Hits.** Snare comping is counted from `arrangeBar`. Piano “scheduled” attacks are note groups more than 40 ms apart, humanize on. The acceptance’s 2.41 is an onset count on the rendered audio; this follow-up did not change the piano, so that count is the one their counter should still read.

v0.3.1 column is the earlier acceptance review, not a number re-rendered from that commit in this session.

## So What, 6 choruses, Auto, 136 BPM

| # | Metric | Target | v0.3.1 | v0.3.2 | |
|---|---|---|---|---|---|
| 1 | Drum bus SOLO − HEAD | +3 to +6 | +7.4 | **+4.1** (peak chorus +5.9) | met |
| 2 | Ride band SOLO − HEAD | ≈ +8 | +7.4 | **+6.8** | missed |
| 2b | Head ride stem vs v0.3.1 | up about 6–8 dB | −54.5 dBFS | **unchanged path; acceptance measured −47.7 (+6.8 dB)** | met on the prior stem; see note |
| 3 | Whole mix SOLO − HEAD | dropped | +2.6 | **+1.9** | dropped on purpose |
| 4 | Drums − bass, SOLO | ≈ −3 | −0.7 | **−1.2** average, **−2.0** first solo | missed on the average |
| 5 | Ride band − snare band, SOLO | −2 to −3 | −5.3 | **−0.6** | missed; see note |
| 6 | Piano vs mix | audible | −7.2 | **−6.9** | met |
| 7 | Piano SOLO − HEAD | ≈ +2 | +3.5 | **+1.8** | 0.2 dB short |
| 8 | Bass range across choruses | ≤ 2 | 0.7 | **0.8** | met |
| 9 | Block 1, chorus 2→3, ride / snare band | +2 to +4 | +3.0 / +2.1 | **+3.2 / +1.9** | ride met, snare 0.1 short |
| 10 | New block drop, chorus 3→4, drums / ride band | −2 to −3 | −0.4 / −1.9 | **−2.9 / −3.9** | drums met, ride 0.9 past |
| 11 | Out-head bars 29–31 vs the same bars of the head, drums | −1 to −2 | −2.0 | **−2.1** | met |
| 12 | Section mode, bars 4 / 12, drums, v0.3.1 metric | none | −2.3 / −2.1 | **−1.4 / −1.9** | met |
| 13 | Bar 8 drums, v0.3.1 metric | +1 to +2 | +2.6 | **+1.5** | met (kept) |
| 14 | Bar 16 drums, v0.3.1 metric | +3 | +7.3 | **+3.2** | 0.2 over the point |
| 15 | Bars 24 / 32, drums, v0.3.1 metric | 6–8 | 8.6 / 8.5 | **+6.4 / +6.2** | met |
| 15 | Bars 24 / 32, snare band, v0.3.1 metric | 12–16 | 6.3 / 6.0 | **+9.8 / +9.8** | missed (under) |
| 15 | Bars 24 / 32, kick 0–120 Hz, v0.3.1 metric | 7–11 | 18.3 / 18.3 | **+9.5 / +7.8** | met |
| 16 | Head fills, bars 24 / 32, drums, v0.3.1 metric | about 8 dB under v0.3’s +17.7 / +17.5 | +13.2 / +11.3 | **+11.3 / +11.6** (6.4 / 5.9 dB under) | softer; not a full 8 dB |
| 17 | Ride quarter − skip, SOLO, velocity | 7–9 dB | 7.4 | **7.4** | met |
| 18 | Snare comping hits/bar, HEAD / SOLO | 2–2.5 / 2–3 | 1.59 / 2.68 | **2.44 / 2.74** | met |
| 19 | Piano attacks/bar, HEAD / SOLO | theme / ≈ 3 | 1.0 / 3.0 | **scheduled 1.0 / 3.0; acceptance onsets 1.0 / 2.41** | 2.41 stands; see note |
| 20 | Trading, user bars 1–3 vs no trade | −6 / −15 / −4 / 0 | −6.0 / −14.5 / −2.5 / 0 | not retuned | kept from the acceptance |
| A2 | Every-4, bars 4 / 12, drums, v0.3.1 metric | about +2 to +3 | +0.5 / +1.8 | **+2.9 / +3.2** | bar 12 is 0.2 past +3 |
| P | Snare bus peak before the master | < 1.0, no clip | 7.5 linear | **0.985** | met |

Chorus drum bus, dBFS: −32.3, −29.5, −26.7, −29.6, −27.9, −32.8 (HEAD, four SOLO, out-head).

Mix: −25.6, −24.2, −23.2, −24.2, −23.7, −25.7. Bass: −28.0, −27.4, −27.2, −27.3, −27.3, −27.9. Piano: −32.4, −30.6, −30.7, −30.6, −30.8, −32.5.

Ride band: −43.4, −37.8, −34.6, −38.5, −36.6, −43.9. Snare band: −41.0, −37.5, −35.6, −36.8, −35.3, −41.4.

### Both fill metrics

v0.3.1 metric is last two beats minus the chorus median, averaged over the four solo choruses. Whole-bar is the bar RMS minus the chorus RMS, same four-chorus average, with the first solo chorus in parentheses (that is the single chorus the beta.1 table leaned on).

| Bar | v0.3.1 drums | whole-bar drums | v0.3.1 kick 0–120 | v0.3.1 snare 150–400 |
|---|---|---|---|---|
| 4 (section, should be empty) | −1.4 | −3.0 (−3.5) | −1.6 | −4.0 |
| 8 | +1.5 | +0.5 (+0.2) | +3.5 | +2.4 |
| 12 (section, should be empty) | −1.9 | −3.0 (−3.4) | −1.4 | −4.8 |
| 16 | +3.2 | +1.4 (+0.2) | +9.4 | +5.8 |
| 24 | +6.4 | +3.9 (+4.6) | +9.5 | +9.8 |
| 32 | +6.2 | +3.4 (+4.1) | +7.8 | +9.8 |

The four solo choruses do not sit on the same number. Bars 24/32 on the v0.3.1 drum metric read +7.6/+7.5, +4.8/+4.6, +7.5/+7.4, +5.7/+5.4. The loud chorus of each block has a higher median, and the snare ceiling holds the fill at one absolute level, so that chorus’s *relative* fill is the small one. The average is what the v0.3.1 review publishes, and that average is inside 6–8.

Head fills on the same metric, bars 24/32: opening head +11.3 / +11.6, out-head +11.2 / +9.5. Whole-bar on the opening head is +7.1 / +7.1.

Every-4 mode, three solo choruses, v0.3.1 metric, bars 4/12: +2.9 / +3.2. Whole-bar on the same bars: +0.7 / +0.9. Section mode leaves those bars empty (table above).

### Why the snare band is under 12–16

A strong solo fill used to push the raw snare bus to 7.5 linear, and the 16-bit stem clipped. The snare, sidestick, and tom hits are now capped at velocity × gain = 0.82 before the kit fader. On the loudest solo chorus the tapped snare bus peaks at **0.985**. Mix peak on the six-chorus take is 0.60. Nothing clips.

That ceiling is why bars 24/32 snare band stop at **+9.8** instead of 12–16. Another 2 dB of snare would put the bus over full scale. Drums on those bars are +6.4 / +6.2, inside 6–8, with a little room that cannot be spent without crossing 1.0.

### Why #3 is dropped

With bass held flat (range 0.8 dB, solo bass about −27.3 dBFS) and the drum bus a bit under it, the rhythm section cannot rise 4–5 dB from head to solo. The old +4–5 figure included horns. This build measures the rhythm section at **+1.9 dB**.

### Why drums are not 3 dB under bass on average

The first solo chorus is −2.0 dB (drums −29.5, bass −27.4). Later solo choruses step up, so the four-solo average is **−1.2 dB**. Pulling the average down to −3 would push SOLO−HEAD under +3. SOLO−HEAD was kept inside +3…+6 (**+4.1**).

### Ride band and the head ride stem

Ride band SOLO−HEAD is **+6.8** (target about +8). It was +5.8 on the acceptance. The solo drum bus was raised 1.3 dB to put the drum-bus SOLO−HEAD back to +4.1 after the fills got quieter, and the head’s 5–12 kHz band lost some snare crack, so the ride-band gap widened by about 1 dB. Still short of +8.

Ride minus snare in the solo is **−0.6** (target −2 to −3). The acceptance measured −3.8. The snare band fell because the fills that used to dominate it are capped, while the ride did not. That is the cost of the peak ceiling. The ride fader is still 0.80. It was not moved: lowering it would also drop the head ride stem, which the acceptance already passed at −47.7 dBFS (+6.8 dB over v0.3.1’s −54.5). This follow-up does not change that fader, the head ride boost, or the head drum-bus offset. A kit.ride tap on this run, before the master, reads −44.1 dBFS on the opening head. That tap sits 0.7 dB under this run’s ride band; the acceptance stem sat 6.5 dB under its ride band, so the two taps are not the same point and −44.1 is not a new “+10 dB” claim.

### Piano attacks

`arrangeBar` with humanize on groups solo piano into **3** attacks on every one of the 128 solo bars (40 ms). The acceptance counted **2.41** onsets per bar in the audio, with both a 40 ms and an 80 ms grouping, and this follow-up does not change the piano comping. The report does not claim their counter now reads 3.0. Adding a fourth attack to chase 2.41 would also move piano SOLO−HEAD, which is already +1.8 against a target of about +2.

### Head fills vs v0.3

v0.3’s head bars 24/32 were +17.7 / +17.5 on the acceptance rig. This rig was not used to re-render that commit. On the v0.3.1 metric this build is **+11.3 / +11.6**, which is 6.4 / 5.9 dB under those figures, not a full 8. The acceptance of beta.1 read +11.4 / +10.4 on the same metric.

## Feel, measured on beta.3

Before numbers are the beta.2 diagnosis of `5c07fbc` (So What, 136 BPM, first solo chorus unless noted). After numbers are this build. Hit timing is from `arrangeBar`. The gap level is the bass stem, 8 ms before each next onset, relative to that note’s peak. Humanize is on for the jitter column and off for the grid offsets.

| | beta.2 | beta.3 |
|---|---|---|
| Solo bass pitches, one chorus | 3 pitches, **80 of 128** are D1. First 8 bars are `D D D C♯` eight times | **18** pitches, **20 of 133** are D1 (15%). Range **E1–C3** (MIDI 28–48). Immediate repeats **0** |
| First 8 solo bars | D–D–D–C♯ × 8 | `F1 E1 A1 C2`, `D2 C2 A1 C♯2`, `C2 D2 F1 B1`, `A1 G1 D2 B1`, `C2 D2 F2 A1`, `D2 E2 A1 C♯2`, `C2 A1 F2 C♯2`, `D2 B1 C2 Bb1` |
| Beat 4 into the next downbeat | the same C♯, or nothing | **65%** chromatic, **100%** within a 2nd, 4th, or 5th. Beats 1 and 3 are chord tones on every bar |
| Note length / IOI | **0.89** (395 ms of a 441 ms beat). Gap **45 ms**, level **−46 dB** | **1.00**. Level in the 8 ms before the next note **−12.4 dB** (p10 −14, p90 −10) |
| Theme call length | every note **171 ms** (`0.42 × 0.92`) | the inter-onset interval: **138 ms** on the short 8th, **303 ms** on the long 8th. The answer hold is the written 2.2 beats |
| Downbeat offset | ride **−6 ms**, bass scheduled **−4 ms** (heard late: the sample speaks ~8 ms later), snare **+10 ms**, piano **+14 ms** plus a 7 ms roll | ride **+4 ms**, bass scheduled **−14 ms** (heard about **10 ms before the ride** after the 8 ms speech), snare **+4 ms** (ghosts +8), piano attacks **+6 ms**, roll **3.5 ms** |
| Jitter, humanize on, std | ride about **1 ms** | ride **3.9 ms**, bass **4.1 ms**, snare family **5.3 ms** |
| Heard swing, grid-relative long:short | ride **2.43**, snare **2.93**, piano (every tone) **3.67**. Programmed ratio locked at **2.6** | ride **2.29**, snare **2.31**, piano attacks **2.42** (every tone 2.53). Programmed curve is **2.20** at 136, and each bar breathes ±0.06 |
| Head ride, beats 2 and 4 vs 1 and 3 | **−4.6 dB** | **+1.5 dB**, the same accent as the solo |

The bass line is deterministic: the same tune, chorus, and bar always produce the same notes. Walking quarters are not swung. The few swung pickups (5 in this chorus) sit on the bass pocket, so their grid-relative ratio is shallower (about 1.9). Ride, snare, and piano share the bar’s swing; their heard ratios sit together around 2.3.

## So What theme, as implemented

Odd bars are the call (beat 1 is a rest). Even bars are the held answer note plus the piano chords. The bridge (bars 17–24, Ebm7) is the same pattern one semitone up. MIDI is written for D Dorian at transpose 0; D2 = 38.

| Beat | Bar 1 (call) | Bar 2 (answer) |
|---|---|---|
| 1 | rest | D3 (50), held about 2.2 beats |
| 1& | D2 (38) | held |
| 2 | A2 (45) | held |
| 2& | B2 (47) | held |
| 3 | C3 (48) | piano E3 A3 D4 G4 B4 (52 57 62 67 71) |
| 3& | D3 (50) | held chord |
| 4 | E3 (52) | held chord |
| 4& | C3 (48), quieter | piano D3 G3 C4 F4 A4 (50 55 60 65 69) |

Bridge call 4& is Db3 (49), not C3. The last answer of each 8-bar section is a few dB softer.

The theme plays only on HEAD choruses. With 2 choruses the second chorus is the out-head, so it plays the theme too. Solo choruses walk.

**Horns.** The FluidR3 subset in this repo is drums, acoustic bass, acoustic piano, and muted guitar. There is no trumpet, saxophone, or trombone sample, and no new audio was added. The answer is piano on every head bar, including from bar 9. A muted-guitar double would not be the Miles Davis horns, so it was not added.

**Intro.** Optional, So What only, 0 / 4 / 8 bars, default 4. Bass plays the call; the piano does not answer. The practice sheet has the switch. Listening renders of the 6-chorus and 2-chorus takes include the 4-bar intro. The table above does not; those renders start on bar 1 of the form.

## Other fixes

- **v0.2 storage.** Key `momo-jazz-pro-v1` still migrates into `momo-jazz-pro-v031`. Factory values that used to be kept are now rewritten: piano 0.70 → 0.82, bass 0.80 → 0.86, reverb 0.28 → 0.24, hat 1.0 → 0.92, snare 1.18 → 1.24, kick 1.26 → 1.18, plus the existing drums 0.86 and ride 0.55/0.38 resets. A fader that is not the old factory value is kept. `loadSession` is tested against a fake `localStorage`.
- **Satin Doll.** The bridge is doubled bars, same spelling as the A sections: `Gm7 | C7 | Gm7 | C7 | Fmaj7 | % | % | % | Am7 | D7 | Am7 | D7 | G7 | % | % | %`. The form is 64 bars, AABA (16+16+16+16). Footprints was not touched.
- **Config.** `newBlockDropDb`, the three snare hit-rate targets, both piano hit-rate targets, `bass.skipNoteProbability`, `tempo.pushInSolosDefault` / `pushInSolosRatio`, and `solo.drumBusDbOffset` each change the output; there is a test that mutates them. `swing.provisionalPendingDeanReview` was only a review flag and did not drive sound, so it was removed from the config object. The swing curves are unchanged.
- **Samples.** No files under `public/samples` were replaced. `LICENSES/SAMPLES.md` says the So What melody is in the repo, that it is copyrighted, and that the public beta is a decision to keep it visible, not a claim that the tune is free to republish.

## Build

`npm test`: 5 files, 55 passed. `npm run build` is clean. First-screen JS `index-*.js` is **33.1 KB gzip** (limit 40). The arranger loads when playback starts, not on the first screen. The render module stays split.
