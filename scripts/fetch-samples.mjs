/**
 * Re-download the FluidR3 subset into public/samples and rewrite bank.json.
 * Drum one-shots: surikov/webaudiofontdata extracts of FluidR3 GM (MIT).
 * Pitched notes: gleitz/midi-js-soundfonts FluidR3_GM mp3 renders (CC BY 3.0).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('public/samples')
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const midiName = (midi) => NAMES[midi % 12] + String(Math.floor(midi / 12) - 1)

const drums = {
  kick: 36,
  snare: 38,
  snareAlt: 40,
  sidestick: 37,
  hatClosed: 42,
  hatPedal: 44,
  hatOpen: 46,
  ride: 51,
  rideAlt: 59,
  rideBell: 53,
  crash: 49,
  crashAlt: 57,
  tomL: 41,
  tomM: 47,
  tomH: 50,
}

async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

await mkdir(path.join(root, 'drums'), { recursive: true })
await mkdir(path.join(root, 'bass'), { recursive: true })
await mkdir(path.join(root, 'piano'), { recursive: true })
await mkdir(path.join(root, 'guitar'), { recursive: true })

for (const [name, midi] of Object.entries(drums)) {
  const js = (await get(`https://surikov.github.io/webaudiofontdata/sound/128${midi}_0_FluidR3_GM_sf2_file.js`)).toString('utf8')
  const match = js.match(/file:'([^']+)'/)
  if (!match) throw new Error(`no audio for ${name}`)
  await writeFile(path.join(root, 'drums', `${name}.mp3`), Buffer.from(match[1], 'base64'))
  console.log('drum', name)
}

const pitched = []
for (const midi of [...Array.from({ length: 14 }, (_, i) => 28 + i * 2), 55]) pitched.push(['bass', midi, 'acoustic_bass-mp3'])
for (let midi = 48; midi <= 80; midi += 2) pitched.push(['piano', midi, 'acoustic_grand_piano-mp3'])
for (const midi of [55, 58, 61, 64, 67, 70, 73]) pitched.push(['guitar', midi, 'electric_guitar_muted-mp3'])

for (const [folder, midi, remote] of pitched) {
  const body = await get(`https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${remote}/${midiName(midi)}.mp3`)
  await writeFile(path.join(root, folder, `${midi}.mp3`), body)
  console.log(folder, midiName(midi))
}

const manifest = {
  id: 'fluidr3-subset',
  name: 'FluidR3 GM subset',
  version: 1,
  drums: {
    kick: ['drums/kick.mp3'],
    snare: ['drums/snare.mp3', 'drums/snareAlt.mp3'],
    sidestick: ['drums/sidestick.mp3'],
    hatClosed: ['drums/hatClosed.mp3'],
    hatPedal: ['drums/hatPedal.mp3'],
    hatOpen: ['drums/hatOpen.mp3'],
    ride: ['drums/ride.mp3', 'drums/rideAlt.mp3'],
    rideBell: ['drums/rideBell.mp3'],
    crash: ['drums/crash.mp3', 'drums/crashAlt.mp3'],
    tomL: ['drums/tomL.mp3'],
    tomM: ['drums/tomM.mp3'],
    tomH: ['drums/tomH.mp3'],
  },
  pitched: {
    bass: pitched.filter((item) => item[0] === 'bass').map((item) => ({ midi: item[1], file: `bass/${item[1]}.mp3` })),
    piano: pitched.filter((item) => item[0] === 'piano').map((item) => ({ midi: item[1], file: `piano/${item[1]}.mp3` })),
    guitar: pitched.filter((item) => item[0] === 'guitar').map((item) => ({ midi: item[1], file: `guitar/${item[1]}.mp3` })),
  },
}
await writeFile(path.join(root, 'bank.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('wrote bank.json')
