
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/chuka-comrades/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Chuka Comrades',
        short_name: 'Chuka Comrades',
        description: 'Your campus. Your community. Connect, learn and grow with Chuka Comrades.',
        theme_color: '#155c39',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/chuka-comrades/',
        scope: '/chuka-comrades/',
        icons: [
          {
            src: 'chukalogo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'chukalogo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ]
})
