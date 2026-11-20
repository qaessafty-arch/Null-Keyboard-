import { useCallback, useEffect, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { HeroFallback } from './HeroFallback';
import { useThreeCanvas, prefersReducedMotion, type SceneHandle, type SetupContext } from './useThreeCanvas';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { useSettings } from '@/stores/settingsStore';
import { THEME_GL } from '@/styles/themes';
import type { KeyboardLayout } from '@/types/keyboard';

/** Rounded-rect outlines for every key, as one LineSegments position buffer (x right, y toward viewer). */
function buildKeyOutlines(layout: KeyboardLayout, segmentsPerCorner: number): Float32Array {
  const gap = 0.12;
  const radius = 0.14;
  const rows = layout.rows.length;
  const pts: number[] = [];
  layout.rows.forEach((row, r) => {
    let x = -layout.unitsWide / 2;
    const y = r - rows / 2;
    for (const key of row) {
      const x0 = x + gap / 2;
      const x1 = x + key.width - gap / 2;
      const y0 = y + gap / 2;
      const y1 = y + 1 - gap / 2;
      const outline: Array<[number, number]> = [];
      const corners: Array<[number, number, number]> = [
        [x1 - radius, y0 + radius, -Math.PI / 2],
        [x1 - radius, y1 - radius, 0],
        [x0 + radius, y1 - radius, Math.PI / 2],
        [x0 + radius, y0 + radius, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let s = 0; s <= segmentsPerCorner; s++) {
          const a = a0 + (s / segmentsPerCorner) * (Math.PI / 2);
          outline.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
        }
      }
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i]!;
        const b = outline[(i + 1) % outline.length]!;
        pts.push(a[0], 0, a[1], b[0], 0, b[1]);
      }
      x += key.width;
    }
  });
  return new Float32Array(pts);
}

const lineVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const lineFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uSweep;
  varying vec3 vPos;
  void main() {
    // Sweep travels from the emitter (far edge, -z) toward the viewer.
    float s = fract(uTime * 0.18) * 7.0 - 3.5;
    float band = exp(-pow((vPos.z - s) * 2.2, 2.0)) * uSweep;
    float falloff = 0.55 + 0.45 * smoothstep(-3.0, 2.5, vPos.z);
    vec3 c = mix(uColor, uColor2, band * 0.6);
    vec3 o = c * (falloff * 0.75 + band * 1.4);
    // Premultiplied: alpha tracks brightness so dark pixels stay transparent.
    gl_FragColor = vec4(o, clamp(max(o.r, max(o.g, o.b)), 0.0, 1.0));
  }
`;

const fanVertex = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fanFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    vec3 o = uColor * vFade * 0.22;
    gl_FragColor = vec4(o, max(o.r, max(o.g, o.b)));
  }
`;

const glowFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.0, 2.2);
    float g = exp(-dot(p, p) * 5.0);
    vec3 o = uColor * g * 0.25;
    gl_FragColor = vec4(o, max(o.r, max(o.g, o.b)));
  }
`;
const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Home-screen 3D hero: the keyboard layout as projected laser outlines on a
 * tilted plane, an emitter fan, and pointer parallax. Pure decoration — it
 * shows no input or tracking data.
 */
export function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  const quality = useSettings((s) => s.performance.quality);
  const theme = useSettings((s) => s.general.theme);
  const profile = QUALITY_PROFILES[quality];
  const materials = useRef<{ line: ShaderMaterial; fan: ShaderMaterial; glow: ShaderMaterial } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const setup = useCallback(
    ({ renderer, width, height }: SetupContext): SceneHandle => {
      const colors = THEME_GL[useSettings.getState().general.theme];
      const scene = new Scene();
      const camera = new PerspectiveCamera(32, width / height, 0.1, 100);
      camera.position.set(0, 9.5, 11.5);
      camera.lookAt(0, 0, 0.4);

      const group = new Group();
      scene.add(group);

      // Key outlines.
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute(
        'position',
        new BufferAttribute(buildKeyOutlines(QWERTY_US, profile.heroDetail === 'full' ? 4 : 2), 3),
      );
      const line = new ShaderMaterial({
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
        blending: AdditiveBlending,
        premultipliedAlpha: true,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new Vector3(...colors.primary) },
          uColor2: { value: new Vector3(...colors.secondary) },
          uTime: { value: 0 },
          uSweep: { value: prefersReducedMotion() ? 0 : 1 },
        },
      });
      group.add(new LineSegments(lineGeo, line));

      // Emitter fan from the far edge across the keyboard plane.
      const half = QWERTY_US.unitsWide / 2 + 0.3;
      const zFar = -QWERTY_US.rows.length / 2 - 1.6;
      const zNear = QWERTY_US.rows.length / 2 + 0.3;
      const fanGeo = new BufferGeometry();
      fanGeo.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([0, 0.02, zFar, -half, 0, zNear, half, 0, zNear]), 3),
      );
      fanGeo.setAttribute('aFade', new BufferAttribute(new Float32Array([1, 0.15, 0.15]), 1));
      const fan = new ShaderMaterial({
        vertexShader: fanVertex,
        fragmentShader: fanFragment,
        blending: AdditiveBlending,
        premultipliedAlpha: true,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new Vector3(...colors.primary) } },
      });
      group.add(new Mesh(fanGeo, fan));

      // Soft glow at the emitter.
      const glowGeo = new PlaneGeometry(4, 2);
      const glow = new ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        blending: AdditiveBlending,
        premultipliedAlpha: true,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new Vector3(...colors.primary) } },
      });
      const glowMesh = new Mesh(glowGeo, glow);
      glowMesh.rotation.x = -Math.PI / 2;
      glowMesh.position.set(0, 0.01, zFar + 0.2);
      group.add(glowMesh);

      materials.current = { line, fan, glow };

      return {
        render: (time, dt) => {
          line.uniforms.uTime!.value = time;
          const tx = pointer.current.x * 0.12;
          const ty = pointer.current.y * 0.06;
          const k = Math.min(1, dt * 4);
          group.rotation.y += (tx - group.rotation.y) * k;
          group.rotation.x += (ty - group.rotation.x) * k;
          renderer.render(scene, camera);
        },
        resize: (w, h) => {
          camera.aspect = w / h;
          // Keep the whole keyboard in frame on narrow (portrait) screens.
          camera.position.set(0, 9.5, 11.5).multiplyScalar(Math.max(1, 1.45 / camera.aspect));
          camera.lookAt(0, 0, 0.4);
          camera.updateProjectionMatrix();
        },
        dispose: () => {
          lineGeo.dispose();
          fanGeo.dispose();
          glowGeo.dispose();
          line.dispose();
          fan.dispose();
          glow.dispose();
          materials.current = null;
        },
      };
    },
    [profile.heroDetail],
  );

  const status = useThreeCanvas(host, setup, {
    enabled: profile.heroDetail !== 'off',
    maxDpr: profile.maxDpr,
  });

  useEffect(() => {
    const m = materials.current;
    if (!m) return;
    const c = THEME_GL[theme];
    (m.line.uniforms.uColor!.value as Vector3).set(...c.primary);
    (m.line.uniforms.uColor2!.value as Vector3).set(...c.secondary);
    (m.fan.uniforms.uColor!.value as Vector3).set(...c.primary);
    (m.glow.uniforms.uColor!.value as Vector3).set(...c.primary);
  }, [theme, status]);

  return (
    <div className="hero-scene" data-gl={status} aria-hidden="true">
      <div ref={host} className="hero-gl" />
      {status !== 'running' && <HeroFallback />}
    </div>
  );
}
