import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA: installable app + offline support.
 *  - The app shell (HTML/JS/CSS/icons) is precached.
 *  - MediaPipe's wasm and the hand model (~18 MB) are cached on first use only
 *    (CacheFirst), so the phone camera page never downloads them, while the
 *    Surface keeps working offline after Air Mode has run once.
 */
export function pwaPlugin() {
  return VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'script-defer',
    includeAssets: ['icons/neo-type.svg'],
    manifest: {
      name: 'NEO TYPE',
      short_name: 'NEO TYPE',
      description: 'Dual-input laser-holographic virtual keyboard: touch and air typing.',
      start_url: './#/workspace',
      scope: './',
      display: 'fullscreen',
      display_override: ['fullscreen', 'standalone'],
      orientation: 'any',
      background_color: '#080A12',
      theme_color: '#080A12',
      categories: ['productivity', 'utilities'],
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: 'icons/neo-type.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      globIgnores: ['mediapipe/**', 'models/**', '**/*.map'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'neo-type-vision',
            expiration: { maxEntries: 12 },
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
    devOptions: { enabled: false },
  });
}
