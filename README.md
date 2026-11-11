# Momo Jazz Pro

Momo 家庭音乐工作室的爵士伴奏和对四练习。手机打开就能用：选乐器、选曲子、按播放。鼓、贝斯、钢琴一起走，可以对四、对八，谱面可以按降 B、降 E、F 显示。

这是会员内测的第二刀（v0.2.0-beta.1）。没有账号，没有服务器。反馈复制一段文字，贴到微信内测群。播放条上可以选遍数（1–30，或一直），鼓组里 Ride、踩镲、军鼓、底鼓、刷子可以分开调，力度可以跟曲式走，也可以锁在轻、中、强。

## 本地跑

需要 Node.js 20 或更新。

```bash
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:4731 。手机和电脑同一个网络时，用终端里 Vite 打印的地址。

第一次点播放会下载采样（大约 1.3MB），之后由浏览器缓存。iPhone 要在第一次点按里解锁声音，静音键也可能把网页声音关掉。

```bash
npm test          # 和弦、律动、对四、反馈文案
npm run build     # 类型检查，并产出 dist/
npm run preview   # 预览 dist，同样是 4731 端口
```

## 部署到 GitHub Pages

线上地址是 [https://tixinzhang-pixel.github.io/momo-jazz-pro/](https://tixinzhang-pixel.github.io/momo-jazz-pro/)。`vite.config.ts` 的 `base` 是 `/momo-jazz-pro/`，采样、清单、图标和 Service Worker 的 scope 都挂在这个路径下。

推到 `main` 会跑 `.github/workflows/pages.yml`：`npm ci`、`npm run build`，再用 `actions/deploy-pages` 发布 `dist/`。仓库的 Pages 来源要设成 GitHub Actions。

本地看和线上一样的路径：

```bash
npm run build
npm run preview
```

打开 http://127.0.0.1:4731/momo-jazz-pro/ 。开发服务器 `npm run dev` 也在这个路径下。

装到主屏幕：Safari 或 Chrome 里「分享 / 添加到主屏幕」。加过一次并且播放过，Service Worker 会把页面和采样留下，之后可以离线开。微信里能播放，但不能添加到主屏幕，页面上有一句说明。

## 换采样

`public/samples/bank.json` 是采样清单。鼓的每一件可以是一个文件，也可以是一组文件（轮流播放）。钢琴、贝斯、吉他按 MIDI 音高列。替换文件、改清单、重新构建即可。来源和许可证写在 `LICENSES/SAMPLES.md`。重新下载现在这套 FluidR3 子集：

```bash
node scripts/fetch-samples.mjs
```

## 改曲子

曲子在 `src/data/tunes.ts`。每首是一段和弦谱，小节用 `|` 分开，`[A]` 是段落，`%` 重复上一小节，一小节里两个和弦各占两拍。不均匀的小节写成 `F7@3 D7alt@1`。不要写旋律和歌词。

符号可以用 `Cmaj7`、`C^7`、`C-7`、`Cm7`、`Cø`、`Cdim7`、`C7alt`、`C7sus`、`F7/A`。谱面上会收成统一的写法（Δ、–、∅、°）。

课堂二维码可以带上曲子：`https://<地址>/?tune=jazz-blues-f`。

## 目录

- `src/theory.ts` 和弦、移调、谱面
- `src/arrange.ts` 鼓、walking、钢琴 voicing、对四
- `src/audio/` 前瞻调度、采样、混音和限幅
- `src/ui/` 曲库、播放、对四、反馈
- `tests/` 不依赖浏览器的演奏逻辑测试
