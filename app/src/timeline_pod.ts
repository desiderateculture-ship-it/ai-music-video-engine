// The edit comes from data/<piece>/shots.json. A 'wipe' or 'fade' segment overlaps the previous one by 2 x WIPE so the incoming plate can reveal itself
// over the outgoing one (scenes/_pod.ts PodPlate); a 'cut' is a hard cut (jump cuts between framings).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import { PIECE } from './engine/project';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};
const SHOTS = import.meta.glob<{ duration: number; segments: Seg[] }>(['../../data/mv_*/shots.json'], { eager: true, import: 'default' });

interface Seg { scene: string; start: number; end: number; trans: 'wipe' | 'cut' | 'fade'; params: Record<string, any> }

export const WIPE = 0.22;

export function makePodTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  const data = SHOTS[`../../data/${PIECE}/shots.json`];
  if (!data) throw new Error(`no shot list for ${PIECE} (data/${PIECE}/shots.json: run the job's shots.py)})`);
  const segs = data.segments;
  return segs.map((s, i) => {
    const next = segs[i + 1];
    const soft = (x?: Seg) => !!x && x.trans !== 'cut';
    const start = i > 0 && soft(s) ? s.start - WIPE : s.start;
    const end = next ? (soft(next) ? next.start + WIPE : next.start) : au.duration;
    return {
      id: `${String(i + 1).padStart(2, '0')}-${s.scene}`,
      file: s.scene, load: scene(s.scene), start, end,
      params: { ...s.params, trans: s.trans, cut: s.start, out: next?.start ?? au.duration, idx: i },
    } as TimelineEntry;
  });
}
