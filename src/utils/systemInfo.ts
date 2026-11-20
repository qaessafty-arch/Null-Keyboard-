/** Real capability and device information read from the browser. */

export interface GpuInfo {
  api: 'WebGL2' | 'WebGL' | 'none';
  renderer: string | null;
  vendor: string | null;
}

export function getGpuInfo(): GpuInfo {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl');
    if (!gl) return { api: 'none', renderer: null, vendor: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info: GpuInfo = {
      api: gl2 ? 'WebGL2' : 'WebGL',
      renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
      vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return info;
  } catch {
    return { api: 'none', renderer: null, vendor: null };
  }
}

const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

export interface Capabilities {
  secureContext: boolean;
  getUserMedia: boolean;
  webrtc: boolean;
  webSocket: boolean;
  pointerEvents: boolean;
  touchPoints: number;
  finePointer: boolean;
  coarsePointer: boolean;
  hover: boolean;
  serviceWorker: boolean;
  indexedDB: boolean;
  clipboardWrite: boolean;
  fullscreen: boolean;
  wasm: boolean;
  offscreenCanvas: boolean;
  videoFrameCallback: boolean;
}

export function getCapabilities(): Capabilities {
  return {
    secureContext: window.isSecureContext,
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    webrtc: 'RTCPeerConnection' in window,
    webSocket: 'WebSocket' in window,
    pointerEvents: 'PointerEvent' in window,
    touchPoints: navigator.maxTouchPoints ?? 0,
    finePointer: mq('(any-pointer: fine)'),
    coarsePointer: mq('(any-pointer: coarse)'),
    hover: mq('(any-hover: hover)'),
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    clipboardWrite: !!navigator.clipboard?.writeText,
    fullscreen: !!document.documentElement.requestFullscreen,
    wasm: typeof WebAssembly === 'object',
    offscreenCanvas: 'OffscreenCanvas' in window,
    videoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
  };
}

export interface DeviceInfo {
  userAgent: string;
  platform: string | null;
  cores: number | null;
  /** navigator.deviceMemory — coarse, capped at 8 GB by the browser. */
  memoryGb: number | null;
  screen: string;
  viewport: string;
  dpr: number;
  orientation: string | null;
  online: boolean;
}

export function getDeviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  return {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform ?? null,
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    screen: `${screen.width} × ${screen.height}`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    orientation: screen.orientation?.type ?? null,
    online: nav.onLine,
  };
}

/** Chromium-only JS heap numbers (performance.memory). */
export function getHeapMb(): { used: number; limit: number } | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!mem) return null;
  return { used: mem.usedJSHeapSize / 1048576, limit: mem.jsHeapSizeLimit / 1048576 };
}
