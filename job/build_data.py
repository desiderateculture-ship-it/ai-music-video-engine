"""Beat grid, on-screen words and audio -> data/<piece>/{lyrics,audio}.json + audio/<piece>.wav.
Captions are timed words. SUNG holds a list of lines, each [(WORD, seconds), ...]: for a song, paste the times from
music/align.py (never raw whisper times: they run early on singing). Run from job/: python build_data.py"""
import json
import numpy as np, soundfile as sf
from config import ROOT, PIECE, BPM, DUR, BEAT, SONG, b

SR = 44100
BEATS = [round(i * BEAT, 3) for i in range(int(DUR / BEAT) + 1)]
DOWNS = BEATS[::4]
SUNG = [
    [('THIS', b(4)), ('IS', round(b(4) + BEAT, 3)), ('THE', round(b(4) + 2 * BEAT, 3)), ('LYRIC', round(b(4) + 3 * BEAT, 3)), ('LANE', b(5))],
    [('REMEMBER', b(7)), ('THE', round(b(7) + 2 * BEAT, 3)), ('NAME', b(8))],
]


def guide():
    """A kick-and-clap guide beat, for previews before there is a song."""
    n = int(DUR * SR); y = np.zeros(n, np.float32); t = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (48 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 9)
    clap = np.random.default_rng(7).normal(0, 1, len(t)) * np.exp(-t * 28) * 0.35
    for k, bt in enumerate(BEATS):
        i = int(bt * SR)
        for s, g in ((kick, 0.8), (clap, 1.0 if k % 2 else 0.0)):
            m = min(len(s), n - i)
            if m > 0: y[i:i + m] += g * s[:m]
    y *= 0.25 / np.abs(y).max()
    return np.stack([y, y], 1), SR


def lines_of(sung):
    out = []
    for ws in sung:
        words = [{'w': w, 'start': t, 'end': round((ws[i + 1][1] if i + 1 < len(ws) else t + 0.45) - 0.01, 3)} for i, (w, t) in enumerate(ws)]
        out.append({'text': ' '.join(w for w, _ in ws), 'start': ws[0][1], 'end': words[-1]['end'], 'words': words})
    return out


y, sr = sf.read(SONG) if SONG.exists() else guide()
(ROOT / 'audio').mkdir(exist_ok=True)
sf.write(ROOT / 'audio' / f'{PIECE}.wav', y[:int(DUR * sr)], sr, subtype='PCM_16')
lines = lines_of(SUNG)
flat = [0.5] * int(DUR * 100)
d = ROOT / 'data' / PIECE; d.mkdir(parents=True, exist_ok=True)
(d / 'audio.json').write_text(json.dumps({'duration': DUR, 'bpm': BPM, 'fps': 100, 'beats': BEATS, 'downbeats': DOWNS, 'sections': [],
    'features': {k: flat for k in ('rms', 'vocal', 'mid', 'low', 'bass', 'drums', 'high', 'other')},
    'onsets': {'vocal': [[w['start'], 1.0] for L in lines for w in L['words']]}}))
(d / 'lyrics.json').write_text(json.dumps({'lines': lines}, ensure_ascii=False, indent=0), encoding='utf-8')
print(f'{PIECE}: {DUR} s at {BPM:.0f} BPM, {len(lines)} lines, audio: {"song" if SONG.exists() else "guide beat"}')
