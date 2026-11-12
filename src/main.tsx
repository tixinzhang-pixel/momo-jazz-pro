import { render } from 'preact'
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/fraunces/latin-600-italic.css'
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-600.css'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app.tsx'
import './styles.css'

registerSW({ immediate: true })

declare global {
  interface Window {
    __momo?: { renderBluesWav: () => Promise<{ base64: string; peak: number }> }
  }
}

window.__momo = {
  async renderBluesWav() {
    const { renderBluesWav } = await import('./audio/render.ts')
    const rendered = await renderBluesWav()
    const bytes = new Uint8Array(await rendered.blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return { base64: btoa(binary), peak: rendered.peak }
  },
}

const root = document.getElementById('app')
if (root) render(<App />, root)
