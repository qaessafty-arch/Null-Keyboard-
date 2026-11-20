import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Air Mode end-to-end with the real pipeline:
 *   phone page (fake camera = MediaPipe hand test image) → signaling → WebRTC
 *   → Surface page → MediaPipe in a Web Worker → calibration → AIR key events.
 * CPU inference keeps this deterministic on CI machines without a GPU.
 */

const SETTINGS = JSON.stringify({
  state: {
    general: { sound: false },
    performance: { inference: 'cpu', autoQuality: false, quality: 'balanced' },
  },
  version: 1,
});

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openHost(context: BrowserContext): Promise<Page> {
  const host = await context.newPage();
  await host.goto('/#/');
  await host.evaluate((s) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('neo-type:settings', s);
    indexedDB.deleteDatabase('neo-type');
  }, SETTINGS);
  await host.reload();
  return host;
}

async function pair(host: Page, context: BrowserContext): Promise<Page> {
  await host.goto('/#/connect');
  await host.getByTestId('start-pairing').click();
  await expect(host.getByTestId('pairing-code')).toHaveText(/^[A-Z0-9]{3} [A-Z0-9]{3}$/);
  const code = (await host.getByTestId('pairing-code').textContent())!.replace(' ', '');
  const phone = await context.newPage();
  await phone.goto(`/#/camera?code=${code}`);
  await phone.getByTestId('phone-start').click();
  await expect(host.getByTestId('connect-state')).toHaveText('Phone connected', { timeout: 20_000 });
  await expect(phone.getByTestId('phone-state')).toHaveAttribute('data-state', 'streaming');
  return phone;
}

test('phone pairs over WebRTC and streams HD video with real stats', async ({ context }) => {
  const host = await openHost(context);
  const errors = trackErrors(host);
  const phone = await pair(host, context);
  await expect(host.getByTestId('camera-live')).toBeVisible();
  // Guided steps 1–4 complete from real link state.
  await expect(host.locator('.guide__step.is-done')).toHaveCount(4, { timeout: 10_000 });
  await expect(host.getByTestId('link-fps')).not.toHaveText('—', { timeout: 10_000 });
  const size = await host.getByTestId('camera-video').evaluate((v: HTMLVideoElement) => `${v.videoWidth}x${v.videoHeight}`);
  expect(size).toBe('1280x720');
  expect(errors).toEqual([]);
  await phone.close();
});

test('wrong pairing code is rejected on the phone', async ({ context }) => {
  const host = await openHost(context);
  await host.goto('/#/connect');
  await host.getByTestId('start-pairing').click();
  await expect(host.getByTestId('pairing-code')).toHaveText(/^[A-Z0-9]{3} [A-Z0-9]{3}$/);
  const phone = await context.newPage();
  await phone.goto('/#/camera?code=ZZZZZZ');
  await phone.getByTestId('phone-start').click();
  await expect(phone.getByTestId('phone-state')).toHaveAttribute('data-state', 'error');
  // The camera is not left running after a failed pairing.
  await expect(phone.locator('.camview__empty')).toBeVisible();
});

test('reconnects after the phone reloads and after the Surface reloads', async ({ context }) => {
  const host = await openHost(context);
  const phone = await pair(host, context);

  await phone.reload();
  await phone.getByTestId('phone-start').click();
  await expect(host.getByTestId('connect-state')).toHaveText('Phone connected', { timeout: 20_000 });

  await host.reload();
  await expect(host.getByTestId('connect-state')).toHaveText('Phone connected', { timeout: 20_000 });
  await expect(phone.getByTestId('phone-state')).toHaveAttribute('data-state', 'streaming');
});

test('disconnecting on the Surface turns the phone camera off', async ({ context }) => {
  const host = await openHost(context);
  const phone = await pair(host, context);
  await host.getByTestId('disconnect').click();
  await expect(host.getByTestId('connect-state')).toHaveText('No phone linked');
  await expect(phone.getByTestId('phone-state')).toHaveAttribute('data-state', 'host-gone', { timeout: 10_000 });
  await expect(phone.locator('.camview__empty')).toBeVisible();
  const liveTracks = await phone.evaluate(() =>
    [...document.querySelectorAll('video')].flatMap((v) => ((v.srcObject as MediaStream | null)?.getTracks() ?? []).filter((t) => t.readyState === 'live')).length,
  );
  expect(liveTracks).toBe(0);
});

test('MediaPipe tracks both hands from the phone stream (worker)', async ({ context }) => {
  const host = await openHost(context);
  await pair(host, context);
  const summary = host.getByTestId('tracking-summary');
  await expect(summary).toHaveAttribute('data-status', 'running', { timeout: 90_000 });
  await expect(summary).toHaveAttribute('data-hands', '2', { timeout: 30_000 });
  await expect(summary).toContainText('Right');
  await expect(summary).toContainText('worker');
});

test('calibration (dwell) → air typing goes through the shared engine as AIR input', async ({ context }) => {
  const host = await openHost(context);
  const errors = trackErrors(host);
  await pair(host, context);

  await host.goto('/#/calibrate');
  await expect(host.getByTestId('tracking-summary')).toHaveAttribute('data-hands', '2', { timeout: 90_000 });
  await expect(host.getByTestId('position-checks')).toContainText('2 of 2 hands visible');
  await host.getByTestId('calib-next').click(); // → keyboard area
  await expect(host.getByTestId('corner-0')).toBeVisible();
  await host.getByTestId('calib-next').click(); // → resting hands
  await host.getByTestId('calib-rest').click();
  await expect(host.getByTestId('rest-done')).toBeVisible({ timeout: 20_000 });
  await host.getByTestId('calib-next').click(); // → press calibration
  await expect(host.getByTestId('press-target')).toBeVisible();
  // A still image cannot perform presses: use the dwell method.
  await host.getByTestId('calib-dwell').click();
  await expect(host.getByTestId('calib-saved')).toContainText('dwell');

  // The still fingertips dwell on keys → real key presses from the tracker.
  await expect(host.getByTestId('calib-typed')).not.toContainText('Typed text appears', { timeout: 30_000 });

  await host.getByTestId('calib-done').click();
  await expect(host.getByTestId('air-active')).toBeVisible();
  await expect(host.getByTestId('input-source')).toHaveAttribute('data-source', 'AIR', { timeout: 20_000 });
  await expect(host.getByTestId('editor')).not.toHaveValue('');
  // Keys under fingertips are highlighted.
  await expect(host.locator('.key.is-hovered').first()).toBeVisible();

  // Calibration persists (IndexedDB) across a reload.
  await host.reload();
  await host.goto('/#/settings');
  await host.getByRole('radio', { name: 'Air' }).click();
  await expect(host.getByText(/dwell only/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('camera window: docks without covering text, floats, snaps to corners, re-docks, closes', async ({ context }) => {
  const host = await openHost(context);
  const errors = trackErrors(host);
  await pair(host, context);
  await host.goto('/#/air');
  const win = host.getByTestId('floating-camera');
  await expect(win).toBeVisible();
  await expect(win.getByTestId('camera-video')).toBeVisible();
  // Truly floating layer: fixed to the viewport, never pushes the page into scrolling.
  expect(await win.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  expect(await host.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

  // Rests in the editor's dock slot, and the text column reflows beside it.
  await expect(win).toHaveAttribute('data-corner', 'dock');
  const slot = host.locator('.editor__dock');
  await expect
    .poll(async () => {
      const [a, b] = [await win.boundingBox(), await slot.boundingBox()];
      return Math.abs(a!.x + a!.width - (b!.x + b!.width)) + Math.abs(a!.y - b!.y);
    })
    .toBeLessThan(3);
  const pad = await host.getByTestId('editor').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  expect(pad).toBeGreaterThan((await win.boundingBox())!.width);

  // Enlarge lifts it out of the dock; minimise/restore keep working.
  const w0 = (await win.boundingBox())!.width;
  await win.getByRole('button', { name: 'Enlarge Camera' }).click();
  await expect(win).toHaveAttribute('data-corner', 'tr');
  await expect.poll(async () => (await win.boundingBox())!.width).toBeGreaterThan(w0 + 100);
  await win.getByRole('button', { name: 'Minimise Camera' }).click();
  await expect(win.locator('.fwin__body')).toHaveCount(0);
  await win.getByRole('button', { name: 'Restore Camera' }).click();
  await expect(win.locator('.fwin__body')).toHaveCount(1);
  await win.getByRole('button', { name: 'Shrink Camera' }).click();

  const dragTitleTo = async (x: number, y: number) => {
    await host.waitForTimeout(500); // let the spring settle
    const bar = (await win.locator('.fwin__title').boundingBox())!;
    await host.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await host.mouse.down();
    await host.mouse.move(x, y, { steps: 14 });
    await host.mouse.up();
  };
  const vp = host.viewportSize()!;
  await dragTitleTo(vp.width * 0.2, vp.height * 0.75);
  await expect(win).toHaveAttribute('data-corner', 'bl');

  // Drag back over the slot → re-docks.
  const s = (await slot.boundingBox())!;
  await dragTitleTo(s.x + s.width / 2, s.y + 20);
  await expect(win).toHaveAttribute('data-corner', 'dock');

  await win.getByRole('button', { name: 'Close Camera' }).click();
  await expect(win).toHaveCount(0);
  await expect(host.locator('.editor__dock')).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Show camera' })).toBeVisible();
  expect(errors).toEqual([]);
});
