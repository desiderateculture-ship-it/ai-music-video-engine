"""Lifts a light logo off a dark background (a screenshot of merch, a poster) into a transparent PNG, upscaled with smooth
edges -> app/public/brand/logo.png. A stop-gap: ask the client for the real design file.
Run: python tools/trace_logo.py <image> [x0 y0 x1 y1] [--scale 6]"""
import sys
from pathlib import Path
import numpy as np, cv2

args = sys.argv[1:]
scale = 6
if '--scale' in args: i = args.index('--scale'); scale = int(args[i + 1]); del args[i:i + 2]
im = cv2.imread(args[0])
if len(args) >= 5: x0, y0, x1, y1 = map(int, args[1:5]); im = im[y0:y1, x0:x1]
im = cv2.resize(im, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (0, 0), scale / 3)
alpha = np.clip((g.astype(np.float32) - 90) / 60, 0, 1)      # soft threshold: dark -> clear, light -> solid
out = np.dstack([im, (alpha * 255).astype(np.uint8)])
dst = Path(__file__).resolve().parents[1] / 'app' / 'public' / 'brand' / 'logo.png'; dst.parent.mkdir(parents=True, exist_ok=True)
cv2.imwrite(str(dst), out)
print(dst, out.shape[1], 'x', out.shape[0])
