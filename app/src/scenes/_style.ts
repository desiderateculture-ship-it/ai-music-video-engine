// Shared style kit: the pieces every plate uses, so the film reads as one system.
//  - LIFELINE: the red heartbeat trace that runs through the whole film. A scanning scope: the head
//    writes left to right, the phosphor fades behind it. Beats come from a steady rate plus "slams"
//    (big hits placed on words). Colour can blend red -> teal (calm) over time.
//  - SAY: word-pop text style. Words rise in on their spoken time; the current
//    content word turns red (function words never do), and `hot` words stay red.
//  - BG: carbon with a faint telemetry grid.
import { LineBatch } from '../engine/lines';
import { W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { norm, type Line, type Word, type Lyrics } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { sparkHead } from './_motifs';

export const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'as', 'and', 'is', 'i', 'it', 'that', 'this', 'but', 'so', 'for', 'on', 'my', 'me', 'or', 'we', 'you', 'be', 'if', 'what', 'who', 'when', 'was', 'am', 'did', 'has', 'have', 'into', 'than', 'see']);

export const BG_GLSL = /* glsl */ `
  uniform float uGrid; uniform float uDim; uniform float uWarm;
  void main() {
    vec2 px = FRAG_PX;
    vec2 p = (vUv - 0.5) * vec2(${(W / H).toFixed(4)}, 1.0);
    float r = length(p);
    vec3 c = C_INK + C_INK2 * 0.65 * (1.0 - smoothstep(0.0, 0.95, r));
    c += C_BLOOD * uWarm * 0.08 * (1.0 - smoothstep(0.0, 0.7, r));
    vec2 g = abs(fract(px / 60.0 + 0.5) - 0.5) * 60.0;
    float line = 1.0 - smoothstep(0.0, 1.1, min(g.x, g.y));
    vec2 G = abs(fract(px / 300.0 + 0.5) - 0.5) * 300.0;
    float major = 1.0 - smoothstep(0.0, 1.3, min(G.x, G.y));
    c += C_ASH * (line * 0.012 + major * 0.02) * uGrid * (1.0 - smoothstep(0.3, 1.0, r));
    c *= 1.0 - uDim;
    fragColor = vec4(c, 1.0);
  }`;

export function findWord(line: Line, q: string, nth = 0): Word {
  const n = norm(q);
  const w = line.words.filter((x) => norm(x.w) === n)[nth];
  if (!w) throw new Error(`word not found: ${q} in "${line.text}"`);
  return w;
}

/** First line whose text contains q, and a word in it. */
export function wordIn(ly: Lyrics, lineQ: string, wordQ: string, nth = 0): Word {
  return findWord(ly.get(lineQ), wordQ, nth);
}

/** Per-char [start,end] for words joined by single spaces (for typing or stroke writing). */
export function charTimes(words: Word[]): [number, number][] {
  const out: [number, number][] = [];
  words.forEach((w, wi) => {
    const n = w.w.length;
    for (let j = 0; j < n; j++) out.push([lerp(w.start, w.end, j / n), lerp(w.start, w.end, (j + 1) / n)]);
    if (wi < words.length - 1) out.push([w.end, w.end]);
  });
  return out;
}

// ------------------------------------------------------------------ the lifeline (ECG)

/** One heartbeat (PQRST) as a function of seconds from the R peak. Peak 1 at dt = 0. */
export function beatShape(dt: number): number {
  const g = (m: number, s: number, a: number) => a * Math.exp(-((dt - m) * (dt - m)) / (2 * s * s));
  return g(-0.15, 0.022, 0.12) + g(-0.028, 0.008, -0.14) + g(0, 0.009, 1) + g(0.032, 0.01, -0.3) + g(0.24, 0.045, 0.24);
}

export interface Slam { t: number; amp: number }

export interface LifelineOpts {
  y: number;               // baseline (px)
  amp: number;             // px per unit beat height
  bpm?: number;            // resting rate
  speed?: number;          // scan speed px/s
  x0?: number; x1?: number;
  slams?: Slam[];          // extra beats, on words
  gain?: (t: number) => number;   // beat height multiplier over time (e.g. the voice)
  calm?: (t: number) => number;   // 0 red .. 1 teal
  intensity?: number;
  t0?: number;             // scene start: nothing is drawn from before it
  noise?: number;
}

/** The trace's height at time tx (before scaling): regular beats + slams. */
export function lifeValue(tx: number, o: LifelineOpts): number {
  const period = 60 / (o.bpm ?? 72);
  const k = Math.round(tx / period);
  let v = 0;
  for (let i = k - 1; i <= k + 1; i++) v += beatShape(tx - i * period);
  v *= o.gain ? o.gain(tx) : 1;
  for (const s of o.slams ?? []) if (Math.abs(tx - s.t) < 0.5) v += s.amp * beatShape(tx - s.t);
  if (o.noise) v += o.noise * (Math.sin(tx * 71.3) * 0.5 + Math.sin(tx * 113.9) * 0.3);
  return v;
}

/**
 * A scanning scope trace. The head sits at x = x0 + ((t - t0) * speed) mod width; a point at screen x
 * shows the value from when the head passed it. Old trace fades (phosphor); a small gap runs ahead of
 * the head. Draws a wide dim glow pass and a thin hot core into an additive 2D LineBatch.
 */
export function drawLifeline(lb: LineBatch, t: number, o: LifelineOpts) {
  const x0 = o.x0 ?? 0, x1 = o.x1 ?? W, wdt = x1 - x0, speed = o.speed ?? 480, t0 = o.t0 ?? 0;
  const I = o.intensity ?? 1;
  if (I <= 0.001) return;
  const travelled = (t - t0) * speed;
  const head = x0 + (travelled % wdt);
  const step = 3;
  let prev: { x: number; y: number; a: number; c: [number, number, number] } | null = null;
  for (let s = 0; s <= wdt; s += step) {
    const back = s; // px behind the head
    const age = back / speed;
    if (age > travelled / speed) break;
    if (back > wdt - 40) break; // the erase gap ahead of the head
    const tx = t - age;
    const x = head - back < x0 ? head - back + wdt : head - back;
    const y = o.y - lifeValue(tx, o) * o.amp;
    const fade = Math.pow(1 - back / wdt, 1.6);
    const calm = o.calm ? clamp(o.calm(tx)) : 0;
    const c: [number, number, number] = [lerp(LIN.signal[0], LIN.acid[0], calm), lerp(LIN.signal[1], LIN.acid[1], calm), lerp(LIN.signal[2], LIN.acid[2], calm)];
    const cur = { x, y, a: fade, c };
    if (prev && Math.abs(prev.x - x) < step * 2) {
      const a = prev.a * I;
      lb.seg2(prev.x, prev.y, x, y, 9, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 0.22 * a);
      lb.seg2(prev.x, prev.y, x, y, 2.4, [c[0] * 3.2 + 0.25 * a, c[1] * 3.2 + 0.12 * a, c[2] * 3.2 + 0.1 * a], a);
    }
    prev = cur;
  }
  if (travelled > 0) sparkHead(lb, head, o.y - lifeValue(t, o) * o.amp, t, 0.8, I);
}

// ------------------------------------------------------------------ word-pop text

export interface SayOpts {
  x: number; y: number;          // anchor (baseline)
  size: number;
  family?: string;
  align?: 'left' | 'center' | 'right';
  upper?: boolean;
  tracking?: number;
  color?: string;                // palette key or css
  accent?: string;
  alpha?: number;
  hot?: Set<string>;             // words (normalised) that stay red once said
  march?: boolean;               // current content word turns red (default true)
  rise?: number;                 // px the word rises in by
  lead?: number;                 // show words this many s early (0 = on the word)
}

/** Draw a line of timed words. Returns the drawn width. */
export function say(c: CanvasRenderingContext2D, words: Word[], t: number, o: SayOpts): number {
  const fam = o.family ?? F.archivo(100, 800);
  c.save();
  c.font = font(fam, o.size);
  c.letterSpacing = `${o.tracking ?? 0}px`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const txt = (w: Word) => (o.upper ? w.w.toUpperCase() : w.w);
  const space = c.measureText(' ').width;
  const widths = words.map((w) => c.measureText(txt(w)).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = o.align === 'left' ? o.x : o.align === 'right' ? o.x - total : o.x - total / 2;
  const lead = o.lead ?? 0.04;
  words.forEach((w, i) => {
    const k = prog(t, w.start - lead, w.start - lead + 0.22, ease.outCubic);
    if (k > 0) {
      const next = words[i + 1]?.start ?? w.end + 0.25;
      const n = norm(w.w);
      const content = !FUNCTION_WORDS.has(n);
      const current = (o.march ?? true) && content && t >= w.start && t < Math.max(next, w.end + 0.15);
      const hot = o.hot?.has(n) && t >= w.start;
      c.globalAlpha = (o.alpha ?? 1) * k;
      c.fillStyle = rgba(current || hot ? o.accent ?? 'signal' : o.color ?? 'bone');
      c.fillText(txt(w), x, o.y + (1 - k) * (o.rise ?? 14));
    }
    x += widths[i]! + space;
  });
  c.restore();
  return total;
}

/** Width a word list will take with these options (for layout). */
export function sayWidth(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'size' | 'family' | 'upper' | 'tracking'>): number {
  c.save();
  c.font = font(o.family ?? F.archivo(100, 800), o.size);
  c.letterSpacing = `${o.tracking ?? 0}px`;
  const space = c.measureText(' ').width;
  const w = words.reduce((a, w) => a + c.measureText(o.upper ? w.w.toUpperCase() : w.w).width, 0) + space * (words.length - 1);
  c.restore();
  return w;
}

/** Type a line character by character on its word timings (mono / terminal voice). */
export function typeOn(c: CanvasRenderingContext2D, words: Word[], t: number, o: { x: number; y: number; size: number; family?: string; color?: string; alpha?: number; align?: 'left' | 'center'; tracking?: number; caret?: boolean }) {
  const text = words.map((w) => w.w).join(' ');
  const ct = charTimes(words);
  let n = 0;
  for (let i = 0; i < ct.length; i++) if (t >= ct[i]![0]) n = i + 1;
  c.save();
  c.font = font(o.family ?? F.mono(400), o.size);
  c.letterSpacing = `${o.tracking ?? 2}px`;
  c.textBaseline = 'alphabetic';
  const full = c.measureText(text).width;
  const x = o.align === 'center' ? o.x - full / 2 : o.x;
  c.globalAlpha = o.alpha ?? 1;
  c.fillStyle = rgba(o.color ?? 'bone');
  const shown = text.slice(0, n);
  c.fillText(shown, x, o.y);
  if (o.caret !== false && n < text.length && n > 0) {
    const cx = x + c.measureText(shown).width + 3;
    c.fillStyle = rgba('signal', 0.9);
    c.fillRect(cx, o.y - o.size * 0.75, o.size * 0.5, o.size * 0.9);
  }
  c.restore();
}

/** Break words into rows no wider than maxW at this size (greedy). */
export function wrapRows(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'size' | 'family' | 'upper' | 'tracking'>, maxW: number): Word[][] {
  const rows: Word[][] = [];
  let row: Word[] = [];
  for (const w of words) {
    const next = [...row, w];
    if (row.length && sayWidth(c, next, o) > maxW) { rows.push(row); row = [w]; }
    else row = next;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Fit a line into at most maxRows rows of maxW, shrinking from `size` down to `min` if needed. */
export function fitBlock(c: CanvasRenderingContext2D, words: Word[], o: Pick<SayOpts, 'family' | 'upper' | 'tracking'>, size: number, maxW: number, maxRows: number, min = 48): { rows: Word[][]; size: number } {
  let s = size;
  for (;;) {
    const rows = wrapRows(c, words, { ...o, size: s }, maxW);
    const widest = Math.max(...rows.map((r) => sayWidth(c, r, { ...o, size: s })));
    if ((rows.length <= maxRows && widest <= maxW) || s <= min) return { rows, size: s };
    s *= 0.94;
  }
}

/** Draw rows of words centred on (x, cy): the block's visual centre. Returns the block height. */
export function sayBlock(c: CanvasRenderingContext2D, rows: Word[][], t: number, o: SayOpts & { lineHeight?: number }): number {
  const lh = o.size * (o.lineHeight ?? 1.08);
  const h = lh * rows.length;
  const top = o.y - h / 2;
  rows.forEach((r, i) => say(c, r, t, { ...o, y: top + lh * i + o.size * 0.8 }));
  return h;
}
