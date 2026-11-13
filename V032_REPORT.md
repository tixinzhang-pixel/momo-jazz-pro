# Momo Jazz Pro v0.3.2 — measured report

Version `0.3.2-beta.1`, branch off `v0.3` at `f44baa2`. This report replaces the claims in `V031_REPORT.md`. Every number below was measured on this build. Where a target is missed, it is marked missed.

## How it was measured

Stereo renders use the app path: `arrangeBar` → `createGraph` → `playHit` in an `OfflineAudioContext` at 44.1 kHz, So What at 136 BPM, Auto, humanized, six choruses unless noted. Reverb is seeded so repeats match.

- **Mix, bass, piano, drum bus:** the instrument is soloed through the same master chain (compressor, soft clip, trim) and the stereo RMS is taken. On v0.3.1 this drum-bus method reproduced the acceptance levels (−34.2 / −28.2 on the first two choruses).
- **Ride / snare / kick bands:** 4th-order band limits of the drum-bus render. Ride 5–12 kHz, snare 150–400 Hz, kick 40–140 Hz. Bar rows are that bar’s RMS minus the chorus RMS.
- **Ride stem:** the ride bus tapped before the master compressor. v0.3.1’s head ride stem was −54.5 dBFS on that kind of tap; this build measures −47.1.
- **Hits:** counted from `arrangeBar` with humanize off. Snare comping excludes the So What answer catches (sidestick on beat 3 and 4&). Piano attacks are note groups more than 80 ms apart.

v0.3.1 column is the acceptance review, not a number re-rendered from that commit in this session.

## So What, 6 choruses, Auto, 136 BPM

| # | Metric | Target | v0.3.1 | v0.3.2 | |
|---|---|---|---|---|---|
| 1 | Drum bus SOLO − HEAD | +3 to +6 | +7.4 | **+4.4** (peak chorus +5.9) | met |
| 2 | Ride band SOLO − HEAD | ≈ +8 | +7.4 | **+5.7** | missed |
| 2b | Head ride stem vs v0.3.1 | up about 6–8 dB | −54.5 dBFS | **−47.1 (+7.4 dB)** | met |
| 3 | Whole mix SOLO − HEAD | dropped | +2.6 | **+2.0** | dropped on purpose |
| 4 | Drums − bass, SOLO | ≈ −3 | −0.7 | **−0.8** average, **−1.8** first solo | missed on the average |
| 5 | Ride band − snare band, SOLO | −2 to −3 | −5.3 | **−3.6** | 0.6 dB outside |
| 6 | Piano vs mix | audible | −7.2 | **−6.9** | met |
| 7 | Piano SOLO − HEAD | ≈ +2 | +3.5 | **+1.8** | 0.2 dB short |
| 8 | Bass range across choruses | ≤ 2 | 0.7 | **0.8** | met |
| 9 | Block 1, chorus 2→3, ride / snare band | +2 to +4 | +3.0 / +2.1 | **+3.4 / +1.7** | ride met, snare 0.3 short |
| 10 | New block drop, chorus 3→4, drums / ride band | −2 to −3 | −0.4 / −1.9 | **−2.6 / −3.7** | drums met, ride 0.7 past |
| 11 | Out-head bars 29–31 vs the same bars of the head | −1 to −2 | −2.0 | **−2.1** | on the edge |
| 12 | Section mode, bars 4 / 12, drums | none | −2.3 / −2.1 | **−5.2 / −5.1** | met |
| 13 | Bar 8 drums | +1 to +2 | +2.6 | **−1.7** | missed |
| 14 | Bar 16 drums | +3 | +7.3 | **+1.6** | missed (under) |
| 15 | Bars 24 / 32, drums | 6–8 | 8.6 / 8.5 | **8.8 / 8.1** | 24 is 0.8 over |
| 15 | Bars 24 / 32, snare band | 12–16 | 6.3 / 6.0 | **10.5 / 9.9** | missed (under) |
| 15 | Bars 24 / 32, kick band | 7–11 | 18.3 / 18.3 | **8.6 / 7.2** | met |
| 16 | Head fills, bars 24 / 32, drums | about 8 dB under v0.3’s +17.7 / +17.5 | +13.2 / +11.3 | **+7.3 / +6.1** | softer; see note |
| 17 | Ride quarter − skip, SOLO, velocity | 7–9 dB | 7.4 | **7.4** | met |
| 18 | Snare comping hits/bar, HEAD / SOLO | 2–2.5 / 2–3 | 1.59 / 2.68 | **2.38 / 2.68** | met |
| 19 | Piano attacks/bar, HEAD / SOLO | theme / ≈ 3 | 1.0 / 3.0 | **1.0 / 3.0** | met (So What head is the answers only) |
| 20 | Trading, user bars 1–3 vs no trade: drums / snare band / ride band / bass | −6 / −15 / −4 / 0 | −6.0 / −14.5 / −2.5 / 0 | **−5.8 / −10.7 / −5.1 / 0** | drums and bass met; snare short; ride 1 dB past |
| A2 | Every-4 mode, solo bars 4 / 12, drums | audible light–medium | +0.5 / +1.8 | **−0.5 / +0.1** vs chorus, **+4.7 / +5.2** vs the empty section-mode bars | filled, not as hot as +2…+3 on the chorus-relative scale |

Chorus drum bus, dBFS: −32.4, −29.2, −26.6, −29.1, −27.4, −32.6 (HEAD, four SOLO, out-head).

### Why #3 is dropped

With bass held flat (range 0.8 dB, solo bass about −27.3 dBFS) and the drum bus only a few dB under it, the rhythm section cannot rise 4–5 dB from head to solo. The old +4–5 figure included horns. This build measures the rhythm section at **+2.0 dB**. That is the number, not a failure of the faders.

### Why drums are not 3 dB under bass on average

The first solo chorus is −1.8 dB (drums −29.2, bass −27.4). Later solo choruses step up, so the four-solo average is only **−0.8 dB**. Pulling the average down to −3 would push SOLO−HEAD under +3. Both cannot be true while bass stays flat and the block still steps up. SOLO−HEAD was kept inside +3…+6 (**+4.4**).

### Head fills vs v0.3

v0.3’s head bars 24/32 were +17.7 / +17.5 on the acceptance rig. This rig was not used to re-render that commit, so “exactly 8 dB softer than v0.3” is not claimed. On this rig the same bars are **+7.3 / +6.1**, against v0.3.1’s published +13.2 / +11.3. They are softer. Kick on those solo bars moved from a clamped +18.3 into **+8.6 / +7.2**.

Setup gain is no longer folded into velocity and clipped at 1. A strong snare hit now carries a linear gain above 1 (about 4× on a solo bar 24). Snare bars 24/32 still stop around +10 rather than +12…+16, because those bars also raise the chorus mean.

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
- **Samples.** No files under `public/samples` were replaced. `LICENSES/SAMPLES.md` now says the So What melody is in the repo, that it is copyrighted, and that the public beta is a decision to keep it visible, not a claim that the tune is free to republish.

## Build

`npm test`: 5 files, 52 passed. `npm run build` is clean. First-screen JS `index-*.js` is **33.0 KB gzip** (limit 40). The arranger loads when playback starts, not on the first screen. The render module stays split.
