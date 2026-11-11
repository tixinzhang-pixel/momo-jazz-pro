import type { RoleId, Turn } from './types.ts'

export function turnAt(playBar: number, len: 4 | 8, userStarts: boolean, role: RoleId): Turn {
  const idx = Math.floor(playBar / len)
  const user = userStarts ? idx % 2 === 0 : idx % 2 === 1
  const partner = role === 'drums' ? 'piano' : 'drums'
  const barInTurn = playBar % len
  return {
    user,
    partner,
    partnerLabel: partner === 'piano' ? '钢琴在奏' : '鼓手在奏',
    barInTurn,
    len,
    prep: !user && barInTurn === len - 1,
    handoff: user && barInTurn === len - 1,
  }
}

/** 12-bar blues with fours swaps the downbeat owner every chorus. */
export function chorusSwapsHands(formLength: number, len: 4 | 8): boolean {
  return Math.floor(formLength / len) % 2 === 1
}
