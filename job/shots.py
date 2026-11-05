"""The edit -> data/<piece>/shots.json. Cut on the bar grid: b(i) is bar i's downbeat. A shot is (time, clip or still,
clip in-point, extras). Text modes per segment: 'none', 'rap' (small lane, verses), 'kinetic' (big slams, hooks).
Every clip shot is checked against its clip's length, so a bad in-point fails here and not in the render.
Run from job/: python shots.py"""
import json, subprocess
from config import ROOT, PIECE, BEAT, DUR, b

def sync(hit_t, clip_t, t0, speed=1.0): return round(clip_t - (hit_t - t0) * speed, 3)   # put a clip moment ON a time

BAND = {'win': 'band'}                                  # a 4:3 window over a blurred copy, for wide footage in 9:16
STILLS = {'photo_a': {**BAND, 'cx': 0.5, 'z0': 1.0, 'z1': 1.1}}
F = {'clip_a': BAND, 'clip_b': {'vcx': 0.5}, 'clip_c': BAND}

SEGS = []
def seg(scene, start, text, shots=(), **p): SEGS.append({'scene': scene, 'start': round(start, 3), 'text': text, 'shots': list(shots), 'p': p})

# intro: the logo slams on bar 1; 'cover' puts it on frame 0 too (the Instagram thumbnail); kcover False = no lyric on frame 0
seg('mv_shot', 0.0, 'kinetic', [(0.0, 'clip_a', 0.0, {})], logos=[{'t': b(1), 'out': b(3) - 0.05, 'cover': True}], kcover=False)
seg('mv_shot', b(4), 'rap', [(b(4), 'clip_b', 0.0, {}), (b(5) + 2 * BEAT, 'photo_a', 0, {})], punch=[b(4) + 0.1])
seg('mv_shot', b(7), 'kinetic', [(b(7), 'clip_c', 0.0, {}), (b(9), 'clip_a', 3.0, {'speed': 0.7})])
END = b(11)

LOGO = '/brand/logo.png'
GRADE = {'red': 0}                                      # natural colour; raise for a red-tinted fight grade
LOOK = {'kick': 0, 'kfont': 'BebasNeue', 'ktrack': 0.01, 'rfont': 'BebasNeue', 'rupper': True, 'rtrack': 0.02, 'katana': True,
        'brackets': False, 'kpunct': True, 'logo': LOGO, 'logos': [], 'logoY': 900, 'logoW': 940}
TEXT = {'kinetic': {'ty': 900, 'cap': 330, 'maxH': 1380, 'stackMax': 4}, 'rap': {'size': 128}}
TITLE = {'logo': LOGO, 'logoW': 940, 'over': 'CLIENT NAME', 'overSize': 58, 'life': False, 'fade': 2.4, 'ty': 960,
         'lines': [['CLIENT NAME', 'bone']], 'size': 200, 'font': 'BebasNeue', 'sub': 'EVENT  ·  DATE', 'subSize': 72}
CLIPLEN = {f.stem: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)],
                                        capture_output=True, text=True).stdout) for f in (ROOT / 'footage' / PIECE / 'clips').glob('*.mp4')}


def build(piece, title, segs, end):
    segs = segs + [{'scene': 'mv_title', 'start': end, 'text': None, 'shots': [], 'p': title}]
    out = []
    for si, s in enumerate(segs):
        p = dict(s['p'])
        if s['scene'] == 'mv_shot':
            p = {**LOOK, 'text': s['text'], **TEXT.get(s['text'], {}), **p}
            p['look'] = {**GRADE, **p.get('look', {})}
            p['shots'] = [{'t': round(t + 0.1, 3), **({'still': n, **STILLS[n]} if n in STILLS else {'clip': n, 'in': cin, **F.get(n, {})}), **ex}
                          for (t, n, cin, ex) in s['shots']]
            t_end = segs[si + 1]['start'] + 0.1
            for k, x in enumerate(p['shots']):
                if 'still' in x: continue
                t1 = p['shots'][k + 1]['t'] if k + 1 < len(p['shots']) else t_end
                used = x['in'] + (t1 - x['t']) * x.get('speed', 1)
                assert x['in'] >= 0 and used <= CLIPLEN[x['clip']] - 0.04, f"{x['clip']} at {x['t'] - 0.1:.2f}: clip {x['in']:.2f}-{used:.2f} outside 0-{CLIPLEN[x['clip']] - 0.04:.2f}"
        out.append({'scene': s['scene'], 'start': s['start'], 'trans': 'cut', 'params': p})
    for i, s in enumerate(out):
        s['end'] = out[i + 1]['start'] if i + 1 < len(out) else DUR
        s['params']['progress'] = DUR
    d = ROOT / 'data' / piece; d.mkdir(parents=True, exist_ok=True)
    (d / 'shots.json').write_text(json.dumps({'duration': DUR, 'segments': out}, indent=1, ensure_ascii=False), encoding='utf-8')
    return out


out = build(PIECE, TITLE, SEGS, END)
print(f'{PIECE}: {len(out)} segments, {DUR} s')
