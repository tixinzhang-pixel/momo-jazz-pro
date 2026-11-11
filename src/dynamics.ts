export type DynamicsMode = 'auto' | 'low' | 'med' | 'high'

export type ChorusRole = 'head' | 'build' | 'shout' | 'out'

export interface ShapeInput {
  mode: DynamicsMode
  chorus: number
  barIndex: number
  form: number
  /** null means keep going. A number is how many times the region is played. */
  repeats: number | null
  section: string
  userTurn: boolean
  handoff: boolean
  bandTurn: boolean
  barInTurn: number
}

export interface MusicalShape {
  /** Multiply written velocities by this. */
  level: number
  /** Below ~0.7, ghost notes and extra piano attacks drop out. */
  density: number
  role: ChorusRole | 'fixed'
}

export function chorusRole(chorus: number, repeats: number | null): ChorusRole {
  if (repeats != null && repeats <= 1) return 'head'
  if (chorus <= 0) return 'head'
  if (repeats == null) return chorus >= 3 ? 'shout' : 'build'
  if (repeats === 2) return 'build'
  if (chorus >= repeats - 1) return 'out'
  if (chorus === repeats - 2) return 'shout'
  return 'build'
}

/** True once `completed` full passes of the loop (or the form) have been played. */
export function passCompleted(completed: number, repeats: number | null): boolean {
  return repeats != null && completed >= repeats
}

/** Step the 1–30 counter. From ∞, either button lands on 4. 一直 is a separate toggle. */
export function stepRepeats(current: number | null, dir: -1 | 1): number | null {
  if (current == null) return 4
  const next = current + dir
  if (next > 30) return 30
  if (next < 1) return 1
  return next
}

export function musicalShape(input: ShapeInput): MusicalShape {
  const role = input.mode === 'auto' ? chorusRole(input.chorus, input.repeats) : 'fixed'
  let level = fixedLevel(input.mode)
  let density = fixedDensity(input.mode)
  if (input.mode === 'auto') {
    level = autoLevel(input, role as ChorusRole)
    density = autoDensity(input, role as ChorusRole)
  }

  const phrase = phraseFactor(input.barIndex)
  const phraseWeight = input.mode === 'auto' ? 1 : 0.4
  level *= 1 + (phrase - 1) * phraseWeight

  if (input.section === 'B' || input.section === 'C') {
    level *= 1.04
    density = Math.min(1, density + 0.05)
  }

  if (input.userTurn) {
    level *= input.handoff ? 0.84 : 0.56
    density *= input.handoff ? 0.72 : 0.38
  } else if (input.bandTurn) {
    const step = Math.min(Math.max(input.barInTurn, 0), 7)
    level *= 0.86 + step * 0.045
    density = Math.min(1, density * (0.8 + step * 0.04))
  }

  return {
    level: clamp(level, 0.32, 1.22),
    density: clamp(density, 0.22, 1),
    role,
  }
}

function fixedLevel(mode: DynamicsMode): number {
  if (mode === 'low') return 0.62
  if (mode === 'high') return 1.05
  if (mode === 'med') return 0.84
  return 0.84
}

function fixedDensity(mode: DynamicsMode): number {
  if (mode === 'low') return 0.42
  if (mode === 'high') return 1
  if (mode === 'med') return 0.78
  return 0.78
}

function autoLevel(input: ShapeInput, role: ChorusRole): number {
  if (role === 'head') return 0.64
  if (role === 'shout') return 1.12
  if (role === 'out') {
    const span = Math.max(1, input.form - 1)
    const pos = input.barIndex / span
    return pos < 0.45 ? 1.02 : 0.66
  }
  return 0.9 + Math.min(input.chorus, 3) * 0.08
}

function autoDensity(input: ShapeInput, role: ChorusRole): number {
  if (role === 'head') return 0.58
  if (role === 'shout') return 0.96
  if (role === 'out') {
    const span = Math.max(1, input.form - 1)
    return input.barIndex / span < 0.45 ? 0.84 : 0.5
  }
  return 0.7 + Math.min(input.chorus, 3) * 0.06
}

/** Relax at the top of a phrase, lean into the end of each 4 and the end of each 8. */
export function phraseFactor(barIndex: number): number {
  const in8 = ((barIndex % 8) + 8) % 8
  const in4 = in8 % 4
  if (in8 === 0) return 0.9
  if (in8 === 7) return 1.12
  if (in4 === 3) return 1.08
  if (in4 === 0) return 0.94
  return 1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
