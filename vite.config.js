// Vite = the tool that builds our app into files a browser can run.
// The PWA plugin makes the app installable on a phone's home screen.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// A version label shown in Settings, e.g. "631fc5d · Sep 23, 2026".
// Vercel tells us which saved change (commit) it is building.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)
const built = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${commit} · ${built}`),
  },
  plugins: [
    react(),
    VitePWA({
      // Automatically update the installed app when we publish a new version.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Never answer our server addresses (/api/...) from the offline copy;
        // they must always reach Vercel (e.g. Google's return from sign-in).
        navigateFallbackDenylist: [/^\/api\//, /^\/privacy/],
      },
      // The "manifest" tells the phone the app's name, icon and colors.
      manifest: {
        name: 'Home Inventory',
        short_name: 'Inventory',
        description: 'Photograph and document everything in your home for insurance.',
        start_url: '/',
        display: 'standalone', // opens full-screen, like a normal app
        background_color: '#ffffff',
        theme_color: '#1f4e79',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
