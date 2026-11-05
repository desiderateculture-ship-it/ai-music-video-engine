// Plate kit: what every music video plate shares, so a piece reads as one system.
//  - PodPlate: carbon BG with the faint telemetry grid, a GL content pass, a text layer and an additive glow
//    layer, the chapter label, lower captions, and the way the plate comes in (params.trans): 'wipe' = the
//    red scan line sweeps across and reveals this plate over the outgoing one (f.under), 'fade', or 'cut'.
//  - Media: a schedule of footage clips and stills (shots [{t, clip|still, in, speed, cx, cy, z0, z1, win}]),
//    one on screen at a time, frame-accurate. Landscape fills the frame; fight broadcast clips (1920x744) sit
//    letterboxed ('scope'); vertical phone clips sit in a 9:16 window over a blurred copy of themselves.
//  - Chrome: keyword pop cards (on camera), the nameplate, the tag (b-roll), the stacked word list, chapter.
// Brand: carbon / canvas cream / one signal red; teal only for the calm / controlled state. Archivo + Plex Mono.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, VERTICAL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clip as getClip, registerFootage, type Clip } from '../engine/footage';
import { BASE } from '../engine/project';
import { ease, lerp, prog, clamp } from '../engine/util';
import { BG_GLSL, drawLifeline } from './_style';
import { FootageLayer, FULL, type Look, type Rect } from './_footage';
import { Captions, Wipe, linesIn, rr, fitBlock } from './_kit';
import { FUNCTION_WORDS } from './_style';
import { norm, type Line, type Word } from '../engine/lyrics';

export const HEAVY = F.archivo(112, 900);
export const BOLD = F.archivo(100, 800);
export const WIDE = F.archivo(125, 900);
export const MONO = F.mono(500);
export const MONO_B = F.mono(700);
export const POD_POST: PostOverrides = { bloom: 0.42, halation: 0.18, grain: 0.05, vignette: 0.32, ca: 0.6 };

// fight broadcast clips (1920x744): full width, letterboxed; in 9:16 a band above the caption lane
export const SCOPE: Rect = VERTICAL ? { x: 0, y: 560, w: W, h: W / 2.58 } : { x: 0, y: (H - 744) / 2, w: W, h: 744 };
// captions: 16:9 lower third; 9:16 the reel karaoke lane over the chest (below the mouth, above the IG UI)
export const CAP_Y = VERTICAL ? 1260 : 968;
/** 9:16 crop of a 16:9 camera: screen-left (lead) eye on the horizontal centre, eye line at y=640 of 1920 */
export const CAM_V = { cx: 0.4724, cy: 0.537, zoom: 1.08 };

// ------------------------------------------------------------------ base plate

export abstract class PodPlate extends Scene {
  override handlesTransition = true;
  bg = new FSPass(BG_GLSL, { uGrid: { value: 0.7 }, uDim: { value: 0 }, uWarm: { value: 0.12 } });
  text = new Layer2D();
  glow = new Layer2D();
  lb = new LineBatch(30000, { screen2D: true, blend: 'add' });
  wipe = new Wipe();
  caps: Captions | Karaoke | null = null;
  /** Lower captions on this plate (b-roll and graphics). */
  captions = true;
  capY = CAP_Y;

  override async init() {
    await this.setup();
    if (this.captions && this.ctx.params.caps !== false) {
      const { lyrics, params: p } = this.ctx;
      const lines = linesIn(lyrics, p.cut - 0.05, p.out - 0.05);
      this.caps = VERTICAL ? new Karaoke(lines, this.text.ctx) : new Captions(lines, this.text.ctx, { size: 54, maxW: 1480, rows: 2, family: BOLD });
    }
  }
  setup(): Promise<void> | void {}
  abstract content(f: Frame, out: THREE.WebGLRenderTarget, c: CanvasRenderingContext2D, g: CanvasRenderingContext2D): PostOverrides | void;
  /** BG warmth (red glow in the centre) per frame. */
  warm(_f: Frame) { return 0.12; }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, params: p } = this.ctx;
    this.bg.u.uWarm!.value = this.warm(f);
    this.bg.render(renderer, out);
    this.text.clear(); this.glow.clear(); this.lb.clear();
    const c = this.text.ctx, g = this.glow.ctx;
    const ov = this.content(f, out, c, g) ?? {};
    this.lb.render(renderer, out);
    if (this.caps && !(VERTICAL && p.hookBar && f.t < 1 / 30)) {
      // captions clear just before the plate hands over (never on the next plate's first frame)
      const a = 1 - prog(f.t, p.out - 0.25, p.out - 0.05);
      this.caps.draw(c, f.t, W / 2, this.capY, g, a);
    }
    if (p.chapter) drawChapter(c, f.t, p.cut, p.chapter);
    if (VERTICAL && p.progress) drawProgress(c, f.t, p.progress);
    comp.draw(renderer, this.text.upload(), out);
    comp.draw(renderer, this.glow.upload(), out, { mode: 'add', tint: [0.9, 0.9, 0.9] });
    if (f.under && f.tin < 1) {
      if (p.trans === 'fade') comp.draw(renderer, f.under, out, { opacity: 1 - ease.inOutQuad(f.tin) });
      else if (p.trans === 'wipe') this.wipe.draw(renderer, out, f.under, f.tin, f.t);
    }
    const fade = p.fade ? prog(f.t, this.ctx.end - p.fade, this.ctx.end - 0.05, ease.inOutQuad) : 0;
    return { ...POD_POST, ...ov, fade: Math.max(fade, (ov as PostOverrides).fade ?? 0) };
  }
}

// ------------------------------------------------------------------ media (clips + stills)

export interface Shot { t: number; clip?: string; still?: string; in?: number; speed?: number; cx?: number; vcx?: number; cy?: number; z0?: number; z1?: number; win?: 'scope' | 'band'; look?: Look; fill?: boolean }

const stills = new Map<string, Promise<HTMLImageElement>>();
const imgs = new Map<string, Promise<HTMLImageElement>>();
/** Any image under public/ (a client's logo: brand/logo.png), cached. */
export function loadImg(url: string) {
  let p = imgs.get(url);
  if (!p) { p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`image failed: ${url}`)); im.src = url; }); imgs.set(url, p); }
  return p;
}

/** A logo SLAMS in at t0 (from 1.6x to 1, a hard stop), sits, and clears at `out`: centred on (cx, cy), w wide.
 * The glow layer carries a soft copy so it blooms like the kinetic words. */
export function drawLogo(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, im: HTMLImageElement, t: number, t0: number,
                         o: { cx: number; cy: number; w: number; out?: number; glow?: number }) {
  const k = prog(t, t0 - 0.01, t0 + 0.12, ease.outExpo);
  const a = clamp(k * 4) * (1 - prog(t, (o.out ?? Infinity) - 0.15, o.out ?? Infinity));
  if (k <= 0 || a <= 0) return;
  const s = lerp(1.6, 1, k), w = o.w * s, h = (w * im.height) / im.width;
  for (const [L, al] of [[c, 1], [g, o.glow ?? 0.25]] as const) {
    L.save(); L.globalAlpha = a * al;
    if (L === c) { L.shadowColor = 'rgba(0,0,0,0.85)'; L.shadowBlur = 40; }
    L.drawImage(im, o.cx - w / 2, o.cy - h / 2, w, h); L.restore();
  }
}

function loadStill(name: string) {
  let p = stills.get(name);
  if (!p) {
    p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`still failed: ${name}`)); im.src = `footage/${BASE}/stills/${name}.jpg`; });
    stills.set(name, p);
  }
  return p;
}

// Neighbouring segments never share a decoder: with one decoder per clip the outgoing segment's last seek could win
// and flash its frame in the new shot. build.py stamps each shot with `slot` (segment index % 4 + 1); scene setups run
// concurrently, so a creation-order counter is only the fallback.
const SLOTS = 1;
let nextSlot = 0;

/** A schedule of shots, one on screen at a time between `start` and `end` (shot i runs t_i .. t_{i+1}). */
export class Media {
  slot: number;
  foot = new FootageLayer();
  pic = new Layer2D();
  clips = new Map<string, Clip>();
  imgs = new Map<string, HTMLImageElement>();
  off: () => void = () => {};
  constructor(public shots: Shot[], public start: number, public end: number) {
    this.slot = SLOTS > 1 ? ((shots[0] as any)?.slot ?? 1 + (nextSlot++ % SLOTS)) : 0;
  }

  async load() {
    for (const s of this.shots) {
      if (s.clip && !this.clips.has(s.clip)) this.clips.set(s.clip, getClip(s.clip, this.slot));
      if (s.still && !this.imgs.has(s.still)) this.imgs.set(s.still, await loadStill(s.still));
    }
    this.off = registerFootage((t) => {
      if (t < this.start - 0.05 || t > this.end + 0.05) return [];
      const k = this.at(t), s = this.shots[k]!;
      return s.clip ? [{ clip: s.clip, time: this.clipTime(k, t), slot: this.slot }] : [];
    });
    await Promise.all([...this.clips.values()].map((c) => c.load()));
  }
  dispose() { this.off(); }

  at(t: number) { let k = 0; this.shots.forEach((s, i) => { if (t >= s.t - 0.1) k = i; }); return k; }
  shotStart(k: number) { return k === 0 ? this.start : this.shots[k]!.t - 0.1; }
  shotEnd(k: number) { return k + 1 < this.shots.length ? this.shots[k + 1]!.t - 0.1 : this.end; }
  clipTime(k: number, t: number) { const s = this.shots[k]!; return (s.in ?? 0) + Math.max(0, t - this.shotStart(k)) * (s.speed ?? 1); }

  /** Draw the shot on screen at t into `dst` (default full frame). Returns the rect the picture occupies. */
  draw(renderer: THREE.WebGLRenderer, comp: { draw: (...a: any[]) => void }, out: THREE.WebGLRenderTarget, t: number, look: Look = {}, dst: Rect = FULL): Rect {
    // (the shot is picked at the output frame's centre, where syncFootage fetched its picture: a motion-blur
    //  sub-frame across a shot switch would otherwise draw the new shot's frame with the old shot's crop)
    const k = this.at(t), s = this.shots[k]!;
    const z = lerp(s.z0 ?? 1.0, s.z1 ?? 1.07, prog(t, this.shotStart(k), this.shotEnd(k), ease.inOutQuad));
    const L: Look = { sat: 0.82, contrast: 1.08, red: 0.22, vig: 0.5, ...look, ...(s.look ?? {}) };
    if (s.still) {
      const im = this.imgs.get(s.still)!;
      const c = this.pic.ctx; this.pic.clear('#000');
      if (s.win === 'band' && VERTICAL && dst === FULL) {
        // 9:16: a low-res photo (an Instagram still) in a 4:3 window across the frame, over a blurred, darkened copy
        const cover = (r: Rect, zz: number) => { const A = r.w / r.h, ia = im.width / im.height; let sw = im.width, sh = im.height; if (ia > A) sw = sh * A; else sh = sw / A; sw /= zz; sh /= zz;
          return [clamp((s.cx ?? 0.5) * im.width - sw / 2, 0, im.width - sw), clamp((s.cy ?? 0.45) * im.height - sh / 2, 0, im.height - sh), sw, sh] as const; };
        c.filter = `blur(28px) brightness(0.32) saturate(${L.sat ?? 0.82})`;
        { const [sx, sy, sw, sh] = cover(FULL, z * 1.05); c.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); }
        const r = { x: 0, y: 290, w: W, h: (W * 3) / 4 };
        c.filter = `saturate(${L.sat ?? 0.82}) contrast(${L.contrast ?? 1.08}) brightness(${1 - (L.dim ?? 0)})`;
        { const [sx, sy, sw, sh] = cover(r, z); c.drawImage(im, sx, sy, sw, sh, r.x, r.y, r.w, r.h); }
        c.filter = 'none';
        comp.draw(renderer, this.pic.upload(), out);
        return r;
      }
      const A = dst.w / dst.h, ia = im.width / im.height;
      let sw = im.width, sh = im.height;
      if (ia > A) sw = sh * A; else sh = sw / A;
      sw /= z; sh /= z;
      const sx = clamp((s.cx ?? 0.5) * im.width - sw / 2, 0, im.width - sw), sy = clamp((s.cy ?? 0.45) * im.height - sh / 2, 0, im.height - sh);
      c.filter = `saturate(${L.sat ?? 0.82}) contrast(${L.contrast ?? 1.08}) brightness(${1 - (L.dim ?? 0)})`;
      c.drawImage(im, sx, sy, sw, sh, dst.x, dst.y, dst.w, dst.h);
      c.filter = 'none';
      comp.draw(renderer, this.pic.upload(), out);
      return dst;
    }
    const clip = this.clips.get(s.clip!)!;
    if (s.win === 'band' && VERTICAL && dst === FULL) {
      // 9:16 technique shots: a 4:3 window across the frame, wide enough that nothing of the technique is cropped
      // away (frame it with cx/cy/z), over a blurred, dimmed copy of itself
      this.foot.draw(renderer, out, clip, FULL, { cx: s.cx ?? 0.5, cy: 0.5, zoom: z * 1.05, blur: 0.09, ...L, dim: 0.66, vig: 0.9 });
      const h = (W * 3) / 4, r = { x: 0, y: 290, w: W, h };   // 4:3 across the frame, above the caption lane
      this.foot.draw(renderer, out, clip, r, { cx: s.cx ?? 0.5, cy: s.cy ?? 0.5, zoom: z, ...L });
      return r;
    }
    if (s.win === 'scope') {
      const r = dst === FULL ? SCOPE : { x: dst.x, y: dst.y + (dst.h - dst.w / 2.58) / 2, w: dst.w, h: dst.w / 2.58 };
      // 9:16: the letterbox band sits over a blurred, dimmed copy of the same shot instead of black bars
      if (VERTICAL && dst === FULL) this.foot.draw(renderer, out, clip, FULL, { cx: s.cx ?? 0.5, cy: 0.5, zoom: z * 1.05, blur: 0.09, ...L, dim: 0.66, vig: 0.9 });
      this.foot.draw(renderer, out, clip, r, { cx: s.cx ?? 0.5, cy: s.cy ?? 0.5, zoom: z, ...L });
      return r;
    }
    // (fill: crop a portrait clip to the landscape frame instead, e.g. wide phone gym shots with small figures)
    if (clip.height > clip.width && dst.w > dst.h && !s.fill) {
      // vertical phone footage: blurred, dimmed copy fills the frame, the sharp 9:16 window in the middle
      this.foot.draw(renderer, out, clip, dst, { cx: 0.5, cy: s.cy ?? 0.45, zoom: z * 1.05, blur: 0.08, ...L, dim: 0.62, vig: 0.9 });
      const h = dst.h, w = (h * 9) / 16;
      const r = { x: dst.x + (dst.w - w) / 2, y: dst.y, w, h };
      this.foot.draw(renderer, out, clip, r, { cx: 0.5, cy: s.cy ?? 0.5, zoom: z, ...L });
      return r;
    }
    // (9:16: landscape footage is centre-cropped to the portrait frame; `vcx` moves that crop)
    this.foot.draw(renderer, out, clip, dst, { cx: (VERTICAL ? s.vcx : undefined) ?? s.cx ?? 0.5, cy: s.cy ?? 0.5, zoom: z, ...L });
    return dst;
  }
}

// ------------------------------------------------------------------ chrome

/** Chapter label, top-left: a red tick, the number and title in Plex Mono, wiping on as the plate opens. */
export function drawChapter(c: CanvasRenderingContext2D, t: number, t0: number, text: string) {
  const k = prog(t, t0 + 0.1, t0 + 0.6, ease.outCubic);
  const out = 1 - prog(t, t0 + 4.2, t0 + 4.8, ease.inCubic);
  const a = k * out;
  if (a <= 0) return;
  const [num, ...rest] = text.split(/\s{2,}/);
  c.save();
  c.globalAlpha = a;
  const X = VERTICAL ? 60 : 72, Y = VERTICAL ? 150 : 64;
  c.fillStyle = rgba('signal'); c.fillRect(X, Y, 6, 34);
  c.font = font(MONO_B, 24); c.letterSpacing = '4px'; c.textBaseline = 'middle';
  c.fillStyle = rgba('signal'); c.fillText(num ?? '', X + 24, Y + 18);
  const nw = c.measureText(num ?? '').width;
  c.fillStyle = rgba('bone', 0.92);
  const title = rest.join(' ');
  const shown = title.slice(0, Math.round(title.length * prog(t, t0 + 0.25, t0 + 0.9)));
  c.fillText(shown, X + 24 + nw + 18, Y + 18);
  c.restore();
}


/** Keyword pop card (on camera): carbon card, red rule, heavy cream word + mono sub. Slides in on its word. */
export function drawPop(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, p: { t: number; text: string; sub?: string }, until: number, at: { x: number; y: number } = VERTICAL ? { x: 60, y: 990 } : { x: 96, y: 770 }) {
  const k = prog(t, p.t - 0.05, p.t + 0.35, ease.outExpo);
  const o = 1 - prog(t, until - 0.35, until - 0.05, ease.inCubic);
  const a = k * o;
  if (a <= 0) return;
  // the card never reaches past the left third (x <= 856 at 16:9), so it stays clear of
  // long words scale the type down instead of growing the card
  const MAXW = VERTICAL ? W - 120 : 760;
  c.save();
  c.font = font(HEAVY, 78); c.letterSpacing = '-1px';
  const tw0 = c.measureText(p.text).width;
  c.font = font(MONO_B, 22); c.letterSpacing = '5px';
  const sw0 = p.sub ? c.measureText(p.sub).width : 0;
  const s = Math.min(1, (MAXW - 64) / Math.max(tw0, sw0, 1));
  const big = 78 * s, small = Math.max(16, 22 * s);
  const w = Math.max(tw0, sw0) * s + 64, h = p.sub ? 150 : 112;
  const x = at.x - (1 - k) * 60, y = at.y;
  c.globalAlpha = a * 0.9;
  c.fillStyle = rgba('ink', 0.86); rr(c, x, y, w, h, 6); c.fill();
  c.globalAlpha = a;
  c.fillStyle = rgba('signal'); c.fillRect(x, y, 7, h);
  c.font = font(HEAVY, big); c.letterSpacing = '-1px'; c.textBaseline = 'alphabetic';
  c.fillStyle = rgba('bone'); c.fillText(p.text, x + 34, y + 58 + big * 0.36);
  if (p.sub) { c.font = font(MONO_B, small); c.letterSpacing = '5px'; c.fillStyle = rgba('signal'); c.fillText(p.sub, x + 36, y + 126); }
  c.restore();
  g.save(); g.globalAlpha = a * 0.35; g.fillStyle = rgba('signal'); g.fillRect(x, y, 7, h); g.restore();
}


/** B-roll tag: big heavy word + mono sub, lower-left above the captions; `x` strikes a red cross through it. */
export function drawTag(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, p: { t: number; text: string; sub?: string; x?: boolean }, until: number) {
  const k = prog(t, p.t - 0.05, p.t + 0.4, ease.outExpo), o = 1 - prog(t, until - 0.3, until - 0.05);
  const a = k * o;
  if (a <= 0) return;
  const x = VERTICAL ? 60 : 96, y = VERTICAL ? 1080 : 760;
  c.save();
  c.globalAlpha = a;
  c.font = font(WIDE, VERTICAL ? 84 : 96); c.letterSpacing = '-2px'; c.textBaseline = 'alphabetic';
  if (VERTICAL && c.measureText(p.text).width > W - 120) c.font = font(WIDE, Math.floor((84 * (W - 120)) / c.measureText(p.text).width));
  const tw = c.measureText(p.text).width;
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 30;
  c.fillStyle = rgba('bone'); c.fillText(p.text, x + (1 - k) * -50, y);
  c.shadowBlur = 0;
  c.fillStyle = rgba('signal'); c.fillRect(x, y + 22, 120 * k + (tw - 120) * prog(t, p.t + 0.2, p.t + 0.8, ease.outCubic), 6);
  if (p.sub) { c.font = font(MONO_B, 24); c.letterSpacing = '5px'; c.fillStyle = rgba('bone', 0.9); c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 16; c.fillText(p.sub, x + 2, y + 70); }
  c.restore();
  if (p.x) {
    const s = prog(t, p.t + 0.7, p.t + 1.0, ease.outExpo);
    if (s > 0) for (const L of [c, g]) {
      L.save(); L.globalAlpha = a * (L === g ? 0.6 : 1); L.strokeStyle = rgba('signal'); L.lineWidth = 12; L.lineCap = 'round';
      L.beginPath(); L.moveTo(x - 10, y - 70); L.lineTo(x - 10 + (tw + 20) * s, y - 70 + 90 * s); L.stroke();
      L.restore();
    }
  }
}

/** Stacked word list, left: each item lands on its word; the newest is red, the rest cream. */
export function drawStack(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, s: { kicker?: string; items: { t: number; text: string }[] }, until: number) {
  const o = 1 - prog(t, until - 0.3, until - 0.05);
  if (o <= 0) return;
  const n = s.items.length, size = (n > 4 ? 64 : 76) * (VERTICAL ? 1.1 : 1), lh = size * 1.08;
  const y0 = (VERTICAL ? 380 : 560) - (n * lh) / 2;
  const X = VERTICAL ? 60 : 100;
  c.save();
  c.textBaseline = 'alphabetic';
  if (s.kicker) {
    const k = prog(t, s.items[0]!.t - 0.6, s.items[0]!.t - 0.2, ease.outCubic);
    c.globalAlpha = o * k; c.font = font(MONO_B, 24); c.letterSpacing = '6px'; c.fillStyle = rgba('signal');
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 14; c.fillText(s.kicker, X, y0 - 30);
  }
  let cur = -1; s.items.forEach((it, i) => { if (t >= it.t - 0.05) cur = i; });
  s.items.forEach((it, i) => {
    const k = prog(t, it.t - 0.05, it.t + 0.3, ease.outExpo);
    if (k <= 0) return;
    const y = y0 + lh * (i + 1);
    for (const L of i === cur ? [c, g] : [c]) {
      L.save(); L.globalAlpha = o * k * (L === g ? 0.5 : 1);
      L.font = font(HEAVY, size); L.letterSpacing = '-1px'; L.textBaseline = 'alphabetic';
      L.shadowColor = 'rgba(0,0,0,0.85)'; L.shadowBlur = L === c ? 24 : 0;
      L.fillStyle = i === cur ? rgba('signal') : rgba('bone', 0.93);
      if (VERTICAL && L === c) {
        // 9:16: the stack often sits over bright footage: a dark backing pill keeps every label legible
        const tw = L.measureText(it.text).width;
        L.save(); L.shadowBlur = 0; L.fillStyle = rgba('ink', 0.72);
        rr(L, X - 14 - (1 - k) * 40, y - size * 0.82, tw + 28, size * 1.0, 8); L.fill(); L.restore();
      }
      L.fillText(it.text, X - (1 - k) * 40, y);
      L.restore();
    }
  });
  c.restore();
}

/** A quiet lifeline (an ECG line) along the bottom of a graphic plate. */
export function lifeline(lb: LineBatch, t: number, t0: number, gain: (t: number) => number, o: { y?: number; calm?: (t: number) => number; slams?: { t: number; amp: number }[]; intensity?: number; bpm?: number } = {}) {
  drawLifeline(lb, t, { y: o.y ?? 1030, amp: 26, speed: 420, t0, intensity: o.intensity ?? 0.55, bpm: o.bpm ?? 68, gain, calm: o.calm, slams: o.slams });
}

/** Corner brackets (red) around a rect, drawn on as k goes 0..1. */
export function brackets(c: CanvasRenderingContext2D, r: Rect, k: number, L = 44, col = 'signal', lw = 4) {
  if (k <= 0) return;
  c.save(); c.strokeStyle = rgba(col); c.lineWidth = lw; c.globalAlpha = Math.min(1, k * 1.5);
  const m = (1 - k) * 24;
  for (const [x, y, sx, sy] of [[r.x - m, r.y - m, 1, 1], [r.x + r.w + m, r.y - m, -1, 1], [r.x - m, r.y + r.h + m, 1, -1], [r.x + r.w + m, r.y + r.h + m, -1, -1]] as const) {
    c.beginPath(); c.moveTo(x + sx * L, y); c.lineTo(x, y); c.lineTo(x, y + sy * L); c.stroke();
  }
  c.restore();
}

export const lin = (k: keyof typeof LIN, m = 1): [number, number, number] => [LIN[k][0] * m, LIN[k][1] * m, LIN[k][2] * m];
export { rr };

// ------------------------------------------------------------------ 9:16 reel chrome

/**
 * Reel karaoke captions : the whole line shows in cream as it starts, the current
 * CONTENT word snaps to red at 1.1x on its spoken time (function words never recolour, so the red marches across
 * the meaningful words), numerals always count as content. Lines hard-cut to the next (never crossfade).
 * Archivo 800 @ 86 px, at most two rows, centred on the lane y.
 */
export class Karaoke {
  blocks: { rows: Word[][]; size: number }[];
  constructor(public lines: Line[], c: CanvasRenderingContext2D, public size = 86, public maxW = 940, public family = BOLD) {
    this.blocks = lines.map((l) => fitBlock(c, l.words, { family }, size, maxW, 2, 60));
  }
  draw(c: CanvasRenderingContext2D, t: number, x: number, y: number, g?: CanvasRenderingContext2D, alpha = 1) {
    // caption state holds per OUTPUT frame (30 fps): motion-blur sub-frames must never straddle a line change
    t = Math.round(t * 30) / 30;
    let i = -1;
    this.lines.forEach((l, j) => { if (l.start - 0.05 <= t) i = j; });
    if (i < 0) return;
    const l = this.lines[i]!, b = this.blocks[i]!;
    const a = alpha * prog(t, l.start - 0.05, l.start + 0.03) * (1 - prog(t, l.end + 0.8, l.end + 1.0));
    if (a <= 0) return;
    const lh = b.size * 1.12, top = y - (lh * b.rows.length) / 2;
    const isContent = (w: Word) => /\d/.test(w.w) || !FUNCTION_WORDS.has(norm(w.w));
    c.save();
    c.font = font(this.family, b.size); c.letterSpacing = '-1px'; c.textBaseline = 'alphabetic';
    const sp = Math.max(c.measureText(' ').width, b.size * 0.3);
    b.rows.forEach((row, ri) => {
      const ws = row.map((w) => c.measureText(w.w).width);
      let xx = x - (ws.reduce((p, q) => p + q, 0) + sp * (row.length - 1)) / 2;
      const yy = top + lh * ri + b.size * 0.8;
      row.forEach((w, wi) => {
        // current = from its start until the NEXT word starts (one red word at a time); the line's last word holds
        const all = l.words, k = all.indexOf(w), next = all[k + 1]?.start ?? w.end + 0.3;
        const cur = isContent(w) && t >= w.start && t < next;
        // 1.1x pop, capped at ~14 px of growth per side so a long word never eats the space to its neighbour
        const s = cur ? lerp(1, 1 + Math.min(0.1, 28 / Math.max(1, ws[wi]!)), prog(t, w.start, w.start + 0.06)) : 1;
        for (const L of cur && g ? [c, g] : [c]) {
          L.save(); L.globalAlpha = a * (L === g ? 0.55 : 1);
          L.font = font(this.family, b.size); L.letterSpacing = '-1px'; L.textBaseline = 'alphabetic';
          if (L === c) { L.shadowColor = 'rgba(0,0,0,0.85)'; L.shadowBlur = 22; }
          L.fillStyle = cur ? rgba('signal') : rgba('bone');
          L.translate(xx + ws[wi]! / 2, yy); L.scale(s, s); L.fillText(w.w, -ws[wi]! / 2, 0);
          L.restore();
        }
        xx += ws[wi]! + sp;
      });
    });
    c.restore();
  }
}


/** The thin red progress hairline along the very top of a reel (the top is clear of the IG UI). */
export function drawProgress(c: CanvasRenderingContext2D, t: number, dur: number) {
  c.save(); c.fillStyle = rgba('signal', 0.95); c.fillRect(0, 0, W * clamp(t / dur), 6); c.restore();
}
