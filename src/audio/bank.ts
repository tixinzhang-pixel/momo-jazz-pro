export interface SampleManifest {
  id: string
  name: string
  version: number
  drums: Record<string, string[]>
  pitched: {
    bass: { midi: number; file: string }[]
    piano: { midi: number; file: string }[]
    guitar: { midi: number; file: string }[]
  }
}

export interface PitchedSample {
  midi: number
  buffer: AudioBuffer
}

export interface LoadedBank {
  id: string
  drums: Record<string, AudioBuffer[]>
  bass: PitchedSample[]
  piano: PitchedSample[]
  guitar: PitchedSample[]
}

const CORE_DRUMS = ['kick', 'snare', 'sidestick', 'hatClosed', 'hatPedal', 'hatOpen', 'ride', 'rideBell', 'tomL', 'tomM', 'tomH']

export async function loadBank(
  ctx: BaseAudioContext,
  onProgress: (ratio: number) => void,
): Promise<LoadedBank> {
  const base = import.meta.env.BASE_URL
  const manifest = (await (await fetch(`${base}samples/bank.json`)).json()) as SampleManifest
  const bank: LoadedBank = { id: manifest.id, drums: {}, bass: [], piano: [], guitar: [] }
  const jobs: { run: () => Promise<void>; core: boolean }[] = []

  for (const [name, files] of Object.entries(manifest.drums)) {
    bank.drums[name] = []
    files.forEach((file, index) => {
      jobs.push({
        core: CORE_DRUMS.includes(name),
        run: async () => {
          bank.drums[name][index] = await decode(ctx, `${base}samples/${file}`)
        },
      })
    })
  }
  for (const part of ['bass', 'piano', 'guitar'] as const) {
    for (const item of manifest.pitched[part]) {
      jobs.push({
        core: part !== 'guitar',
        run: async () => {
          const buffer = await decode(ctx, `${base}samples/${item.file}`)
          bank[part].push({ midi: item.midi, buffer })
        },
      })
    }
  }

  let done = 0
  const step = async (job: { run: () => Promise<void> }) => {
    await job.run()
    done += 1
    onProgress(done / jobs.length)
  }
  await Promise.all(jobs.filter((job) => job.core).map(step))
  onProgress(Math.max(done / jobs.length, 0.82))
  await Promise.all(jobs.filter((job) => !job.core).map(step))
  onProgress(1)
  for (const part of ['bass', 'piano', 'guitar'] as const) {
    bank[part].sort((a, b) => a.midi - b.midi)
  }
  return bank
}

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`采样没载入：${url}`)
  const data = await res.arrayBuffer()
  return ctx.decodeAudioData(data.slice(0))
}

export function nearestPitched(list: PitchedSample[], midi: number): PitchedSample | null {
  if (!list.length) return null
  let best = list[0]
  let dist = Math.abs(list[0].midi - midi)
  for (const item of list) {
    const d = Math.abs(item.midi - midi)
    if (d < dist) {
      dist = d
      best = item
    }
  }
  return best
}
