import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Project site: https://tixinzhang-pixel.github.io/momo-jazz-pro/
  base: '/momo-jazz-pro/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Momo Jazz Pro',
        short_name: 'Momo Jazz',
        description: 'Momo 家庭音乐工作室 · 爵士伴奏与对四练习',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'any',
        background_color: '#14110e',
        theme_color: '#14110e',
        start_url: '/momo-jazz-pro/',
        scope: '/momo-jazz-pro/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,webmanifest}'],
        navigateFallback: '/momo-jazz-pro/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/samples\/.*\.(mp3|json)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'momo-samples-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: '127.0.0.1', port: 4731, strictPort: true },
  preview: { host: '127.0.0.1', port: 4731, strictPort: true },
})
