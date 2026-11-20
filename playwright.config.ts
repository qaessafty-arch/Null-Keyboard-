import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = 4173;
const FAKE_CAMERA = fileURLToPath(new URL('./tests/e2e/fixtures/hands.mjpeg', import.meta.url));
const chromiumPath = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

// Surface Pro 7: 2736×1824 physical at 200 % scaling → 1368×912 CSS px.
const SURFACE = { width: 1368, height: 912 };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    viewport: SURFACE,
  },
  projects: [
    {
      name: 'ui',
      testIgnore: /air\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: SURFACE, launchOptions: { ...chromiumPath } },
    },
    {
      // Real pipeline with a fake camera: Chromium plays MediaPipe's hand test
      // image as the phone's camera (see tests/e2e/fixtures/README.md).
      name: 'camera',
      testMatch: /air\.spec\.ts/,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: SURFACE,
        permissions: ['camera'],
        launchOptions: {
          ...chromiumPath,
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${FAKE_CAMERA}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
