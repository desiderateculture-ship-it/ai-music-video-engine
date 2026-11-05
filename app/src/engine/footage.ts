// Video footage as textures, frame-accurate. Clips (footage/clips/<name>.mp4) are all-intra, so any
// frame can be sought directly. Scenes register a provider saying which clip frames they need at t;
// before each exported frame the page awaits syncFootage(t), which seeks every needed clip to its
// frame and re-uploads it. The output stays a pure function of t, like everything else.
// In the preview, syncFootage runs without waiting (the picture may trail a seek by a frame).
import * as THREE from 'three';

import { FOOTAGE_DIR, FOOTAGE_FPS } from './project';
export { FOOTAGE_FPS };
export interface FootageNeed { clip: string; time: number; slot?: number }
type Provider = (t: number) => FootageNeed[];

const providers = new Set<Provider>();

export class Clip {
  video: HTMLVideoElement;
  texture: THREE.Texture;
  private ready: Promise<void>;
  private shown = -1;      // frame index currently in the texture
  private busy: Promise<void> | null = null;
  private want = -1;
  width = 0; height = 0; duration = 0;

  constructor(public name: string) {   // name: footage/clips/<name>.mp4
    const v = document.createElement('video');
    v.src = `${FOOTAGE_DIR}/${name}.mp4`;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    this.video = v;
    this.texture = new THREE.Texture(v);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.ready = new Promise((res, rej) => {
      v.addEventListener('loadeddata', () => {
        this.width = v.videoWidth; this.height = v.videoHeight; this.duration = v.duration;
        // three.js sizes a <video> texture from the element's width/height attributes, not videoWidth
        v.width = v.videoWidth; v.height = v.videoHeight;
        res();
      }, { once: true });
      v.addEventListener('error', () => rej(new Error(`footage failed to load: ${v.src}`)), { once: true });
    });
    v.load();
  }

  async load() { await this.ready; }
  get loaded() { return this.width > 0; }

  /** Show the frame at clip time `time` (clamped). Resolves once it is in the texture. */
  async seek(time: number): Promise<void> {
    await this.ready;
    const last = Math.max(0, Math.floor(this.duration * FOOTAGE_FPS) - 1);
    const f = Math.min(last, Math.max(0, Math.floor(time * FOOTAGE_FPS + 1e-4)));
    this.want = f;
    while (this.busy) await this.busy;
    if (this.shown === this.want) return;
    const target = this.want;
    this.busy = (async () => {
      const v = this.video;
      await new Promise<void>((res) => {
        const done = () => { v.removeEventListener('seeked', done); res(); };
        v.addEventListener('seeked', done);
        v.currentTime = (target + 0.5) / FOOTAGE_FPS; // mid-frame: no rounding onto a neighbour
      });
      this.shown = target;
      this.texture.needsUpdate = true;
    })();
    await this.busy;
    this.busy = null;
  }
}

const clips = new Map<string, Clip>();

/** The clip of this name (created and loaded on first use). `slot` > 0 is a separate decoder of the same file, for
 * scenes that need two times of one clip at once (neighbouring segments overlap by a frame or two at a cut). */
export function clip(name: string, slot = 0): Clip {
  const key = slot ? `${name}#${slot}` : name;
  let c = clips.get(key);
  if (!c) { c = new Clip(name); clips.set(key, c); }
  return c;
}

export function registerFootage(p: Provider) { providers.add(p); return () => providers.delete(p); }

/** Seek every clip the scenes need at t. Await it before rendering t for exact frames. */
export async function syncFootage(t: number): Promise<void> {
  const needs: FootageNeed[] = [];
  for (const p of providers) needs.push(...p(t));
  await Promise.all(needs.map((n) => clip(n.clip, n.slot).seek(n.time)));
}
