// Shared kit: captions, wipes, word layout and a flow line.
// Modelled on _style.ts:
//  - BG: Deep Navy with a soft indigo/purple field (the brand "orb"), a structured grid whose major
//    intersections carry faint nodes that twinkle (the workflow-map motif), slow drift.
//  - FLOW: the through-line . A workflow line that grows node by node
//    with the story: each plate adds one node (the segment draws to it with a spark at its head, the node
//    pops), the map pans to keep the head in view, and at the resolve beat the whole line lights up from
//    first node to last and settles violet. Orthogonal routing (right-angle turns) like a workflow diagram.
//  - SAY: word-pop type in Inter. Words rise in on their spoken time; the current content word turns violet
//    (with glow); at most ONE word per plate is amber (brand rule: amber = the single thing that matters).
//  - CHROME: the tile frame
//    (indigo corner brackets with nodes, hairlines running out to the grid).
//  - WIPE: the designed transition: a glowing indigo scan line with a node at its head sweeps across and
//    reveals the incoming plate over the outgoing one (handlesTransition, f.under).
import * as THREE from 'three';
import { FSPass, W, H, VERTICAL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { norm, type Word, type Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog, hash } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';

export const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'as', 'and', 'is', 'i', 'it', 'that', 'this', 'but', 'so', 'for', 'on', 'my', 'me', 'or', 'we', 'you', 'be', 'if', 'what', 'who', 'when', 'was', 'am', 'did', 'has', 'have', 'into', 'than', 'with', 'he', 'his', 'from', 'these', 'their', 'then', 'there', "i'm", "i'd", "don't", 'how', 'going', 'get', 'got', 'had', 'were', 'are', 'about', 'all', 'once']);

export const INTER = (wt = 800) => F.inter(wt);

// ------------------------------------------------------------------ background
export const BG_GLSL = /* glsl */ `
  uniform vec2 uOrb; uniform float uOrbR, uOrbK, uGrid, uDim, uHit, uTime; uniform vec2 uDrift;
  void main() {
    vec2 px = vec2(FRAG_PX.x, ${H.toFixed(1)} - FRAG_PX.y);
    vec2 p = (vUv - 0.5) * vec2(${(W / H).toFixed(4)}, 1.0);
    vec3 c = C_INK;
    // the brand field: indigo core, purple rim, soft and off-centre
    float d = length((px - uOrb) / ${H.toFixed(1)});
    c += C_SIGNAL * 0.022 * uOrbK * exp(-d * d / (uOrbR * uOrbR));
    c += C_BLOOD * 0.012 * uOrbK * exp(-d * d / (uOrbR * uOrbR * 3.2));
    c += C_INK2 * 0.22 * (1.0 - smoothstep(0.0, 1.1, length(p)));
    // structured grid: 54 px minor, 270 px major, nodes at the major crossings
    vec2 q = px + uDrift;
    vec2 g = abs(fract(q / 54.0 + 0.5) - 0.5) * 54.0;
    float minor = 1.0 - smoothstep(0.0, 1.0, min(g.x, g.y));
    vec2 G = abs(fract(q / 270.0 + 0.5) - 0.5) * 270.0;
    float major = 1.0 - smoothstep(0.0, 1.3, min(G.x, G.y));
    float node = 1.0 - smoothstep(1.6, 3.6, length(G));
    float fade = 1.0 - smoothstep(0.2, 1.05, length(p));
    c += C_ASH * (minor * 0.006 + major * 0.014) * uGrid * fade;
    vec2 cell = floor(q / 270.0 + 0.5);
    float h = hash12(cell + 17.0);
    float tw = 0.5 + 0.5 * sin(uTime * (0.9 + h) + h * 6.2831);
    c += mix(C_SIGNAL, C_EMBER, h) * node * uGrid * fade * (0.05 + 0.6 * tw * step(0.62, h));
    c += C_SIGNAL * uHit * 0.10 * (1.0 - smoothstep(0.0, 0.9, length(p)));
    c *= 1.0 - uDim;
    fragColor = vec4(c, 1.0);
  }`;

export function makeBG() {
  return new FSPass(BG_GLSL, {
    uOrb: { value: new THREE.Vector2(W * 0.72, H * 0.3) }, uOrbR: { value: 0.42 }, uOrbK: { value: 1 },
    uGrid: { value: 1 }, uDim: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 }, uDrift: { value: new THREE.Vector2() },
  });
}

/** Per-frame BG update: slow drift + orb breathing, all a function of t. */
export function bgFrame(bg: FSPass, t: number, o: { orbX?: number; orbY?: number; orbK?: number; hit?: number; dim?: number; grid?: number } = {}) {
  const u = bg.u;
  (u.uOrb!.value as THREE.Vector2).set((o.orbX ?? 0.72) * W + Math.sin(t * 0.21) * 40, (o.orbY ?? 0.3) * H + Math.cos(t * 0.17) * 30);
  u.uOrbK!.value = (o.orbK ?? 1) * (0.9 + 0.1 * Math.sin(t * 0.6));
  u.uTime!.value = t;
  (u.uDrift!.value as THREE.Vector2).set(t * 6, t * -3);
  u.uHit!.value = o.hit ?? 0; u.uDim!.value = o.dim ?? 0; u.uGrid!.value = o.grid ?? 1;
}

// ------------------------------------------------------------------ the flow (through-line)

export interface FlowOpts {
  nodes: number[];      // node times (one per plate; the first at 0)
  resolve: number;      // the resolve beat (the line lights up end to end)
  y?: number;           // band centre (px)
  spacing?: number;     // px between nodes
  amp?: number;         // vertical step of the route
  headX?: number;       // screen x the head is held at once the map pans
  intensity?: number;
  fadeOut?: number;     // 0..1
}

const FLOW_DEFAULT = VERTICAL ? { y: 1720, spacing: 200, amp: 56, headX: W * 0.66 } : { y: 960, spacing: 230, amp: 40, headX: W * 0.7 };

/** Map position of node k (orthogonal route: a few rows, like a workflow diagram). */
function nodePos(k: number, o: Required<Pick<FlowOpts, 'y' | 'spacing' | 'amp'>>) {
  const rows = [0, -1, -1, 0, 1, 1, 0, -1, 0, 1, 0, -1, 1, 0];
  return { x: 110 + k * o.spacing, y: o.y + rows[k % rows.length]! * o.amp };
}
/** Orthogonal route from node k-1 to k: across, then the step, then across. */
function route(a: { x: number; y: number }, b: { x: number; y: number }) {
  const m = (a.x + b.x) / 2;
  return [a, { x: m, y: a.y }, { x: m, y: b.y }, b];
}
function along(pts: { x: number; y: number }[], u: number) {
  const L: number[] = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const s = clamp(u) * L[L.length - 1]!;
  const out = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    if (L[i]! <= s) { out.push(pts[i]!); continue; }
    const k = (s - L[i - 1]!) / Math.max(1e-6, L[i]! - L[i - 1]!);
    out.push({ x: lerp(pts[i - 1]!.x, pts[i]!.x, k), y: lerp(pts[i - 1]!.y, pts[i]!.y, k) });
    break;
  }
  return out;
}

/** Draw the workflow line at time t into an additive 2D LineBatch. */
export function drawFlow(lb: LineBatch, t: number, opts: FlowOpts) {
  const o = { ...FLOW_DEFAULT, ...opts } as Required<FlowOpts> & typeof FLOW_DEFAULT;
  const I = (o.intensity ?? 1) * (1 - (o.fadeOut ?? 0));
  if (I <= 0.001) return;
  const GROW = 0.5;
  const N = o.nodes.length;
  // head: how far the map has grown (node index, fractional), and the pan that keeps it in view
  let head = 0;
  for (let k = 1; k < N; k++) head = Math.max(head, k - 1 + prog(t, o.nodes[k]! - GROW, o.nodes[k]!, ease.inOutCubic));
  const headPos = nodePos(Math.floor(head), o);
  const nextPos = nodePos(Math.min(N - 1, Math.floor(head) + 1), o);
  const hx = lerp(headPos.x, nextPos.x, head - Math.floor(head));
  const pan = Math.max(0, hx - o.headX);
  const res = prog(t, o.resolve, o.resolve + 1.4, ease.outCubic); // resolve ripple 0..1 along the line
  const resolved = t >= o.resolve;
  const col = (k: number, a: number): [number, number, number] => {
    // indigo; the resolve ripple runs white-violet along the line, then it settles violet
    const rk = resolved ? clamp((res * (N + 1) - k) * 1.2) : 0;
    const flash = rk > 0 ? Math.max(0, 1 - Math.abs(res * (N + 1) - k - 0.5)) : 0;
    const base = LIN.signal.map((v, i) => lerp(v, LIN.acid[i]!, rk)) as [number, number, number];
    return base.map((v) => (v * (2.2 + 2.5 * flash) + 0.35 * flash) * a) as [number, number, number];
  };
  // the planned route: the whole map, faint and dashed, so the line visibly grows over it
  for (let k = 1; k < N; k++) {
    const pts = route(nodePos(k - 1, o), nodePos(k, o)).map((p) => ({ x: p.x - pan, y: p.y }));
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!, q = pts[i]!, L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(1, Math.floor(L / 14));
      for (let j = 0; j < n; j += 2) {
        const a0 = j / n, a1 = Math.min(1, (j + 1) / n);
        const x0 = lerp(p.x, q.x, a0), x1 = lerp(p.x, q.x, a1);
        if (Math.max(x0, x1) < -20 || Math.min(x0, x1) > W + 20) continue;
        lb.seg2(x0, lerp(p.y, q.y, a0), x1, lerp(p.y, q.y, a1), 1.4, [LIN.ash[0] * 0.45, LIN.ash[1] * 0.45, LIN.ash[2] * 0.45], 0.6 * I);
      }
    }
    const np = nodePos(k, o);
    if (t < o.nodes[k]! - 0.02) ring(lb, np.x - pan, np.y, 5, 1, [LIN.ash[0] * 0.3, LIN.ash[1] * 0.3, LIN.ash[2] * 0.3], 0.6 * I, 16);
  }
  let headPt: { x: number; y: number } | null = null;
  for (let k = 1; k < N; k++) {
    const g = prog(t, o.nodes[k]! - GROW, o.nodes[k]!, ease.inOutCubic);
    if (g <= 0) break;
    const a = nodePos(k - 1, o), b = nodePos(k, o);
    const pts = along(route(a, b), g).map((p) => ({ x: p.x - pan, y: p.y }));
    const age = clamp((t - o.nodes[k]!) / 6);
    const alpha = (resolved ? 1 : lerp(1, 0.45, age)) * I;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!, q = pts[i]!;
      const c = col(k, 1);
      lb.seg2(p.x, p.y, q.x, q.y, 16, [c[0] * 0.2, c[1] * 0.2, c[2] * 0.2], 0.4 * alpha);
      lb.seg2(p.x, p.y, q.x, q.y, 3.4, c, alpha);
    }
    if (g < 1) headPt = pts[pts.length - 1]!;
  }
  // nodes: rings with violet cores; satellites hang off some of them (map texture)
  for (let k = 0; k < N; k++) {
    if (t < o.nodes[k]! - 0.02 && k > 0) break;
    const p = nodePos(k, o);
    const x = p.x - pan, y = p.y;
    if (x < -40 || x > W + 40) continue;
    const pop = prog(t, o.nodes[k]!, o.nodes[k]! + 0.35, ease.outBack);
    const pulse = Math.max(0, 1 - (t - o.nodes[k]!) / 0.9);
    const latest = k === N - 1 || t < o.nodes[k + 1]!;
    const a = (latest || resolved ? 1 : 0.6) * I;
    const c = col(k, 1);
    const r = 12 * pop * (resolved && k === N - 1 ? 1.5 : 1);
    ring(lb, x, y, r, 2.6, c, a);
    lb.seg2(x, y, x + 0.01, y, 8 * pop, [LIN.ember[0] * 3, LIN.ember[1] * 3, LIN.ember[2] * 3], a);
    if (pulse > 0 && k > 0) ring(lb, x, y, 9 + 26 * (1 - pulse), 1.4, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], pulse * 0.8 * I);
    if (hash(k, 7) > 0.45 && pop > 0.5) {
      const dir = hash(k, 3) > 0.5 ? 1 : -1, len = 34 + 30 * hash(k, 5);
      const sc = prog(t, o.nodes[k]! + 0.15, o.nodes[k]! + 0.5, ease.outCubic);
      lb.seg2(x, y + dir * r, x, y + dir * (r + len * sc), 1.2, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], a * 0.8);
      if (sc > 0.95) ring(lb, x, y + dir * (r + len + 4), 4, 1.2, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], a * 0.8);
    }
  }
  if (headPt) {
    sparkHead(lb, headPt.x, headPt.y, t, 0.6, I);
    sparkParticles(lb, t, (tb) => {
      let hh = 0;
      for (let k = 1; k < N; k++) hh = Math.max(hh, k - 1 + prog(tb, o.nodes[k]! - GROW, o.nodes[k]!, ease.inOutCubic));
      const kk = Math.floor(hh), f = hh - kk;
      if (f <= 0 || kk + 1 >= N) return null;
      const pts = along(route(nodePos(kk, o), nodePos(kk + 1, o)), f);
      const p = pts[pts.length - 1]!;
      return { x: p.x - pan, y: p.y };
    }, { rate: 40, life: 0.35, speed: 120, gravity: 60, intensity: 0.5 * I, width: 1.2 });
  }
}

export function ring(lb: LineBatch, x: number, y: number, r: number, w: number, c: [number, number, number], a: number, n = 28) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    lb.seg2(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r, w, c, a);
  }
}

// ------------------------------------------------------------------ type

export interface SayOpts {
  x: number; y: number; size: number;
  family?: string; align?: 'left' | 'center' | 'right'; upper?: boolean; tracking?: number;
  color?: string; accent?: string; alpha?: number;
  amber?: Set<string>;     // normalised words that turn amber once said (max one per plate)
  march?: boolean;         // the current content word turns violet
  rise?: number; lead?: number;
  glow?: CanvasRenderingContext2D; // also draw accented words here (additive glow layer)
}

const tokens = (w: Word, upper?: boolean) => (upper ? w.w.toUpperCase() : w.w);

/** A line of timed words, word-pop. Returns the drawn width. */
export function say(c: CanvasRenderingContext2D, words: Word[], t: number, o: SayOpts): number {
  const fam = o.family ?? INTER(800);
  c.save();
  c.font = font(fam, o.size);
  c.letterSpacing = `${o.tracking ?? -1}px`;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const space = c.measureText(' ').width;
  const widths = words.map((w) => c.measureText(tokens(w, o.upper)).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = o.align === 'left' ? o.x : o.align === 'right' ? o.x - total : o.x - total / 2;
  const lead = o.lead ?? 0.04;
  words.forEach((w, i) => {
    const k = prog(t, w.start - lead, w.start - lead + 0.24, ease.outCubic);
    if (k > 0) {
      const next = words[i + 1]?.start ?? w.end + 0.25;
      const n = norm(w.w);
      const content = !FUNCTION_WORDS.has(n);
      const current = (o.march ?? true) && content && t >= w.start && t < Math.max(next, w.end + 0.15);
      const amber = !!o.amber?.has(n) && t >= w.start;
      const col = amber ? 'amber' : current ? o.accent ?? 'ember' : o.color ?? 'bone';
      const s = lerp(1.07, 1, k);
      const y = o.y + (1 - k) * (o.rise ?? 16);
      for (const L of amber || current ? [c, o.glow] : [c]) {
        if (!L) continue;
        L.save();
        L.font = font(fam, o.size); L.letterSpacing = `${o.tracking ?? -1}px`; L.textBaseline = 'alphabetic'; L.textAlign = 'left';
        L.globalAlpha = (o.alpha ?? 1) * k * (L === c ? 1 : 0.7);
        L.fillStyle = rgba(col);
        L.translate(x + widths[i]! / 2, y); L.scale(s, s);
        L.fillText(tokens(w, o.upper), -widths[i]! / 2, 0);
        L.restore();
      }
    }
    x += widths[i]! + space;
  });
  c.restore();
  return total;
}

export function sayWidth(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'size' | 'family' | 'upper' | 'tracking'>) {
  c.save();
  c.font = font(o.family ?? INTER(800), o.size); c.letterSpacing = `${o.tracking ?? -1}px`;
  const space = c.measureText(' ').width;
  const w = words.reduce((a, w) => a + c.measureText(tokens(w, o.upper)).width, 0) + space * (words.length - 1);
  c.restore();
  return w;
}

export function wrapRows(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'size' | 'family' | 'upper' | 'tracking'>, maxW: number): Word[][] {
  const rows: Word[][] = []; let row: Word[] = [];
  for (const w of words) {
    const next = [...row, w];
    if (row.length && sayWidth(c, next, o) > maxW) { rows.push(row); row = [w]; } else row = next;
  }
  if (row.length) rows.push(row);
  return rows;
}

export function fitBlock(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'family' | 'upper' | 'tracking'>, size: number, maxW: number, maxRows: number, min = 44) {
  let s = size;
  for (;;) {
    const rows = wrapRows(c, words, { ...o, size: s }, maxW);
    const widest = Math.max(...rows.map((r) => sayWidth(c, r, { ...o, size: s })));
    if ((rows.length <= maxRows && widest <= maxW) || s <= min) return { rows, size: s };
    s *= 0.95;
  }
}

/** Rows of words centred on (x, y). Returns the block height. */
export function sayBlock(c: CanvasRenderingContext2D, rows: Word[][], t: number, o: SayOpts & { lineHeight?: number }) {
  const lh = o.size * (o.lineHeight ?? 1.1);
  const h = lh * rows.length;
  const top = o.y - h / 2;
  rows.forEach((r, i) => say(c, r, t, { ...o, y: top + lh * i + o.size * 0.78 }));
  return h;
}

/** Lines of the lyrics that start inside [t0, t1). */
export const linesIn = (ly: Lyrics, t0: number, t1: number): Line[] => ly.lines.filter((l) => l.start >= t0 - 0.01 && l.start < t1);

/** The caption block for the lines of a plate: current line only, cleared shortly after it ends. */
export class Captions {
  blocks: { rows: Word[][]; size: number }[] = [];
  constructor(public lines: Line[], c: CanvasRenderingContext2D, public o: { size: number; maxW: number; rows: number; family?: string; amber?: Set<string> }) {
    this.blocks = lines.map((l) => fitBlock(c, l.words, { family: o.family }, o.size, o.maxW, o.rows));
  }
  draw(c: CanvasRenderingContext2D, t: number, x: number, y: number, glow?: CanvasRenderingContext2D, alpha = 1) {
    let i = -1;
    this.lines.forEach((l, j) => { if (l.start - 0.05 <= t) i = j; });
    if (i < 0) return;
    const l = this.lines[i]!, b = this.blocks[i]!;
    const fade = 1 - prog(t, l.end + 0.9, l.end + 1.2);
    c.save();
    c.shadowColor = 'rgba(4,4,16,0.85)'; c.shadowBlur = 22;
    sayBlock(c, b.rows, t, { x, y, size: b.size, family: this.o.family, alpha: fade * alpha, amber: this.o.amber, glow });
    c.restore();
  }
}

// ------------------------------------------------------------------ chrome

let badge: HTMLImageElement | null = null;


export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Tile frame: indigo corner brackets with nodes at the corners and hairlines running out to the grid. */
export function drawTileFrame(lb: LineBatch, r: { x: number; y: number; w: number; h: number }, t: number, start: number) {
  const k = prog(t, start - 0.1, start + 0.45, ease.outCubic);
  if (k <= 0) return;
  const L = 52, m = 0, c: [number, number, number] = [LIN.signal[0] * 2.2, LIN.signal[1] * 2.2, LIN.signal[2] * 2.2];
  const corners: [number, number, number, number][] = [[r.x + m, r.y + m, 1, 1], [r.x + r.w - m, r.y + m, -1, 1], [r.x + m, r.y + r.h - m, 1, -1], [r.x + r.w - m, r.y + r.h - m, -1, -1]];
  for (const [x, y, sx, sy] of corners) {
    lb.seg2(x, y, x + sx * L * k, y, 3, c, 1);
    lb.seg2(x, y, x, y + sy * L * k, 3, c, 1);
    ring(lb, x, y, 6 * k, 1.6, c, 1, 18);
    // hairline out to the grid edge
    const ex = sx > 0 ? 0 : W;
    lb.seg2(x - sx * 8, y, lerp(x, ex, k), y, 1, [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25], 0.8);
  }
}

// ------------------------------------------------------------------ the wipe

/** Composites the outgoing plate over the incoming one, revealed behind a sweeping scan line. */
export class Wipe {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D tex; uniform float uEdge, uAngle;
    void main() {
      vec2 px = vec2(FRAG_PX.x, ${H.toFixed(1)} - FRAG_PX.y);
      float s = px.x + (px.y - ${(H / 2).toFixed(1)}) * uAngle;   // slanted sweep coordinate
      float k = smoothstep(uEdge - 2.0, uEdge + 2.0, s);            // 1 = still the old plate
      if (k <= 0.0) discard;
      vec4 c = texture(tex, vUv);
      fragColor = vec4(c.rgb, 1.0) * k;
    }`, { tex: { value: null }, uEdge: { value: 0 }, uAngle: { value: 0.18 } }, { blending: THREE.CustomBlending, transparent: true });
  lb = new LineBatch(800, { screen2D: true, blend: 'add' });
  constructor() {
    const m = this.pass.mat;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  /** Call at the end of a plate's render when f.under is set: tin 0..1 over the overlap. */
  draw(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, under: THREE.Texture | null, tin: number, t: number) {
    if (!under || tin >= 1) return;
    const angle = 0.18;
    const span = W + H * angle;
    const e = lerp(-H * angle * 0.5 - 40, W + H * angle * 0.5 + 40, ease.inOutCubic(tin));
    this.pass.u.tex!.value = under; this.pass.u.uEdge!.value = e; this.pass.u.uAngle!.value = angle;
    this.pass.render(renderer, out);
    // the scan line itself: a glowing indigo hairline with a node riding it
    this.lb.clear();
    const x0 = e - (0 - H / 2) * angle, x1 = e - (H - H / 2) * angle;
    const c: [number, number, number] = [LIN.signal[0] * 3, LIN.signal[1] * 3, LIN.signal[2] * 3];
    this.lb.seg2(x0, 0, x1, H, 14, [c[0] * 0.15, c[1] * 0.15, c[2] * 0.15], 0.6);
    this.lb.seg2(x0, 0, x1, H, 2.4, c, 1);
    const ny = H * (VERTICAL ? 0.62 : 0.55), nx = e - (ny - H / 2) * angle;
    ring(this.lb, nx, ny, 9, 2, c, 1);
    sparkHead(this.lb, nx, ny, t, 0.7, 1);
    this.lb.render(renderer, out);
    void span;
  }
}

// ------------------------------------------------------------------ numbers

/**
 * Frame time for anything that must hold still within one output frame (count-up digits): the export
 * averages up to 324 sub-frames per frame, and digits that change inside the shutter double-expose
 * ("19" over "20"). Rounded to the 25 fps output frame, every sub-frame of a frame shows the same value.
 */
export const frameT = (t: number) => Math.round(t * 25) / 25;

/** "$1.2B" style count-up: value at progress k, formatted with the given decimals and pre/suffix. */
export function countUp(k: number, to: number, o: { decimals?: number; pre?: string; suf?: string; comma?: boolean } = {}) {
  const v = to * ease.outExpo(clamp(k));
  const d = o.decimals ?? 0;
  let s = v.toFixed(d);
  if (o.comma) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${o.pre ?? ''}${s}${o.suf ?? ''}`;
}

/** Shared post look: re-tinted (halation is indigo-violet in post.ts). */
export const KIT_POST = { bloom: 0.55, halation: 0.32, grain: 0.06, vignette: 0.45, ca: 1.0 };
