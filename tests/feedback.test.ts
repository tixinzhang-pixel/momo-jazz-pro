import { describe, expect, it } from 'vitest'
import { buildFeedback, deviceSummary } from '../src/feedback.ts'
import { APP_VERSION } from '../src/version.ts'

describe('feedback', () => {
  it('attaches the practice context in a pasteable note', () => {
    const text = buildFeedback({
      kind: 'sound',
      note: 'ride 有点抢',
      tune: '爵士布鲁斯 · F',
      soundingKey: 'F',
      transpose: 0,
      chartLabel: '降 B 谱（G）',
      bpm: 132,
      style: 'Swing',
      role: '降 B',
      mode: '对四 · 第 5 小节 · 轮到你',
      device: 'iOS · 微信',
      when: '2026-11-11 19:02',
    })
    expect(text).toContain(`v${APP_VERSION}`)
    expect(text).toContain('类型：听感')
    expect(text).toContain('ride 有点抢')
    expect(text).toContain('曲目：爵士布鲁斯 · F')
    expect(text).toContain('调：F（原调）')
    expect(text).toContain('速度：132')
    expect(text).toContain('对四')
    expect(text).toContain('iOS · 微信')
  })

  it('recognises WeChat and iOS from the user agent', () => {
    expect(deviceSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) MicroMessenger/8.0')).toBe('iOS · 微信')
  })
})
