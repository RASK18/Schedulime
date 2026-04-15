import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const appVersion = '0.1.0';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'version.json'],
      manifest: {
        name: 'Schedulime',
        short_name: 'Schedulime',
        description:
          'Calendario semanal offline de estrenos anime con recomendaciones basadas en AniList.',
        theme_color: '#de6a2d',
        background_color: '#fff6ea',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/version.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'version-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === 's4.anilist.co' || url.hostname === 'anilist.co',
            handler: 'CacheFirst',
            options: {
              cacheName: 'anilist-images',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  test: {
    environment: 'node'
  }
});
