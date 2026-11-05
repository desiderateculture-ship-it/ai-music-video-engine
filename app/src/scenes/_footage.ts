// Footage in a plate: one clip drawn into a window (or full-bleed) with crop, pan, push-in and the
// Fight grade (crushed blacks, red in the shadows, cool highlights, vignette), plus an optional
// blurred, darkened copy filling the whole frame behind it (vertical: the 4:5 window on 9:16).
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';
import { clip, registerFootage, type Clip } from '../engine/footage';

export interface Rect { x: number; y: number; w: number; h: number } // logical px, y down

const FRAG = /* glsl */ `
  uniform sampler2D tex;
  uniform vec4 uDst;      // x, y, w, h (logical px, y down)
  uniform vec4 uSrc;      // u0, v0 (from top), uw, vh  (texture uv)
  uniform float uDim, uSat, uContrast, uRed, uShade, uAlpha, uBlur, uVig, uHit;
  uniform vec3 uHitMul, uHitAdd;   // the impact tint (red by default; Look.hitTint 'blue' for blue)
  uniform vec3 uGain; uniform float uGamma;   // per-shot match before the house grade: white balance, midtone lift
  vec3 grade(vec3 lin, vec2 q) {
    vec3 c = pow(clamp(toSRGB(lin) * uGain, 0.0, 1.0), vec3(uGamma));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    c = (c - 0.5) * uContrast + 0.5;
    c = max(c - 0.035, 0.0) / 0.965;                                  // crush the blacks
    float sh = pow(1.0 - clamp(l, 0.0, 1.0), 2.0);
    c += vec3(0.20, -0.02, -0.03) * sh * uRed;                         // red into the shadows
    c *= vec3(0.97, 1.0, 1.03) * (1.0 - sh) + sh;                      // a touch cool up top
    c = mix(c, c * uHitMul + uHitAdd, uHit);                         // impact: everything goes red (or the piece's tint)
    float v = smoothstep(0.85, 0.25, length((q - 0.5) * vec2(1.0, 1.15)));
    c *= mix(1.0, v, uVig);
    c *= 1.0 - uShade * smoothstep(0.45, 1.0, q.y);                   // darken toward the bottom for captions
    c *= 1.0 - uDim;
    return toLinear(clamp(c, 0.0, 1.0));
  }
  void main() {
    vec2 px = vec2(FRAG_PX.x, ${H.toFixed(1)} - FRAG_PX.y);
    vec2 q = (px - uDst.xy) / uDst.zw;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
    vec2 uv = uSrc.xy + q * uSrc.zw;
    uv.y = 1.0 - uv.y;
    vec3 col;
    if (uBlur > 0.0) {
      col = vec3(0.0);
      float tot = 0.0;
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 2.39996, r = sqrt(float(i) + 0.5) / 4.0;
        vec2 o = vec2(cos(a), sin(a)) * r * uBlur * vec2(uSrc.z, uSrc.w);
        col += texture(tex, uv + o).rgb; tot += 1.0;
      }
      col /= tot;
    } else col = texture(tex, uv).rgb;
    fragColor = vec4(grade(col, q) * uAlpha, uAlpha);
  }`;

export interface Look { gain?: [number, number, number]; gamma?: number; dim?: number; sat?: number; contrast?: number; red?: number; shade?: number; vig?: number; hit?: number; alpha?: number; hitTint?: 'red' | 'blue' }
const HIT_TINT = { red: [[1.35, 0.55, 0.5], [0.12, 0, 0]], blue: [[0.6, 0.85, 1.4], [0, 0.03, 0.14]] } as const;

export class FootageLayer {
  pass = new FSPass(FRAG, {
    tex: { value: null }, uDst: { value: new THREE.Vector4() }, uSrc: { value: new THREE.Vector4() },
    uDim: { value: 0 }, uSat: { value: 0.75 }, uContrast: { value: 1.12 }, uRed: { value: 0.35 }, uShade: { value: 0 },
    uAlpha: { value: 1 }, uBlur: { value: 0 }, uVig: { value: 0.6 }, uHit: { value: 0 },
    uHitMul: { value: new THREE.Vector3(1.35, 0.55, 0.5) }, uHitAdd: { value: new THREE.Vector3(0.12, 0, 0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) }, uGamma: { value: 1 },
  }, { blending: THREE.CustomBlending, transparent: true });
  constructor() {
    const m = this.pass.mat;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }

  /**
   * Draw `c` into `dst`. The crop keeps dst's aspect: at zoom 1 it is as large as the source allows,
   * centred on (cx, cy) in 0..1 of the source and clamped inside it.
   */
  draw(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, c: Clip, dst: Rect, o: { cx?: number; cy?: number; zoom?: number; blur?: number } & Look = {}) {
    if (!c.loaded) return;
    const sw = c.width, sh = c.height, A = dst.w / dst.h;
    let ch = sh / (o.zoom ?? 1), cw = ch * A;
    if (cw > sw) { cw = sw; ch = cw / A; }
    const x0 = Math.min(sw - cw, Math.max(0, (o.cx ?? 0.5) * sw - cw / 2));
    const y0 = Math.min(sh - ch, Math.max(0, (o.cy ?? 0.5) * sh - ch / 2));
    const u = this.pass.u;
    u.tex!.value = c.texture;
    (u.uDst!.value as THREE.Vector4).set(dst.x, dst.y, dst.w, dst.h);
    (u.uSrc!.value as THREE.Vector4).set(x0 / sw, y0 / sh, cw / sw, ch / sh);
    u.uDim!.value = o.dim ?? 0; u.uSat!.value = o.sat ?? 0.75; u.uContrast!.value = o.contrast ?? 1.12;
    u.uRed!.value = o.red ?? 0.35; u.uShade!.value = o.shade ?? 0; u.uAlpha!.value = o.alpha ?? 1;
    u.uBlur!.value = o.blur ?? 0; u.uVig!.value = o.vig ?? 0.6; u.uHit!.value = o.hit ?? 0;
    const gn = o.gain ?? [1, 1, 1]; (u.uGain!.value as THREE.Vector3).set(gn[0], gn[1], gn[2]); u.uGamma!.value = o.gamma ?? 1;
    const [hm, ha] = HIT_TINT[o.hitTint ?? 'red'];
    (u.uHitMul!.value as THREE.Vector3).set(hm[0], hm[1], hm[2]); (u.uHitAdd!.value as THREE.Vector3).set(ha[0], ha[1], ha[2]);
    this.pass.render(renderer, out);
  }
}

/** Register a plate's clip so the exporter seeks it before every frame of [start, end]. */
export function useClip(name: string, start: number, end: number, timeAt: (t: number) => number): { clip: Clip; dispose: () => void } {
  const c = clip(name);
  const off = registerFootage((t) => (t >= start - 0.05 && t <= end + 0.05 ? [{ clip: name, time: timeAt(t) }] : []));
  return { clip: c, dispose: () => { off(); } };
}

export const FULL: Rect = { x: 0, y: 0, w: W, h: H };
