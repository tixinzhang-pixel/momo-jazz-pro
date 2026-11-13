# 采样与声音来源

Momo Jazz Pro 第一轮内测只用可以再分发的声音。没有 Logic Pro / GarageBand 采样，也不要把那些采样加回来。

采样银行是一个文件夹加一份清单：`public/samples/bank.json`。换 Momo 自己录的采样时，按同样的键名替换文件即可，播放代码不用改。鼓件可以写成数组，用来做 round-robin。

## FluidR3 GM

- 作者：Frank Wen，2000–2002、2008；Debian 打包补充 Toby Smithe，2008
- 许可：MIT
- 来源音源：Fluid Release 3 General MIDI SoundFont
- 本仓库用到的预设：
  - 标准鼓组（GM percussion，bank 128 program 0）里的底鼓、军鼓、边击、踩镲、吊镲、叮叮镲、通通鼓
  - Acoustic Bass（program 32）
  - Acoustic Grand Piano（program 0）
  - Electric Guitar (muted)（program 28），用来做四拍一声的节奏吉他

MIT 许可全文：

```
Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>
Copyright (c) 2008 Toby Smithe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

Frank Wen 在音源说明里还写过几条愿望：音源可以免费用于个人或商业音乐；如果把 Fluid 跟软件捆在一起，不要把它锁死，要允许使用者换成别的音源。本应用把采样放在可替换的 `bank.json` 里，就是为了符合这层意思。内测版免费，没有把音色做成付费锁。

鼓的单音文件取自 WebAudioFont 对 FluidR3 GM 的提取：

- https://github.com/surikov/webaudiofont
- https://surikov.github.io/webaudiofontdata/sound/

钢琴、贝斯、闷音吉他的 MP3 取自 midi-js-soundfonts 对同一音源的渲染：

- 仓库：https://github.com/gleitz/midi-js-soundfonts
- 该仓库把 Fluid 这一套标为 Creative Commons Attribution 3.0（CC BY 3.0）
- 署名：FluidR3 GM by Frank Wen；MP3 renders from midi-js-soundfonts by gleitz

重新下载可以运行 `node scripts/fetch-samples.mjs`。

## Virtuosity Drums（CC0 1.0）

- 来源：Virtuosity Drums（Versilian Studios / Karoryfer，CC0 1.0 Public Domain）
- 脚踏踩镲：`public/samples/drums/hatPedal_R2A_pedal1_mid_r1.mp3` 和 `r2.mp3`。取自 `hh_pedal_vl1`，`snaremic` 与 `mid` 对齐后混合，高通、低通和柔起音，没有 2 kHz 峰值提升。R2B / R2C 没有收进这个版本。
- 军鼓边击：`public/samples/drums/sidestick_r1.mp3` 和 `r2.mp3`。响弦关掉的 cross-stick（vl4 / vl5）做两个 round-robin，近麦、overhead 和 room 混在一起，压暗、缩短，响度对齐原来的 FluidR3 边击。
- 许可：CC0 1.0（可自由商用与再分发，无传染性）

## 不是采样的声音

这些是本仓库自己写的合成，没有外部采样：

- 抒情歌的刷子刷奏和刷点（滤波噪声）
- 贝斯每一拍很轻的指板噪声
- 预备拍和节拍器的击打
- 混响用的房间脉冲（程序生成的短房间，不是采样 IR）

## 曲谱

大多数曲子仍然只有和弦进行，没有歌词。和弦进行本身不受版权保护。标准曲的曲名用来标明是哪一套常用进行，方便教务复核。原创练习《夜窗》《河边》不是现成名曲。

《So What》（Miles Davis，1959）是例外。从 v0.3.2 起，主题遍会演奏贝斯 Call 和钢琴应答（D 多利亚，桥段升半音）。这是受版权保护的旋律，不只是和弦。采样银行里没有小号或萨克斯，应答只在现有的 FluidR3 钢琴上，没有新的音频文件。曲作者和版权方没有把这段旋律授权进公开仓库。内测期间仓库保持公开，是负责人明确决定的：先让会员能对到原版主题，许可问题在公开正式版之前再处理。不要把这段旋律当成可以随意再发布的公有领域材料。
