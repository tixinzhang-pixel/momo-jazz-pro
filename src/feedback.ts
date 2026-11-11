import { APP_VERSION } from './version.ts'

export type FeedbackKind = 'sound' | 'use' | 'bug' | 'wish'

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'sound', label: '听感' },
  { id: 'use', label: '好不好用' },
  { id: 'bug', label: '出错了' },
  { id: 'wish', label: '想要的功能' },
]

export interface FeedbackContext {
  kind: FeedbackKind
  note: string
  tune: string
  soundingKey: string
  transpose: number
  chartLabel: string
  bpm: number
  style: string
  role: string
  mode: string
  device: string
  when: string
}

export function buildFeedback(ctx: FeedbackContext): string {
  const kind = FEEDBACK_KINDS.find((k) => k.id === ctx.kind)?.label ?? ctx.kind
  const body = ctx.note.trim() || '（没写备注）'
  const shift = ctx.transpose === 0 ? '原调' : `移调 ${ctx.transpose > 0 ? '+' : ''}${ctx.transpose}`
  return [
    `【Momo Jazz Pro 反馈】v${APP_VERSION}`,
    `类型：${kind}`,
    `内容：${body}`,
    '',
    '—— 现场 ——',
    `曲目：${ctx.tune}`,
    `调：${ctx.soundingKey}（${shift}）`,
    `谱面：${ctx.chartLabel}`,
    `速度：${Math.round(ctx.bpm)}`,
    `风格：${ctx.style}`,
    `我的乐器：${ctx.role}`,
    `模式：${ctx.mode}`,
    `设备：${ctx.device}`,
    `时间：${ctx.when}`,
  ].join('\n')
}

export function deviceSummary(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  let os = '未知系统'
  if (/iPhone|iPad/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Linux/.test(ua)) os = 'Linux'
  let browser = '浏览器'
  if (/MicroMessenger/i.test(ua)) browser = '微信'
  else if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  return `${os} · ${browser}`
}

export function inWeChat(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /MicroMessenger/i.test(ua)
}
