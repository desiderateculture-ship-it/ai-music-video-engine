// Music video plate (?piece=mv_<name>): the footage on the beat, with the lyric as the typography.
// params (from song_dgu/shots.py, every time already in song seconds):
//   shots [{t, clip, in, speed, cx, cy, z0, z1, win, look}]   see _pod.ts Media (a shot runs from t - 0.1)
//   text 'big' | 'getup' | 'karaoke' | 'none'
//     big     the current lyric line in huge type, word by word as it is sung (hot: words that stay red)
//     getup   GET / UP stacked and slammed on every sung "get up" (hits: [t, ...], soft: the quiet build)
//     karaoke the locked reel karaoke lane (fast verse lines)
//   ty      text centre y (big / getup)
//     rap     the verse: the karaoke look (Archivo 800, cream, current word red, the reel lane) but it rides the
//             beat: lines split at commas into ~5-word chunks, each word drops in as it is sung, the block pulses
//             on every beat
//     kinetic the opener: each word SLAMS in, justified to the frame width (short words huge), stacking down the
//             screen per phrase (split at commas); the current word red; impact + colour split on every word;
//             frame 0 shows the first phrase whole (the cover); stackMax splits long phrases, cap / maxH size it
//   kick    beat pulse on the frame (punch-in on every beat, harder on downbeats)
//   slam    t: the drop (red impact, flash, shake)   punch: [t] footage impacts (red grade pulse)
//   life    an ECG lifeline along the bottom    brackets: red corner brackets on the frame
//   style (Archivo is the default look): kfont / ktrack the kinetic face + tracking (em),
//     rfont / rupper / rtrack the rap lane face, katana: a white blade streak through the current kinetic word instead
//     of the red edge bars, petals: N blossom petals drifting over the footage
//   logo + logos [{t, out}]: a client's logo PNG (public/) SLAMS in at each t (logoY, logoW) instead of typed words
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { font } from '../engine/type';
import { norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, noise1, prog, pulse } from '../engine/util';
import { fitBlock, sayBlock, FUNCTION_WORDS } from './_style';
import { linesIn } from './_kit';
import { Media, PodPlate, brackets, lifeline, loadImg, drawLogo, HEAVY, WIDE, BOLD, CAP_Y } from './_pod';

export default class MvShot extends PodPlate {
  media!: Media;
  blocks: { line: Line; rows: Word[][]; size: number }[] = [];
  chunks: { words: Word[]; rows: Word[][]; size: number; start: number }[] = [];
  stacks: { words: Word[]; sizes: number[]; ys: number[]; start: number }[] = [];
  logo?: HTMLImageElement;
  get kf() { return this.ctx.params.kfont ?? WIDE; }
  get kt() { return this.ctx.params.ktrack ?? -0.04; }
  get rf() { return this.ctx.params.rfont ?? BOLD; }
  get rt() { return this.ctx.params.rtrack ?? -0.01; }
  rw(w: Word) { return this.ctx.params.rupper ? w.w.toUpperCase() : w.w; }

  /** The current word is CUT: a thin white blade streak slices diagonally through it on the hit (raspberry glow), then
   * thins and fades; alternate words cut the other way. */
  katana(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, w: Word, y: number, size: number, j: number, a: number) {
    const k = prog(t, w.start - 0.01, w.start + 0.09, ease.outExpo), f = 1 - prog(t, w.start + 0.12, w.start + 0.55);
    if (k <= 0 || f <= 0) return;
    const dir = j % 2 ? 1 : -1, x0 = -60, x1 = W + 60, y0 = y + dir * size * 0.42, y1 = y - dir * size * 0.42;
    for (const [L, col, wd, al] of [[g, 'signal', 26, 0.9], [c, 'bone', 7, 1]] as const) {
      L.save(); L.globalAlpha = a * al * f; L.strokeStyle = rgba(col); L.lineCap = 'round';
      L.lineWidth = wd * (1 - 0.7 * prog(t, w.start + 0.09, w.start + 0.55));
      L.beginPath(); L.moveTo(x0, y0); L.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); L.stroke(); L.restore();
    }
  }

  /** Raspberry blossom petals (his poster) drifting down and across, deterministic in t; a few in the glow layer. */
  petals(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, n: number) {
    for (let i = 0; i < n; i++) {
      const sp = 0.035 + 0.03 * ((i * 0.618) % 1), ph = (i * 0.381) % 1;
      const u = (ph + t * sp) % 1;                                  // 0..1 down the frame
      const x = ((i * 0.737) % 1) * W + 120 * Math.sin(t * 0.7 + i) - u * 160, y = -60 + u * (H + 120);
      const r = 9 + 9 * ((i * 0.293) % 1), rot = t * (0.8 + (i % 3) * 0.5) + i;
      for (const L of i % 4 === 0 ? [c, g] : [c]) {
        L.save(); L.translate(x, y); L.rotate(rot); L.scale(1, 0.55 + 0.3 * Math.sin(t * 2 + i));
        L.globalAlpha = (L === g ? 0.5 : 0.85) * (0.6 + 0.4 * ((i * 0.53) % 1));
        L.fillStyle = rgba(i % 3 ? 'signal' : 'ember');
        L.beginPath(); L.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2); L.fill(); L.restore();
      }
    }
  }

  override async setup() {
    const { params: p, start, end, lyrics } = this.ctx;
    this.captions = p.text === 'karaoke';
    this.media = new Media(p.shots, start, end);
    await this.media.load();
    if (p.logo) this.logo = await loadImg(p.logo);
    if (p.text === 'big') {
      for (const line of linesIn(lyrics, p.cut - 0.3, p.out - 0.05)) {
        const b = fitBlock(this.text.ctx, line.words, { family: HEAVY, upper: true, tracking: -3 }, p.size ?? 150, W - 130, 3, 70);
        this.blocks.push({ line, ...b });
      }
    }
    if (p.text === 'kinetic') {
      const c = this.text.ctx, MAXW = W - 110, CAP = p.cap ?? 400;
      for (const line of linesIn(lyrics, p.cut - 0.3, p.out - 0.05)) {
        const parts: Word[][] = [[]];
        line.words.forEach((w, i) => { parts[parts.length - 1]!.push(w); if (/,$/.test(w.w) && i < line.words.length - 1) parts.push([]); });
        // a phrase longer than stackMax words becomes several even stacks ("I GOT A MAN" / "IN MY CORNER")
        const max = p.stackMax ?? 99, stacks: Word[][] = [];
        for (const part of parts) { const n = Math.ceil(part.length / max), per = Math.ceil(part.length / n); for (let i = 0; i < part.length; i += per) stacks.push(part.slice(i, i + per)); }
        for (const ws of stacks) {
          c.font = font(this.kf, 100); c.letterSpacing = `${100 * this.kt}px`;
          const sizes = ws.map((w) => Math.min(CAP, (100 * MAXW) / c.measureText(this.kword(w)).width));
          const gap = 0.86, total = sizes.reduce((a, b) => a + b * gap, 0);
          const k = Math.min(1, (p.maxH ?? 1380) / total);   // a tall stack shrinks to fit
          let y = (p.ty ?? 900) - (total * k) / 2;
          const ys = sizes.map((sz) => { const yy = y + (sz * k * gap) / 2; y += sz * k * gap; return yy; });
          this.stacks.push({ words: ws, sizes: sizes.map((x) => x * k), ys, start: ws[0]!.start });
        }
      }
    }
    if (p.text === 'rap') {
      for (const line of linesIn(lyrics, p.cut - 0.3, p.out - 0.05)) {
        // split at commas, then into even chunks of at most 6 words (no orphans)
        const parts: Word[][] = [[]];
        line.words.forEach((w, i) => { parts[parts.length - 1]!.push(w); if (/,$/.test(w.w) && i < line.words.length - 2) parts.push([]); });
        for (const part of parts) {
          const n = Math.ceil(part.length / 6), per = Math.ceil(part.length / n);
          for (let i = 0; i < part.length; i += per) {
            const ws = part.slice(i, i + per);
            const b = fitBlock(this.text.ctx, ws, { family: this.rf, upper: !!p.rupper }, p.size ?? 104, W - 150, 2, 64);
            this.chunks.push({ words: ws, ...b, start: ws[0]!.start });
          }
        }
      }
    }
  }
  override dispose() { this.media.dispose(); }

  /** The drop: the hits that fall in the plate, plus its slam. */
  impact(t: number) {
    const p = this.ctx.params;
    let v = p.slam ? pulse(t, p.slam, 0.2) * 1.4 : 0;
    for (const h of (p.punch as number[] | undefined) ?? []) v = Math.max(v, pulse(t, h, 0.16));
    for (const L of (p.logos as { t: number }[] | undefined) ?? []) v = Math.max(v, pulse(t, L.t, 0.18) * 1.2);
    for (const st of this.stacks) for (const [j, w] of st.words.entries()) if (w.start <= t && t - w.start < 0.8) v = Math.max(v, pulse(t, w.start, 0.09) * (j === 0 ? 0.9 : 0.6));
    return v;
  }

  beatKick(t: number) {
    const { audio, params: p } = this.ctx;
    if (!p.kick) return 0;
    let v = 0;
    for (const b of audio.beats) if (b <= t && t - b < 0.6 && b >= p.cut - 0.01) v = Math.max(v, pulse(t, b, 0.07) * (audio.downbeats.includes(b) ? 1 : 0.55));
    return v * p.kick;
  }

  content(f: Frame, out: THREE.WebGLRenderTarget, c: CanvasRenderingContext2D, g: CanvasRenderingContext2D): PostOverrides {
    const { renderer, comp, params: p, audio } = this.ctx;
    const t = f.t;
    const imp = this.impact(t);
    const k = this.media.at(t);
    const cutKick = k > 0 ? pulse(t, this.media.shotStart(k), 0.1) : 0;
    this.media.draw(renderer, comp, out, t, { shade: p.text === 'karaoke' || p.text === 'rap' ? 0.55 : 0.25, hit: clamp(imp * 0.8), ...(p.look ?? {}) });

    if (p.brackets !== false) brackets(c, { x: 44, y: 44, w: W - 88, h: H - 88 }, prog(t, p.cut, p.cut + 0.35, ease.outCubic), 70, 'signal', 5);

    if (p.petals) this.petals(c, g, t, p.petals);
    // (cover: frame 0 shows that logo already landed: the Instagram thumbnail)
    if (this.logo) for (const L of (p.logos as { t: number; out?: number; cover?: boolean }[])) drawLogo(c, g, this.logo, L.cover && t < 1 / 60 ? L.t + 0.3 : t, L.t, { cx: W / 2, cy: p.logoY ?? 900, w: p.logoW ?? 900, out: L.out ?? L.t + 1.6 });
    if (p.text === 'big') this.drawBig(c, g, t);
    if (p.text === 'getup') this.drawGetUp(c, g, t);
    if (p.text === 'rap') this.drawRap(c, g, t);
    if (p.text === 'kinetic') this.drawKinetic(c, g, t);
    if (p.life) lifeline(this.lb, t, this.ctx.start, (x) => (p.life.flat ? 0.25 : 0.7) + 0.8 * audio.env('low', x), { y: p.life.y ?? 1660, intensity: 0.85, bpm: p.life.bpm ?? 72, slams: (p.life.slams ?? []).map((s: number) => ({ t: s, amp: 3.2 })) });

    const bk = this.beatKick(t);
    const sh = imp * 18 + bk * 5 + cutKick * 4;
    return {
      zoom: (1 + bk * 0.022 + imp * 0.05 + cutKick * 0.02),
      shake: [noise1(t * 40, 3) * sh, noise1(t * 40, 9) * sh],
      bloom: 0.42 + imp * 0.4, vignette: p.text === 'kinetic' ? 0.6 : 0.42, ca: 0.6 + imp * 7,
    };
  }

  drawBig(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number) {
    const p = this.ctx.params;
    t = Math.round(t * 30) / 30;   // line state per output frame (no motion-blur double exposure on a change)
    let i = -1;
    this.blocks.forEach((b, j) => { if (b.line.start - 0.06 <= t) i = j; });
    if (i < 0) return;
    const b = this.blocks[i]!;
    const nextStart = this.blocks[i + 1]?.line.start ?? Infinity;
    const a = 1 - prog(t, Math.min(nextStart - 0.06, b.line.end + 0.9), Math.min(nextStart - 0.02, b.line.end + 1.1));
    if (a <= 0) return;
    const hot = new Set(((p.hot as string[] | undefined) ?? []).map(norm));
    for (const [L, al] of [[c, 1], [g, 0.35]] as const) {
      L.save(); L.shadowColor = 'rgba(0,0,0,0.85)'; L.shadowBlur = L === c ? 34 : 0;
      sayBlock(L, b.rows, t, { x: W / 2, y: p.ty ?? 1380, size: b.size, family: HEAVY, upper: true, tracking: -3, rise: 30, lineHeight: 0.98, hot, alpha: a * al, march: p.march ?? true });
      L.restore();
    }
  }

  // (lyrics drop trailing punctuation; kpunct keeps it for captions: K.O. / FIGHT!)
  kword(w: Word) { return w.w.toUpperCase().replace(this.ctx.params.kpunct ? /,+$/ : /[.,!?]+$/, ''); }

  drawKinetic(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number) {
    const p = this.ctx.params;
    t = Math.round(t * 60) / 60;
    const cover = t < 1 / 60 && p.cut === 0 && p.kcover !== false;   // frame 0: the first phrase whole, the cover (kcover: false = the logo is the cover)
    let i = cover ? 0 : -1;
    if (!cover) this.stacks.forEach((st, j) => { if (st.start - 0.01 <= t) i = j; });
    if (i < 0) return;
    const st = this.stacks[i]!;
    const last = st.words[st.words.length - 1]!, next = this.stacks[i + 1]?.start ?? Infinity;
    const a = (1 - prog(t, Math.min(next - 0.03, last.end + 1.2), Math.min(next, last.end + 1.4))) * (1 - prog(t, p.out - 0.12, p.out - 0.02));
    if (a <= 0) return;
    let cur = -1; st.words.forEach((w, j) => { if (w.start - 0.01 <= t) cur = j; });
    st.words.forEach((w, j) => {
      const k = cover ? 1 : prog(t, w.start - 0.01, w.start + 0.11, ease.outExpo);
      if (k <= 0) return;
      const size = st.sizes[j]!, y = st.ys[j]!, isCur = !cover && j === cur;
      const s = lerp(1.75, 1, k);
      const jx = (j % 2 ? 1 : -1) * 10 * pulse(t, w.start, 0.06);
      for (const [L, al] of [[c, 1], [g, isCur ? 0.75 : 0.12]] as const) {
        L.save();
        L.globalAlpha = a * clamp(k * 4) * al;
        L.translate(W / 2 + jx, y); L.scale(s, s);
        L.font = font(this.kf, size); L.letterSpacing = `${size * this.kt}px`; L.textAlign = 'center'; L.textBaseline = 'middle';
        if (L === c) { L.shadowColor = 'rgba(0,0,0,0.9)'; L.shadowBlur = 50; }
        L.fillStyle = rgba(isCur || (cover && j === st.words.length - 1) ? 'signal' : 'bone');
        L.fillText(this.kword(w), 0, size * 0.04);
        L.restore();
      }
    });
    // a red slash rides the current word's left edge, cut in on the hit
    if (cur >= 0 && !cover && p.katana) this.katana(c, g, t, st.words[cur]!, st.ys[cur]!, st.sizes[cur]!, cur, a);
    else if (cur >= 0 && !cover) {
      const w = st.words[cur]!, size = st.sizes[cur]!, r = prog(t, w.start, w.start + 0.14, ease.outCubic);
      c.save(); c.globalAlpha = a; c.fillStyle = rgba('signal');
      c.fillRect(0, st.ys[cur]! - size * 0.34, 26 * r, size * 0.68); c.fillRect(W - 26 * r, st.ys[cur]! - size * 0.34, 26 * r, size * 0.68);
      c.restore();
    }
  }

  drawRap(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number) {
    const p = this.ctx.params;
    t = Math.round(t * 60) / 60;
    let i = -1;
    this.chunks.forEach((ch, j) => { if (ch.start - 0.01 <= t) i = j; });   // (never switch to a chunk before its first word shows)
    if (i < 0) return;
    const ch = this.chunks[i]!, next = this.chunks[i + 1]?.start ?? Infinity;
    const last = ch.words[ch.words.length - 1]!;
    const a = (1 - prog(t, Math.min(next - 0.04, last.end + 0.9), Math.min(next, last.end + 1.1))) * (1 - prog(t, p.out - 0.25, p.out - 0.05));
    if (a <= 0) return;
    const beat = this.beatKick(t) / (p.kick || 1);
    const S = ch.size, lh = S * 1.1, y0 = (p.ty ?? CAP_Y) - (lh * ch.rows.length) / 2;
    const isContent = (w: Word) => /\d/.test(w.w) || !FUNCTION_WORDS.has(norm(w.w));
    c.save(); c.font = font(this.rf, S); c.letterSpacing = `${S * this.rt}px`;
    const sp = Math.max(c.measureText(' ').width, S * 0.3);
    c.restore();
    ch.rows.forEach((row, ri) => {
      c.save(); c.font = font(this.rf, S); c.letterSpacing = `${S * this.rt}px`;
      const ws = row.map((w) => c.measureText(this.rw(w)).width);
      c.restore();
      let x = W / 2 - (ws.reduce((q, r) => q + r, 0) + sp * (row.length - 1)) / 2;
      const yy = y0 + lh * ri + S * 0.8;
      row.forEach((w, wi) => {
        const k = prog(t, w.start - 0.03, w.start + 0.16);
        if (k > 0) {
          const all = ch.words, n = all[all.indexOf(w) + 1]?.start ?? w.end + 0.35;
          const cur = isContent(w) && t >= w.start && t < n;
          // pop up into place with an overshoot; the whole block breathes on the beat
          const s = lerp(1.28, 1, ease.outBack(k, 2.2)) * (1 + 0.05 * beat);
          for (const L of cur ? [c, g] : [c]) {
            L.save(); L.globalAlpha = a * clamp(k * 2.5) * (L === g ? 0.55 : 1);
            L.font = font(this.rf, S); L.letterSpacing = `${S * this.rt}px`; L.textBaseline = 'alphabetic';
            if (L === c) { L.shadowColor = 'rgba(0,0,0,0.85)'; L.shadowBlur = 24; }
            L.fillStyle = rgba(cur ? 'signal' : 'bone');
            L.translate(x + ws[wi]! / 2, yy + (1 - k) * 18); L.scale(s, s); L.fillText(this.rw(w), -ws[wi]! / 2, 0);
            L.restore();
          }
        }
        x += ws[wi]! + sp;
      });
    });
  }

  drawGetUp(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number) {
    const p = this.ctx.params;
    const hits = p.hits as number[];
    t = Math.round(t * 60) / 60;
    let i = -1;
    hits.forEach((h, j) => { if (h - 0.02 <= t) i = j; });
    if (i < 0) return;
    const h = hits[i]!, gap = (hits[i + 1] ?? h + 0.45) - h;
    const tUp = h + Math.min(0.2, gap * 0.45);
    if (t > h + Math.max(0.6, gap) && !hits[i + 1]) return;   // the last one clears
    const soft = !!p.soft;
    const size = (soft ? 210 : 280) * (p.scale ?? 1);
    const kG = prog(t, h - 0.02, h + 0.12, ease.outExpo), kU = prog(t, tUp - 0.02, tUp + 0.12, ease.outExpo);
    const side = i % 2 ? 1 : -1;
    const y = p.ty ?? 960;
    const words: [string, number, number, string][] = [['GET', kG, y - size * 0.42, 'bone'], ['UP', kU, y + size * 0.52, 'signal']];
    for (const [txt, k, yy, col] of words) {
      if (k <= 0) continue;
      const s = lerp(soft ? 1.12 : 1.45, 1, k);
      for (const [L, al] of [[c, 1], [g, col === 'signal' ? 0.7 : 0.25]] as const) {
        L.save();
        L.globalAlpha = clamp(k * 3) * al * (soft ? 0.82 : 1);
        L.translate(W / 2 + side * 26 * (1 - k * 0.6), yy);
        L.rotate((side * (soft ? 0.6 : 1.8) * Math.PI) / 180);
        L.scale(s, s);
        L.font = font(WIDE, size); L.letterSpacing = '-8px'; L.textAlign = 'center'; L.textBaseline = 'middle';
        if (L === c) { L.shadowColor = 'rgba(0,0,0,0.8)'; L.shadowBlur = 40; }
        L.fillStyle = rgba(col);
        L.fillText(txt, 0, 0);
        L.restore();
      }
    }
    // a red rule under UP, drawn on with the word
    const r = prog(t, tUp, tUp + 0.25, ease.outCubic);
    if (r > 0 && !soft) { c.fillStyle = rgba('bone', 0.85); c.fillRect(W / 2 - 300 * r, y + size * 0.52 + size * 0.45, 600 * r, 6); }
  }

  override warm() { return 0; }
}
