import { useCallback, useEffect, useRef } from 'react';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { useThreeCanvas, prefersReducedMotion, type SceneHandle, type SetupContext } from './useThreeCanvas';
import { onRipple } from '@/rendering/effects/rippleBus';
import { webglRenderCost } from '@/engine/performance/metrics';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { useSettings } from '@/stores/settingsStore';
import { THEME_GL } from '@/styles/themes';

const MAX_RIPPLES = 8;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uIntensity;
  uniform float uSweep;
  uniform int uRippleCount;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec2 vUv;

  float gridLine(vec2 p, float spacing, float width) {
    vec2 g = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
    return 1.0 - smoothstep(0.0, width, min(g.x, g.y));
  }

  void main() {
    vec2 px = vUv * uRes;
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
               * smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

    // Projection grid: fine + coarse.
    float grid = (gridLine(px, 24.0, 1.0) * 0.07 + gridLine(px, 120.0, 1.3) * 0.09) * edge;

    // Laser emitter above the top edge, fanning down over the keyboard.
    vec2 em = vec2(0.5 * uRes.x, uRes.y * 1.12);
    vec2 d = px - em;
    float ang = atan(d.x, -d.y);
    float fan = smoothstep(1.05, 0.80, abs(ang));
    float dist = length(d) / uRes.y;
    float beam = fan * exp(-dist * 1.35) * 0.16;

    // Two hairline fan edges.
    float edgeLine = (exp(-pow((abs(ang) - 0.92) * 90.0, 2.0))) * exp(-dist * 0.9) * 0.35;

    // Slow scan sweep top → bottom.
    float sweepY = fract(uTime * 0.09);
    float sweep = exp(-pow(((1.0 - vUv.y) - sweepY) * uRes.y / 5.0, 2.0)) * 0.18 * fan * uSweep;

    // Press ripples.
    float rip = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (i >= uRippleCount) break;
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age < 0.0 || age > 0.75 || r.w <= 0.0) continue;
      vec2 c = vec2(r.x, 1.0 - r.y) * uRes;
      float radius = age * 380.0;
      float dd = abs(length(px - c) - radius);
      float fade = 1.0 - age / 0.75;
      rip += exp(-dd * dd / 30.0) * fade * fade * r.w;
      rip += exp(-dot(px - c, px - c) / 900.0) * fade * 0.35 * r.w;
    }

    float base = grid + beam + edgeLine + sweep;
    vec3 col = uA * base + mix(uA, uB, 0.55) * rip;
    float a = clamp((base + rip) * uIntensity, 0.0, 1.0);
    gl_FragColor = vec4(col * uIntensity, a);
  }
`;

/**
 * WebGL "projection surface" drawn behind the DOM keys: grid, emitter fan,
 * sweep, and press ripples. Disabled in LOW quality (CSS fallback remains).
 */
export function LaserSurface() {
  const host = useRef<HTMLDivElement>(null);
  const quality = useSettings((s) => s.performance.quality);
  const effects = useSettings((s) => s.performance.effects);
  const theme = useSettings((s) => s.general.theme);
  const profile = QUALITY_PROFILES[quality];
  const material = useRef<ShaderMaterial | null>(null);

  const setup = useCallback(
    ({ renderer, width, height }: SetupContext): SceneHandle => {
      const scene = new Scene();
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new PlaneGeometry(2, 2);
      const colors = THEME_GL[useSettings.getState().general.theme];
      const mat = new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uRes: { value: new Vector2(width, height) },
          uA: { value: new Vector3(...colors.primary) },
          uB: { value: new Vector3(...colors.secondary) },
          uIntensity: { value: useSettings.getState().performance.effects / 100 },
          uSweep: { value: prefersReducedMotion() ? 0 : 1 },
          uRippleCount: { value: profile.ripples },
          uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 0, -10, 0)) },
        },
      });
      material.current = mat;
      scene.add(new Mesh(geometry, mat));

      let slot = 0;
      let clock = 0;
      const offRipple = onRipple((r) => {
        const ripples = mat.uniforms.uRipples!.value as Vector4[];
        const count = Math.max(1, profile.ripples);
        ripples[slot % count]!.set(r.x, r.y, clock, r.strength);
        slot++;
      });

      return {
        render: (time) => {
          clock = time;
          mat.uniforms.uTime!.value = time;
          const t0 = performance.now();
          renderer.render(scene, camera);
          webglRenderCost.record(performance.now() - t0);
        },
        resize: (w, h) => (mat.uniforms.uRes!.value as Vector2).set(w, h),
        dispose: () => {
          offRipple();
          geometry.dispose();
          mat.dispose();
          material.current = null;
        },
      };
    },
    [profile.ripples],
  );

  const status = useThreeCanvas(host, setup, { enabled: profile.webgl, maxDpr: profile.maxDpr });

  // Live-update theme and intensity without recreating the renderer.
  useEffect(() => {
    const mat = material.current;
    if (!mat) return;
    const c = THEME_GL[theme];
    (mat.uniforms.uA!.value as Vector3).set(...c.primary);
    (mat.uniforms.uB!.value as Vector3).set(...c.secondary);
    mat.uniforms.uIntensity!.value = effects / 100;
  }, [theme, effects, status]);

  return <div ref={host} className="laser-surface" data-gl={status} aria-hidden="true" />;
}
