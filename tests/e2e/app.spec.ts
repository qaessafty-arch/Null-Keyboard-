import { test, expect, type Page } from '@playwright/test';

/** Collect console errors and page errors for the whole test. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function keyCenter(page: Page, id: string) {
  const box = await page.locator(`[data-key="${id}"]`).boundingBox();
  if (!box) throw new Error(`key ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const editor = (page: Page) => page.getByTestId('editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('home renders the 3D hero without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /type on light/i })).toBeVisible();
  await expect(page.locator('.hero-scene')).toHaveAttribute('data-gl', /running|unsupported/);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('mouse typing in Touch Mode', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/touch');
  for (const k of ['KeyH', 'KeyE', 'KeyL', 'KeyL', 'KeyO']) await page.locator(`[data-key="${k}"]`).click();
  await expect(editor(page)).toHaveValue('hello');
  await expect(page.getByTestId('input-source')).toHaveAttribute('data-source', 'MOUSE');
  expect(errors).toEqual([]);
});

test('real touch events (CDP) type and support a two-finger Shift chord', async ({ page }) => {
  await page.goto('/#/touch');
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchEnd' | 'touchMove', points: Array<{ x: number; y: number; id: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  const a = await keyCenter(page, 'KeyA');
  await touch('touchStart', [{ ...a, id: 1 }]);
  await touch('touchEnd', []);
  await expect(editor(page)).toHaveValue('a');
  await expect(page.getByTestId('input-source')).toHaveAttribute('data-source', 'TOUCH');

  // Finger 1 holds Shift, finger 2 taps B, then both lift.
  const shift = await keyCenter(page, 'ShiftLeft');
  const b = await keyCenter(page, 'KeyB');
  await touch('touchStart', [{ ...shift, id: 1 }]);
  await touch('touchStart', [
    { ...shift, id: 1 },
    { ...b, id: 2 },
  ]);
  await touch('touchEnd', [{ ...shift, id: 1 }]);
  await touch('touchEnd', []);
  await expect(editor(page)).toHaveValue('aB');
  // The chord must not leave Shift latched.
  await expect(page.locator('[data-mod="shift"]')).not.toHaveClass(/is-on/);
});

test('pen pointer events (CDP) are reported as PEN', async ({ page }) => {
  await page.goto('/#/touch');
  const cdp = await page.context().newCDPSession(page);
  const p = await keyCenter(page, 'KeyP');
  const base = { x: p.x, y: p.y, button: 'left' as const, pointerType: 'pen' as const, clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, button: 'none' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, force: 0.5 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  await expect(editor(page)).toHaveValue('p');
  await expect(page.getByTestId('input-source')).toHaveAttribute('data-source', 'PEN');
});

test('switching Touch ⇄ Air keeps the text', async ({ page }) => {
  await page.goto('/#/touch');
  for (const k of ['KeyN', 'KeyE', 'KeyO']) await page.locator(`[data-key="${k}"]`).click();
  await page.getByRole('radio', { name: /air mode/i }).click();
  await expect(page.getByTestId('air-panel')).toBeVisible();
  await expect(page.getByTestId('active-mode')).toContainText('AIR');
  await expect(editor(page)).toHaveValue('neo');
  await page.getByRole('radio', { name: /touch mode/i }).click();
  await expect(editor(page)).toHaveValue('neo');
});

test('Air Mode never claims a camera connection', async ({ page }) => {
  await page.goto('/#/air');
  await expect(page.getByTestId('camera-link-pill')).toContainText('No phone linked');
  await page.goto('/#/connect');
  await expect(page.getByTestId('connect-state')).toHaveText('No phone linked');
  await expect(page.getByRole('button', { name: /generate pairing code/i })).toBeDisabled();
});

test('settings persist after reload', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Touch' }).click();
  await page.getByRole('switch', { name: 'Hold to repeat' }).click();
  await page.getByRole('radio', { name: 'General' }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('holo');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'holo');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'holo');
  await page.getByRole('radio', { name: 'Touch' }).click();
  await expect(page.getByRole('switch', { name: 'Hold to repeat' })).toHaveAttribute('aria-checked', 'false');
});

test('laser surface renders with WebGL in Balanced quality and is removed in Low', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/touch');
  await expect(page.locator('.laser-surface')).toHaveAttribute('data-gl', /running|unsupported/);
  const glState = await page.locator('.laser-surface').getAttribute('data-gl');
  test.info().annotations.push({ type: 'webgl', description: String(glState) });
  await page.goto('/#/performance');
  await page.getByRole('radio', { name: 'Low' }).click();
  await page.goto('/#/touch');
  await expect(page.locator('.laser-surface')).toHaveAttribute('data-gl', 'off');
  await expect(page.locator('.gl-canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('performance monitor shows measured FPS and latency after presses', async ({ page }) => {
  await page.goto('/#/touch');
  for (const k of ['KeyA', 'KeyB', 'KeyC']) await page.locator(`[data-key="${k}"]`).click();
  await expect(page.getByTestId('status-fps')).not.toHaveText('—', { timeout: 3000 });
  await expect(page.getByTestId('status-latency')).toHaveText(/ms$/, { timeout: 3000 });
});

test('every screen renders without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  for (const route of ['/', '/workspace', '/touch', '/air', '/connect', '/calibrate', '/settings', '/performance', '/about']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main')).not.toBeEmpty();
  }
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('portrait layout keeps the keyboard within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 912, height: 1368 });
  await page.goto('/#/touch');
  const kb = await page.getByTestId('virtual-keyboard').boundingBox();
  expect(kb).not.toBeNull();
  expect(kb!.x).toBeGreaterThanOrEqual(0);
  expect(kb!.x + kb!.width).toBeLessThanOrEqual(912);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHScroll).toBe(true);
});
