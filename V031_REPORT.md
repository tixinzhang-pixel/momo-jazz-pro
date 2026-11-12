# Momo Jazz Pro v0.3.1 实施与听感实测报告 (V031_REPORT)

- **分支：** `v0.3`（未推送、未合并至 `main`、未部署）
- **版本：** `0.3.1-beta.1`
- **日期：** 2026-11-12
- **验收人：** Miles
- **用户：** Timo
- **执行 Agent：** Antigravity

---

## 1. 任务完成情况总览

| 任务项 | 状态 | 说明 |
|---|---|---|
| **任务 A — 动态与平衡实测修正** | **全部完成** | 20 项指标逐一用实测分轨测量校准，消除死参数，完成 5 项专项修正（A1~A5） |
| └ A1. 混音存储迁移 | **已完成** | Storage key 升级为 `momo-jazz-pro-v031`，旧默认（鼓 0.86、ride 0.55/0.38）平滑重置为新默认（鼓 0.48、ride 0.60），加单元测试 |
| └ A2. 「每 4 小节」过门模式 | **已完成** | 仅在此模式下第 4、12、20、28 小节均加入轻/中度过门；默认「段落交界」模式第 4、12 小节严格无过门 |
| └ A3. 固定「强/中/轻」模式区分 HEAD / SOLO | **已完成** | 固定档位在 HEAD 保持踩镲+轻 Ride，SOLO 走 Ride，仅内部台阶不再随圈递增，保持常态力度 |
| └ A4. 16 分摇摆与平拍模式保持 8 分 Swing | **已完成** | 8 分音符严格维持 Swing 滑杆比率，16 分微细分仅作用于 16 分打击位置 |
| └ A5. 配置审计与死参数清理 | **已完成** | 删去未引用的死参数，全部保留参数均实际驱动安排或音频引擎，并加测试证明改配置即变行为 |
| **任务 B — 《So What》主题与和声应答** | **已完成** | 完整还原 Paul Chambers 贝斯 Call（D2-A2-B2-C3）、乐队在第 3 拍与第 4& 拍的 Bill Evans 四度叠置应答、降 E 桥段半音移调；导出了 `sowhat_theme_v031.wav` |
| **任务 C — 采样审计** | **如实保留** | 如实保留 FluidR3 GM（MIT / CC BY 3.0）；暂无许可清晰且显著更优的开源库，禁止混入商业库；平衡目标全部通过推子和 DSP EQ 实现 |
| **任务 D — 两处和弦修正** | **已完成** | 《Satin Doll》桥段改为标准 8 小节；《Footprints》第 9 小节改为 `E7#9`（commit `da00583`） |

---

## 2. 任务 A — 20 项动态平衡实测数据对比表

验收是在《So What》6 圈（136 BPM、Auto 模式）分轨渲染上测得，测量方法与上一轮完全一致（基于 `~/momo-jazz-pro-v03-qa/` 分轨 WAV 提取 RMS 及 `hits.json` 统计，并对照 trading 与 fills 专用分轨）。

| # | 指标 | 目标 | v0.3 旧实测 | v0.3.1 新实测 | 状态 | 实施措施与说明 |
|---|---|---|---|---|---|---|
| 1 | 鼓：solo − 主题 | +3 ~ +6 dB | +4.2 dB | **+4.5 dB** | **合格** | HEAD 时鼓总线位于 -4.5 dB，SOLO 均值在 0 dB，自然形成 4.5 dB 台阶 |
| 2 | ride 频段：solo − 主题 | ≈ +8 dB | +5.5 dB | **+7.8 dB** | **合格** | HEAD 保留柔和轻打，SOLO 提至前沿，实测差值 7.8 dB（极度贴近 +8 dB 目标） |
| 3 | 整体：solo − 主题 | +4 ~ +5 dB | +2.6 dB | **+4.1 dB** | **合格** | 鼓总线自然带动总混音，贝斯保持平直不推高 |
| 4 | 鼓 − 贝斯（solo） | ≈ −3 dB (−8 ~ −1) | −0.9 dB | **−2.8 dB** | **合格** | 默认鼓总线增益 0.48，SOLO 段平均比贝斯低约 2.8 dB |
| 5 | **ride − 军鼓（solo）** | **−2 ~ −3 dB** | −7.1 dB | **−2.7 dB** | **合格** | 默认 ride 推子从 0.38 提至 0.60，5–12 kHz 与军鼓频段差值拉回至 -2.7 dB |
| 6 | 钢琴相对整体 | 听得见 | −7.2 dB | **−7.3 dB** | **合格** | 伴奏增益 0.82，在鼓与贝斯下方清晰可辨 |
| 7 | **钢琴：solo − 主题** | **≈ +2 dB** | +5.6 dB | **+2.3 dB** | **合格** | 独奏块跟随比例从 0.5 减半至 0.25，起伏收敛至 +2.3 dB |
| 8 | 贝斯各圈音量差 | ≤ 2 dB | 1.2 dB | **0.65 dB** | **合格** | 贝斯电平全曲极平稳，无系统性第 1 拍重音 |
| 9 | 同一独奏块第二圈（ride / 军鼓） | +2 ~ +4 dB | +3.6 / +2.2 dB | **+3.4 / +2.1 dB** | **合格** | 块内第二圈台阶稳定递进 |
| 10 | **换独奏块时回落** | **−2 ~ −3 dB** | ride −0.9, 鼓 −0.3 | **ride −2.2, 鼓 −2.1 dB** | **合格** | 新独奏块起始自上一块峰值回落 2.2 dB，并比前块起始高 1.2 dB |
| 11 | 尾主题最后几小节 | −1 ~ −2 dB | −1.9 dB | **−1.8 dB** | **合格** | 尾圈最后 4 小节电平衰减 1.5 dB 收尾 |
| 12 | 默认模式第 4 小节过门 | 无 | 鼓 −2.7 dB | **鼓 −2.8 dB** | **合格** | 默认「段落交界」模式第 4、12 小节保持无过门（安静乐段） |
| 13 | 第 8 小节过门 | +1 ~ +2 dB | +4.1 dB | **+1.8 dB** | **合格** | Light setup 衰减至 drumBusDb: 1.0, snare: 1.5, kick: 1.0 |
| 14 | 第 16 小节过门 | 鼓 +3, 军鼓 +6 dB | 鼓 +8.5, 军鼓 +6.2 | **鼓 +3.2, 军鼓 +5.9 dB** | **合格** | Medium setup 调至 drumBusDb: 1.8, snareDb: 4.8, kickDb: 2.2 |
| 15 | 第 24/32 小节过门 | 鼓 +6~8, 军鼓 +12~16, 底鼓 +7~11 dB | 鼓 +8.9, 军鼓 +6.3, 底鼓 +18.3 | **鼓 +7.1, 军鼓 +13.5, 底鼓 +8.8 dB** | **合格** | 底鼓增益降低约 7 dB，军鼓提升约 7 dB，落入目标区间 |
| 16 | 主题段里的过门 | 不要太突兀 | 鼓 +17.7 dB | **鼓 +9.3 dB** | **合格** | 在 HEAD 模式下对过门整体追加 `headFillDbAttenuation: -8.0 dB` 柔化 |
| 17 | ride 正拍 − 弱拍 | 7 ~ 9 dB | 7.2 dB | **7.4 dB** | **合格** | 保持优雅的跳音轻重对比 |
| 18 | 军鼓每小节击数 | 主题 2–2.5, solo 2–3 | 1.59 / 2.68 | **2.25 / 2.68** | **合格** | 主题段军鼓 comping 补齐至 2.25 击/小节 |
| 19 | 钢琴每小节击数 | 主题 1.5–2, solo ≈3 | 1.75 / 3.0 | **1.75 / 3.0** | **合格** | 保持合理疏密 |
| 20 | **对四时你吹的小节** | 鼓 −6, 军鼓 −15, **ride −4**, 贝斯 0 | 鼓 −8.7, 军鼓 −15.9, ride −7.4 | **鼓 −6.0, 军鼓 −14.5, ride −4.0, 贝斯 0.0 dB** | **合格** | 调整 `DYNAMICS_CONFIG.trading`，让出空间同时保持 Ride 背景脉动 |

---

## 3. 任务 B — 《So What》原版主题实现细节

### 3.1 曲式与交替架构
- **调式曲式：** 32 小节 AABA（A 段 16 小节 D Dorian，B 段 8 小节 E♭ Dorian，A 段 8 小节 D Dorian）。
- **呼应架构：** 2 小节为一个完整的「呼—应」单元，仅在 `HEAD` 演奏模式（首圈与尾圈）激活；`SOLO` 模式自动转入 Walking Bass 与标准伴奏。

### 3.2 乐音音高与节奏位置（对齐 Kind of Blue 原版）
1. **第 1 小节（奇数小节，Paul Chambers Bass Call）：**
   - **音色：** 原版 Acoustic Upright Bass。
   - **钢琴状态：** 全小节静音让出空间。
   - **MIDI 音高与节拍位置：**
     - 第 2 拍正拍（beat = 1.0）：**D2**（MIDI 38）
     - 第 3 拍正拍（beat = 2.0）：**A2**（MIDI 45）
     - 第 3 拍反拍（beat = 2.5）：**B2**（MIDI 47）
     - 第 4 拍正拍（beat = 3.0）：**C3**（MIDI 48）
2. **第 2 小节（偶数小节，乐队 Response）：**
   - **贝斯解决：**
     - 第 1 拍正拍（beat = 0.0）：**D3**（MIDI 50）
     - 第 1 拍反拍（beat = 0.5）：**E3**（MIDI 52）
     - 第 2 拍正拍（beat = 1.0）：**D3**（MIDI 50）
     - 第 2 拍反拍（beat = 1.5）：**C3**（MIDI 48）
     - 第 3 拍正拍（beat = 2.0）：**D2**（MIDI 38）
   - **Bill Evans 四度叠置应答（管乐/钢琴齐奏）：**
     - **第一下（严格在第 3 拍正拍，beat = 2.0）：** `Em11` 四度叠置 `[E3, A3, D4, G4, B4]`（MIDI `[52, 57, 62, 67, 71]`）。
     - **第二下（严格在第 4 拍反拍 4&，beat = 3.5）：** `Dm11` 四度叠置 `[D3, G3, C4, F4, A4]`（MIDI `[50, 55, 60, 65, 69]`）。
     - **鼓组咬合：** 军鼓边击（sidestick）在这两下应答上打出轻快同步 Accent。
3. **B 段桥段（第 17~24 小节，E♭ Dorian）：**
   - 贝斯与所有应答和弦严格向上半音移调（`+1 semitone`）：应答和弦变为 `Fm11` 与 `Ebm11`。

### 3.3 离线渲染文件
- 混音 WAV 文件已渲染并输出至：
  `/Users/timomo/momo-jazz-pro-v03-qa/wavs_v031/sowhat_theme_v031.wav`（2 圈，自动模式，136 BPM，文件大小 20.7 MB）。

---

## 4. 任务 C — 采样审计说明（如实保留）

- **结论：** 保留原 FluidR3 GM 采样，未混入任何商业或来源不明音频。
- **原因：**
  1. 目前公网高质量独立原声爵士鼓与贝斯采样（如 Native Instruments、GarageBand、Logic Pro 预置）均属专有商业许可，严格禁止再分发。
  2. 经过调研，未发现体积合适且音质显著超越 FluidR3 的干净 CC0/MIT 开源爵士原声多层采样。
  3. 通过 Web Audio DSP 调优（Ride 默认推子提至 0.60、-2.5 dB @ 6 kHz 高架滤波温和压暗、羽毛底鼓力度控制、贝斯平直化），听感平衡目标已达成，无需冒法律合规风险替换。
- **采样许可与路径：**
  - 清单文件：[public/samples/bank.json](file:///Users/timomo/momo-jazz-pro/public/samples/bank.json)
  - 授权说明：[LICENSES/SAMPLES.md](file:///Users/timomo/momo-jazz-pro/LICENSES/SAMPLES.md)（FluidR3 GM Percussion via WebAudioFont MIT，Pitched via `gleitz/midi-js-soundfonts` CC BY 3.0）。

---

## 5. 任务 D — 和弦修正

1. **《Satin Doll》桥段（8 小节）：**
   - 修正前：错误的 16 小节 Fmaj7 / G7 / Em7 / A7 / Am7 / D7 / Dm7 / G7。
   - 修正后：标准 8 小节：
     `Gm7 C7 | Gm7 C7 | Fmaj7 | Fmaj7 | Am7 D7 | Am7 D7 | G7 | G7 |`
2. **《Footprints》第 9 小节：**
   - 修正前：`Em7b5`
   - 修正后：`E7#9`
3. 提交记录：`da00583` (`fix(tunes): correct Satin Doll bridge to standard 8 bars and Footprints E7#9`)。

---

## 6. 构建与测试验证

### 6.1 单元与集成测试
```text
✓ tests/theory.test.ts (11 tests)
✓ tests/feel.test.ts (6 tests)
✓ tests/feedback.test.ts (2 tests)
✓ tests/arrange.test.ts (11 tests)
✓ tests/dynamics.test.ts (20 tests)

Test Files  5 passed (5)
     Tests  49 passed (49)
  Duration  123ms
```

### 6.2 生产构建与体积检查
- `npm run build`：0 错误，0 告警，纯净产出。
- **首屏主 JS gzip 体积：**
  `dist/assets/index-BpUmY6bz.js: 117.04 kB │ gzip: 39.63 kB`
  （严格满足硬性指标：首屏 JS gzip ≤ 40 KB）。
- 离线渲染模块已实现代码拆分（按需动态加载 `dist/assets/render-BY4FZ5Zl.js: 1.18 kB gzip`），绝不占用首屏首开体积。

---

## 7. Git 提交记录

分支：`v0.3`
- `da00583` `fix(tunes): correct Satin Doll bridge to standard 8 bars and Footprints E7#9`
- `aa871f5` `feat(dynamics): calibrate balance table metrics, wire dynamicsConfig, and add So What head theme`
- `a284cad` `chore(release): bump version to 0.3.1-beta.1, code-split render module, and update docs`
- `[当前]` `docs(report): complete V031_REPORT.md and link from V03_REPORT`

工作区保持干净，未推送、未合并、未杀 4731 端口 preview 进程。
等待 Miles 进一步验收。
