"""A map of each take: exact tempo, beat phase, and loudness + low end per bar, to see where the drop lands.
Run: python music/analyse.py ["*_r2_*.flac"]   (the map's rows: all = whole mix, low = bass; one character per bar)"""
import sys, numpy as np, librosa
from pathlib import Path

BPM_GUESS = 140
HERE = Path(__file__).parent
for f in sorted((HERE / 'out').glob(sys.argv[1] if len(sys.argv) > 1 else '*.flac')):
    y, sr = librosa.load(f, sr=22050, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=128); fps = sr / 128
    best = (0, 0, 0)
    for bpm in np.arange(BPM_GUESS - 4, BPM_GUESS + 6, 0.1):
        per = 60 / bpm * fps
        for ph in np.arange(0, per, 1):
            idx = (ph + per * np.arange(int((len(env) - ph) / per))).astype(int)
            best = max(best, (env[idx].mean(), bpm, ph / fps))
    _, bpm, ph = best
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512)); fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low, tot = S[fr < 150].sum(0), S.sum(0); t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=512)
    bar = 240 / bpm
    rows = np.array([(tot[(t >= i * bar) & (t < (i + 1) * bar)].mean(), low[(t >= i * bar) & (t < (i + 1) * bar)].mean()) for i in range(int(t[-1] / bar))])
    rows /= rows.max(0)
    print(f'{f.stem}: {len(y) / sr:.1f} s, {bpm:.1f} BPM, beat phase {ph:.3f} s')
    print('  all ', ''.join(' .:-=+*#%@'[min(9, int(v * 10))] for v in rows[:, 0]))
    print('  low ', ''.join(' .:-=+*#%@'[min(9, int(v * 10))] for v in rows[:, 1]))
