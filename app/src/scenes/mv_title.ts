// Music video end title: DON'T / GIVE UP on carbon, the lifeline running underneath and going teal (recovered)
// as the music rings out; the plate fades to black (params.fade).
// params: lines [['DON\'T', 'bone'], ['GIVE UP', 'signal']], ty, lifeY, size, calmAt (s after the cut when the line turns teal)
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { font } from '../engine/type';
import { clamp, ease, lerp, noise1, prog, pulse } from '../engine/util';
import { PodPlate, lifeline, loadImg, drawLogo, WIDE } from './_pod';

export default class MvTitle extends PodPlate {
  override captions = false;
  logo?: HTMLImageElement;
  override async setup() { if (this.ctx.params.logo) this.logo = await loadImg(this.ctx.params.logo); }

  content(f: Frame, _out: THREE.WebGLRenderTarget, c: CanvasRenderingContext2D, g: CanvasRenderingContext2D): PostOverrides {
    const { params: p, audio } = this.ctx;
    const t = f.t, t0 = p.cut;
    const lines: [string, string][] = p.lines ?? [["DON'T", 'bone'], ['GIVE UP', 'signal']];
    if (p.kanji) {
      // the kanji, stacked vertically behind the title in deep crimson, wiped down from the cut
      const ks = Math.min(560, (H * 0.8) / [...p.kanji].length), kw = prog(t, t0 - 0.02, t0 + 0.5, ease.outCubic);
      c.save(); c.beginPath(); c.rect(0, 0, W, H * 0.1 + kw * H); c.clip();
      c.globalAlpha = 0.5; c.font = `900 ${ks}px "Yu Mincho", "MS Mincho", serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = rgba('blood');
      [...p.kanji].forEach((ch: string, i: number) => c.fillText(ch, W / 2, H / 2 + (i - ([...p.kanji].length - 1) / 2) * ks * 1.02));
      c.restore();
    }
    if (p.cross) {
      // an optional Orthodox-style cross (params.cross), drawn behind the title in deep blue, wiped down from the cut: an upright,
      // the short top bar (the inscription), the main bar, and the slanted foot bar (high on the left, low on the right, as the ☦ glyph draws it)
      const kw = prog(t, t0 - 0.02, t0 + 0.5, ease.outCubic), cx = W / 2, cy = (p.ty ?? 880), u = Math.min(W, H) * 0.06;
      c.save(); c.beginPath(); c.rect(0, 0, W, H * 0.1 + kw * H); c.clip();
      c.globalAlpha = 0.55; c.fillStyle = rgba('blood');
      c.fillRect(cx - u * 0.5, cy - u * 9, u, u * 18);                    // upright
      c.fillRect(cx - u * 2.2, cy - u * 6.8, u * 4.4, u * 0.9);           // top bar
      c.fillRect(cx - u * 4.2, cy - u * 4.3, u * 8.4, u * 1.1);           // main bar
      c.translate(cx, cy + u * 5.2); c.rotate(0.45); c.fillRect(-u * 3, -u * 0.5, u * 6, u * 1.0);   // foot bar
      c.restore();
    }
    c.font = font(p.font ?? WIDE, p.size ?? 250); c.letterSpacing = p.font ? '0px' : '-8px';
    const size = Math.min(p.size ?? 250, ((p.size ?? 250) * (W - 140)) / Math.max(...lines.map(([x]) => c.measureText(x).width))), y0 = (p.ty ?? 880) - ((lines.length - 1) * size * (p.gap ?? 0.95)) / 2;
    if (this.logo) {
      // a client's own logo instead of typed lines, a spaced-caps name above it (p.over)
      drawLogo(c, g, this.logo, t, t0, { cx: W / 2, cy: p.ty ?? 900, w: p.logoW ?? 920, glow: 0.2 });
      if (p.over) {
        const k = prog(t, t0 + 0.3, t0 + 0.7, ease.outCubic);
        if (k > 0) { c.save(); c.globalAlpha = k; c.font = font(p.overFont ?? 'BebasNeue', p.overSize ?? 60); c.letterSpacing = `${(p.overSize ?? 60) * 0.42}px`;
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = rgba('bone'); c.fillText(p.over, W / 2 + (p.overSize ?? 60) * 0.21, (p.ty ?? 900) - (p.logoW ?? 920) * 0.36 - 40); c.restore(); }
      }
    }
    if (!this.logo) lines.forEach(([txt, col], i) => {
      const ts = t0 + i * 0.28;
      const k = prog(t, ts - 0.02, ts + 0.3, ease.outExpo);
      if (k <= 0) return;
      for (const [L, al] of [[c, 1], [g, col === 'signal' ? 0.55 : 0.2]] as const) {
        L.save(); L.globalAlpha = clamp(k * 3) * al;
        L.translate(W / 2, y0 + i * size * (p.gap ?? 0.95)); L.scale(lerp(1.35, 1, k), lerp(1.35, 1, k));
        L.font = font(p.font ?? WIDE, size); L.letterSpacing = p.font ? '0px' : '-8px'; L.textAlign = 'center'; L.textBaseline = 'middle';
        L.fillStyle = rgba(col); L.fillText(txt, 0, 0);
        L.restore();
      }
    });
    if (p.slash) {
      // one katana stroke corner to corner through the title, on the second line's slam; it thins and fades out
      const ts = t0 + 0.28, k = prog(t, ts, ts + 0.12, ease.outExpo), fade = 1 - prog(t, ts + 0.5, ts + 1.4);
      if (k > 0 && fade > 0) {
        const yc = p.ty ?? 880, x0 = -40, y0s = yc + 260, x1 = W + 40, y1 = yc - 300;
        for (const [L, al, wd] of [[c, 1, 14], [g, 0.9, 30]] as const) {
          L.save(); L.globalAlpha = al * fade; L.strokeStyle = rgba(L === c ? 'bone' : 'signal'); L.lineCap = 'round';
          L.lineWidth = wd * (1 - 0.6 * prog(t, ts + 0.12, ts + 1.0));
          L.beginPath(); L.moveTo(x0, y0s); L.lineTo(lerp(x0, x1, k), lerp(y0s, y1, k)); L.stroke(); L.restore();
        }
      }
    }
    if (p.sub) {
      // a small line under the title (the fight promo: event + date), typed on in condensed caps after the title lands
      const ts = t0 + 0.28 * lines.length + 0.35, k = prog(t, ts, ts + 0.35, ease.outCubic);
      if (k > 0) {
        const yS = this.logo ? (p.ty ?? 900) + ((p.logoW ?? 920) * this.logo.height) / this.logo.width / 2 + 70 : y0 + (lines.length - 1) * size * (p.gap ?? 0.95) + size * 0.62 + 70;
        c.save(); c.globalAlpha = k; c.font = font(p.subFont ?? 'BebasNeue', p.subSize ?? 64); c.letterSpacing = '6px';
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = rgba('bone');
        c.fillText(p.sub, W / 2, yS + (1 - k) * 14); c.restore();
      }
    }
    const calm = (x: number) => prog(x, t0 + (p.calmAt ?? 1.2), t0 + (p.calmAt ?? 1.2) + 1.0);
    if (p.life !== false) lifeline(this.lb, t, t0 - 1.5, (x) => 0.9 - 0.4 * calm(x), { y: p.lifeY ?? (p.ty ?? 880) + 430, intensity: 0.9, bpm: 64, calm, slams: [{ t: t0, amp: 3.6 }, { t: t0 + 0.28, amp: 2.4 }] });
    const slam = pulse(t, t0, 0.18) + 0.6 * pulse(t, t0 + 0.28, 0.16);
    const sh = slam * 12;
    void audio;
    return { bloom: 0.55 + slam * 0.3, zoom: (1 + 0.025 * prog(t, t0, this.ctx.end)) * (1 + slam * 0.03), shake: [noise1(t * 40, 3) * sh, noise1(t * 40, 9) * sh], vignette: 0.5 };
  }
  override warm(f: Frame) { return 0.12 + 1.6 * pulse(f.t, this.ctx.params.cut, 0.2); }
}
