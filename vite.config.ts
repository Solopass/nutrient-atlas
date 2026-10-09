import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/** Short git commit of the build, with "+" when there were uncommitted changes. */
function commit() {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    return execSync('git status --porcelain').toString().trim() ? `${hash}+` : hash
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  define: {
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
  // Relative base so the build works from any host path (root domain, GitHub Pages subfolder, etc.).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Nutrient Atlas',
        short_name: 'Atlas',
        description: 'Micronutrient-first nutrition tracker: see what you are getting enough of, and what to eat next.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#080b11',
        theme_color: '#080b11',
        categories: ['health', 'food', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell and the USDA food table (2.6 MB) so search works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
