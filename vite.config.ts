import { alphaTab } from '@coderline/alphatab-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:3000',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // Recopie la police musicale (Bravura) et la banque de sons dans public/, et branche
    // les workers/worklets d'alphaTab sur le mécanisme de Vite. Sans ce plugin, la partition
    // s'affiche en carrés vides et le son ne démarre jamais.
    alphaTab(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // La banque de sons pèse à elle seule plus que le seuil par défaut de Workbox (2 Mo),
        // et c'est précisément le fichier sans lequel l'application ne sait plus rien jouer.
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
        // Les vidéos produites et les fichiers sources transitent par /api : hors ligne, on
        // préfère un échec franc à une réponse tirée d'un cache qui ne sait rien d'eux.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Videotab',
        short_name: 'Videotab',
        description: 'Une tablature, une vidéo avec curseur',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android redécoupe l'icône selon la forme du lanceur : le motif tient dans la
          // zone de sécurité (80 % central) et le fond couvre tout le carré.
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
