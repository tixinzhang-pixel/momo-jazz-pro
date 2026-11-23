# STATUS_round2 — 钢琴应答力度，第二轮

日期：2026-11-24。北京时间 2026-11-24 00:47，Timo 听完首轮后回复「请继续有在变好」。这只授权继续实验，不合并且不发布。本文件不覆盖 `STATUS.md`，首轮产物目录也不改。

这是本阶段第 2 轮。首轮得到的是正反馈，不是失败返工。最多 3 轮。这一轮只交付一版。

## 基线

- A 就是首轮 B，SHA `0746d1e26f826ef3aedc440bf8c2604957db67b7`，分支 `cursor/piano-answer-phase-4d2a`。
- 首轮相位锁定原样保留。B 在这个 SHA 上只加主题 1–16 的钢琴 velocity。
- 不改 PR #1 分支、`main`、`v0.3`。不新开 PR。版本号仍是 `0.3.2-beta.4`。

## 窗口

和首轮相同。So What，136 BPM，D Dorian，concert，transpose 0。音乐小节 1–16 = `barIndex` 0–15，`chorus` 0，`playBar` 0–15，`repeats` 6。没有引子，没有第 17 小节 note-on，没有 ending。`T0 = 0.08 s`，尾巴 0.8 s，总长 29.115306 s。`humanize: true`，种子不变。Convolver `normalize = true`。同一条 `createGraph` / `playHit` 链，脚本 `scripts/render-theme16-ab.mjs`。

## 反馈证据

- 继续的授权是 Timo 在 2026-11-24 00:47 北京时间的原话「请继续有在变好」。
- 本轮针对的是此前转述的「伴奏缺强弱 / 双手关系」。不是对首轮相位的否定，也不是新的听评。
- 首轮独立核验：所报 note-on 中位 −6.1 ms 不准确。口径如下，80 个钢琴事件全部计入。匹配键是 `bar + midi + velocity + duration + gain + pan + release`，两边都是 Chrome、`humanize: true`。`delta = (B.time − A.time) × 1000`，单位毫秒，升序。n = 80，偶数中位数取第 40、41 个（下标 39、40）的平均。下标 39 是 −6.144854882731865 ms，下标 40 是 −5.480803498727926 ms，平均 −5.812829190729896 ms，四舍五入 −5.813 ms。先前写的 −6.1 ms 只取了较低的那一个再取整。均值 −8.365180680710976 ms，最小 −26.087864560572992 ms，最大 +3.625711349770633 ms。已有摇摆网格不能用来反驳「不 swing」的感受。首轮相位本轮不动。

## 调查（改之前）

80 个主题应答音符，MIDI velocity：最小 63.797，p10 68.839，p50 73.480，均值 73.306，p90 77.298，最大 78.498。

按落点切开（`time < 2.7 × beat` 是第 3 拍长和弦，其余是 4& 短和弦）：

- 长和弦 40 音，均值 72.555。
- 短和弦 40 音，均值 74.057。
- 播放振幅是 `velocity^1.35`。两和弦能量和只差 0.244 dB。

和弦内部按音高从低到高：低音均值 72.506，三个内声部 73.306，最高音 74.106。原先 `(index − 2) × 0.4` 只给了大约 ±0.8 MIDI。可闻的声部平衡主要在 gain（最高 +3.5 dB，最低 −1.4 dB，内声 −0.6 dB），gain 本轮冻结。这 16 小节没有分开的左右手事件，全部 `pan = −0.22`。

第 8、16 小节因为原来的 `answerIndex === 3`，短和弦反而更轻（第 8 小节 64.597 对 70.370）。这是乐句收尾的下沉，本轮保留每小节的平均力度，不把这段填平。

## 单变量

只改主题 1–16 钢琴应答的 velocity。固定偏移，按和弦和音高名次，不是随机音量。十个偏移加总为 0，所以每小节 10 个音的 MIDI 均值不变。没有新的随机数调用，note-on 不会被挪动。

长和弦，从低到高：−15、−12、−12、−12、−9。短和弦：+9、+12、+12、+12、+15。

选择理由：0.244 dB 的和弦差听不出强弱。短和弦能量和要比长和弦大约高 4 dB，才算一个句法重音，同时最高音比最低音高 6 个 MIDI，用来代替这里不存在的左右手。偏移表在交付前改过一次，见文末工时。交付的就是这一张。

## 冻结

136 BPM、D Dorian、全部音源、乐器 gain、EQ、音高、和声、音数、时值、左右手配器、note-on（含首轮相位）、鼓和贝斯事件。不挪音符，不加音符，不整体调大钢琴，不回补主题鼓或独奏钢琴电平。第 17 小节以后的应答不进这个函数。

## 回退和验收

- 技术：非钢琴字段相同；钢琴只有 velocity 变；80 个 note-on 与首轮 B 相同；无削波、无整段静音、尾巴没被截断；原始响度差 ≤ 0.5 LU，否则只允许整段透明 gain 并写明前后 LUFS。
- 听感：本轮没有听审。谱面和事件自检不等于好听。听完若无改善，回退就是不用这个力度函数。第 3 轮若仍无改善，停，换方法。

## 技术结果

匹配口径：钢琴按 `bar + time + midi + duration + gain + pan + release` 配对，velocity 不参与配对。非钢琴按全部字段排序比对。note-on 按 `bar + time + midi` 与首轮 B 的 80 个事件比对。

- 事件 353 = 353。非钢琴 273 个，逐字段相同。
- 钢琴 80 个全部配上，配对键以外没有别的差异。velocity 差值最小 −15、最大 +15、均值 0.000000。没有撞上 1–127 的钳位（交付后最小 53.039，最大 93.498）。
- 80 个 note-on 与首轮 B 严格相同，mismatch = 0。
- 每小节 10 音均值 A/B 相同：第 2 小节 75.314，第 4 75.561，第 6 75.141，第 8 67.484，第 10 71.177，第 12 74.820，第 14 71.713，第 16 75.239。
- 长和弦 40 音 MIDI 均值 72.555 → 60.555（最小 53.039，最大 68.398）。短和弦 74.057 → 86.057（最小 72.797，最大 93.498）。八个小节的短和弦均值都高于长和弦。第 2 小节 60.930 对 89.698。原来倒置的第 8 小节变成 58.370 对 76.597，第 16 小节 64.598 对 85.880。第 8 小节整小节均值仍是 67.484，收尾下沉还在。
- `velocity^1.35` 的能量和：全部音符 B 比 A 高 0.064 dB。长和弦 −2.116 dB，短和弦 +1.761 dB。短和弦相对长和弦从 0.244 dB 变为 4.121 dB。
- 声部按每个和弦里的 MIDI 从低到高排，16 个和弦合在一起。低音均值 72.506 → 69.506，但这是长和弦低音大约 53–61 和短和弦低音大约 73–86 叠在一起。内声均值仍是 73.306，长和弦内声大约 56–65，短和弦内声大约 76–90。最高音均值 74.106 → 77.106，长和弦最高音大约 61–68，短和弦最高音大约 80–93。最高音多出来的 3 个 MIDI 均值，由低音少掉的 3 个补上。内声均值不动，是因为长和弦 −12 和短和弦 +12 抵消。

响度用 `ffmpeg loudnorm` 的 `input_i`，没有做增益。差都在 0.5 LU 以内，所以没有整段 gain。

| 文件 | LUFS | 真峰值 dBTP | LRA |
| --- | ---: | ---: | ---: |
| A 混音 | −25.30 | −11.75 | 1.90 |
| B 混音 | −25.34 | −11.74 | 1.90 |
| A 钢琴 | −29.30 | −14.52 | 3.00 |
| B 钢琴 | −29.48 | −12.81 | 4.30 |

混音差 0.04 LU。钢琴分轨 B 低 0.18 LU：短和弦更响但更短，长和弦更轻，积分响度略降，LRA 从 3.0 升到 4.3。采样峰值：混音 8476 / 8484（满幅 32767），钢琴 6134 / 7480。开头 50 ms RMS 为 0，这是 T0 前的静音。钢琴在 0.08–0.20 s 的 RMS 也是 0，因为第一下应答在第 2 小节的第 3 拍，不是断音。最后 200 ms RMS：混音 8 / 8，钢琴 7 / 9，尾巴还在。两段都是 1283985 帧，29.115306 s。

测试 8 个文件、68 通过（本轮多 1 个）。`npm run build` 通过。首屏脚本 gzip 33.45 KB。没有升级版本号。

## 自检和听审

只有谱面和事件自检。没有听觉，不能说好听，也不能替 Timo 说有变好。Timo 的那句话只覆盖首轮相位。

仍是假设：把短和弦抬到大约高 4 dB、让最高音领着最低音，会补上「缺强弱」和这里仅有的高低声部关系。

仍未解决：真实的左右手事件；gain 里那一层声部平衡；「不 swing」；主题鼓和独奏钢琴电平；第 17 小节以后；这一版有没有真的更好。

## 产物

首轮目录 `/opt/cursor/artifacts/piano-phase-ab/` 未改。本轮在 `/opt/cursor/artifacts/piano-phase-round2/`。先 A 后 B 的文件中间是 1.000 秒静音。mp3 是 192 kbps CBR，时长读数 59.27 s，和首轮一样含编码器填充。

- `/opt/cursor/artifacts/piano-phase-round2/A/theme16-mix.wav` `331141b957e795dd54743b4c0fc7ed82`
- `/opt/cursor/artifacts/piano-phase-round2/A/theme16-mix.mp3` `7a47cea6781e3db6700a7b19422be69f`
- `/opt/cursor/artifacts/piano-phase-round2/A/theme16-piano.wav` `3d377ce9a8c3ab2375ff1730cc943e84`
- `/opt/cursor/artifacts/piano-phase-round2/A/theme16-piano.mp3` `0f1f2bcd2bf1460d135c11293de3354d`
- `/opt/cursor/artifacts/piano-phase-round2/A/theme16-events.json` `8477a338aeb3efd37ea78fac1df407b5`
- `/opt/cursor/artifacts/piano-phase-round2/B/theme16-mix.wav` `ddbd72e650d252d7da670454b9e768c7`
- `/opt/cursor/artifacts/piano-phase-round2/B/theme16-mix.mp3` `b9670b8675549707e512c82714e8198c`
- `/opt/cursor/artifacts/piano-phase-round2/B/theme16-piano.wav` `6f21dd8ad4d4662750f735eb81ef064e`
- `/opt/cursor/artifacts/piano-phase-round2/B/theme16-piano.mp3` `820202dab4c2e9e4ddac9b1d1333e390`
- `/opt/cursor/artifacts/piano-phase-round2/B/theme16-events.json` `260a8de33612688ccf3943f33d2bccd6`
- `/opt/cursor/artifacts/piano-phase-round2/AB-theme16-mix.wav` `512bcac04715f0dee36663866a5ba57a`
- `/opt/cursor/artifacts/piano-phase-round2/AB-theme16-mix.mp3` `be48c2a2c0376265f39533f742041707`
- `/opt/cursor/artifacts/piano-phase-round2/AB-theme16-piano.wav` `b5f0fd3599718ef0d69dc45db97c5d8a`
- `/opt/cursor/artifacts/piano-phase-round2/AB-theme16-piano.mp3` `94ca8ccbbbd35f0ac98f9a361a104598`
- `/opt/cursor/artifacts/piano-phase-round2/event-diff.json` `07224f05e76cb53f68231075726d23b4`

A 的 353 个事件与首轮 B 的 `theme16-events.json` 逐字段相同。WAV 的 md5 和首轮 B 不同，离线渲染的采样有微小差别，事件没有。

## 工时

请求起点 2026-11-23 16:47 UTC。渲染等待：A 12.4 s；一次未交付的 B 11.4 s；交付的 B 11.6 s。响度测量约 6 s，编码和拼接约 7 s。

听感返工 0。交付前有一次设计修正，没有出第二版：第一张偏移只把和弦能量差从 0.244 dB 做到大约 1.3 dB，仍贴着刚能分辨的边缘，所以换成现在这张（4.121 dB）再渲染交付的 B。那次未交付的音频已覆盖，没有留档。

token 费用在此环境不可见，记为未知。
