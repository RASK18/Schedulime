import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoBase = '/Schedulime/';
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version?: string;
};
const [major = '0', minor = '0', fallbackPatch = '0'] = (packageJson.version ?? '0.0.0').split('.');
const versionPrefix = `${major}.${minor}`;

const resolveCommitCount = (): string => {
  try {
    return execSync('git rev-list --count HEAD', {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return fallbackPatch;
  }
};

const appVersion = process.env.APP_VERSION?.trim() || `${versionPrefix}.${resolveCommitCount()}`;
const buildUpdatedAt = process.env.APP_UPDATED_AT?.trim() || new Date().toISOString();
const versionJson = `${JSON.stringify(
  {
    version: appVersion,
    updatedAt: buildUpdatedAt
  },
  null,
  2
)}\n`;

export default defineConfig({
  base: repoBase,
  plugins: [
    react(),
    {
      name: 'schedulime-version-json',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url || !req.url.endsWith('/version.json')) {
            next();
            return;
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(versionJson);
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: versionJson
        });
      }
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'schedulime-logo.png'],
      manifest: {
        name: 'Schedulime',
        short_name: 'Schedulime',
        description:
          'Calendario semanal offline de estrenos anime con recomendaciones basadas en AniList.',
        theme_color: '#de6a2d',
        background_color: '#fff6ea',
        display: 'standalone',
        start_url: repoBase,
        icons: [
          {
            src: `${repoBase}icon.svg`,
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
