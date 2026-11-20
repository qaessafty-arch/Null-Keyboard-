#!/usr/bin/env node
/**
 * Copies MediaPipe's wasm runtime into public/ and downloads the hand
 * landmark model, so NEO TYPE serves everything itself (offline-capable, no
 * CDN at runtime). Runs automatically after `npm install`; safe to re-run:
 *
 *   npm run setup:assets
 *
 * Never fails the install: if the download is impossible (offline), the app
 * falls back to fetching the model from Google's public model bucket at
 * runtime and tells you so.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'mediapipe', 'wasm');
const modelDir = join(root, 'public', 'models');
const modelPath = join(modelDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const MIN_MODEL_BYTES = 1_000_000;

function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.warn('[setup-assets] @mediapipe/tasks-vision not installed yet — skipping wasm copy');
    return;
  }
  mkdirSync(wasmDst, { recursive: true });
  // Both builds: the module build runs in the tracking Web Worker, the classic
  // build is the main-thread fallback. Each device downloads only the one it uses.
  const files = readdirSync(wasmSrc).filter((f) => f.startsWith('vision_wasm_'));
  for (const f of files) copyFileSync(join(wasmSrc, f), join(wasmDst, f));
  console.log(`[setup-assets] MediaPipe wasm → public/mediapipe/wasm (${files.length} files)`);
}

async function fetchModel() {
  if (existsSync(modelPath) && statSync(modelPath).size > MIN_MODEL_BYTES) {
    console.log('[setup-assets] hand model already present');
    return;
  }
  mkdirSync(modelDir, { recursive: true });
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_MODEL_BYTES) throw new Error(`unexpected size ${buf.length}`);
    const tmp = `${modelPath}.part`;
    writeFileSync(tmp, buf);
    renameSync(tmp, modelPath);
    console.log(`[setup-assets] hand model → public/models (${(buf.length / 1048576).toFixed(1)} MB)`);
  } catch (err) {
    if (existsSync(`${modelPath}.part`)) unlinkSync(`${modelPath}.part`);
    console.warn(`[setup-assets] could not download the hand model (${err.message}).`);
    console.warn('[setup-assets] NEO TYPE will fetch it from Google at runtime instead. Re-run `npm run setup:assets` when online.');
  }
}

copyWasm();
await fetchModel();
