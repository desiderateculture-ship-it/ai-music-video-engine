"""Makes placeholder footage so the engine can be tested before you have a client: three test-pattern clips, one still,
a placeholder logo. Run from job/: python make_demo.py"""
import subprocess
import numpy as np, cv2
from config import ROOT, PIECE

clips = ROOT / 'footage' / PIECE / 'clips'; clips.mkdir(parents=True, exist_ok=True)
stills = ROOT / 'footage' / PIECE / 'stills'; stills.mkdir(parents=True, exist_ok=True)
ENC = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-g', '1', '-pix_fmt', 'yuv420p', '-an']   # all-intra: the engine seeks every frame
for name, src in (('clip_a', 'testsrc2=s=1280x720:r=30'), ('clip_b', 'mandelbrot=s=1280x720:r=30'), ('clip_c', 'life=s=1280x720:r=30:mold=10:ratio=0.3')):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-t', '12', *ENC, str(clips / f'{name}.mp4')], check=True)
im = np.zeros((900, 1200, 3), np.uint8); im[:] = (40, 30, 30)
cv2.circle(im, (600, 450), 300, (44, 48, 211), -1)
cv2.imwrite(str(stills / 'photo_a.jpg'), im)
logo = np.zeros((400, 1200, 4), np.uint8)
cv2.putText(logo, 'YOUR LOGO', (40, 280), cv2.FONT_HERSHEY_DUPLEX, 5.5, (255, 255, 255, 255), 18, cv2.LINE_AA)
out = ROOT / 'app' / 'public' / 'brand'; out.mkdir(parents=True, exist_ok=True)
cv2.imwrite(str(out / 'logo.png'), logo)
print('demo footage in', clips.parent)
