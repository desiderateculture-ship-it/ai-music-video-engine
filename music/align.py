"""Times every sung word: forced alignment (torchaudio MMS_FA) of the written lyrics, line by line on the vocal stem, then
each word snapped to the nearest vocal onset within 0.12 s. Prints a SUNG list to paste into job/build_data.py.
Whisper's word times run up to 0.8 s early on singing, so use whisper only to find roughly where each line is.
  python -m demucs --two-stems vocals -o music/work/stems music/out/<take>.flac
  python music/align.py music/work/stems/htdemucs/<take>/vocals.wav music/lines.json
lines.json: [{"text": "REMEMBER THE NAME", "win": [4.5, 7.5]}, ...]  win = a window around the line, in seconds.
Then listen. Check the first line and any line after a gap by ear: reverb and choirs fool the aligner."""
import json, re, sys
import numpy as np, soundfile as sf, torch, torchaudio, librosa
from torchaudio.pipelines import MMS_FA as bundle

voc, lines = sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8'))
y, sr = sf.read(voc, dtype='float32'); y = y.mean(1) if y.ndim > 1 else y
SR = bundle.sample_rate
wav = torchaudio.functional.resample(torch.from_numpy(y)[None], sr, SR)[0]
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
model = bundle.get_model(with_star=False).to(dev); dic = bundle.get_dict(star=None)
y22 = librosa.resample(y, orig_sr=sr, target_sr=22050)
on = np.array(librosa.onset.onset_detect(y=y22, sr=22050, hop_length=128, units='time', backtrack=True))
print('SUNG = [')
for L in lines:
    a, z = L['win']; words = L['text'].split()
    seg = wav[int(a * SR):int(z * SR)][None].to(dev)
    with torch.inference_mode(): em, _ = model(seg)
    toks = [re.sub(r'[^a-z]', '', w.lower()) or 'a' for w in words]
    ali, sc = torchaudio.functional.forced_align(em, torch.tensor([[dic[c] for t in toks for c in t]], dtype=torch.int32, device=dev), blank=0)
    spans = torchaudio.functional.merge_tokens(ali[0], sc[0].exp())
    ratio = seg.shape[1] / em.shape[1] / SR
    k, row, prev = 0, [], -1.0
    for w, t in zip(words, toks):
        sp = spans[k:k + len(t)]; k += len(t)
        s = a + sp[0].start * ratio
        i = int(np.abs(on - s).argmin()) if len(on) else -1
        if i >= 0 and abs(on[i] - s) <= 0.12 and on[i] > prev + 0.05: s = float(on[i])
        s = max(s, prev + 0.08); prev = s
        row.append((w, round(float(s), 2)))
    print('    [' + ', '.join(f'({w!r}, {t})' for w, t in row) + '],')
print(']')
