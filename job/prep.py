"""Cuts the client's footage into clips: footage/<piece>/clips/<name>.mp4 (all-intra 30 fps, picture area only).
List every clip window below, and write the job's rules here so they can't be forgotten:
  - NO children unless a parent has approved it in writing: note every time range with a child, keep windows clear of them.
  - Nothing the client asked to leave out (losses, ex-teams, sponsors).
Run from job/: python prep.py   (skips clips that exist; pass names to redo them)"""
import subprocess, sys
from config import ROOT, PIECE, CLIENT_FOOTAGE

OUT = ROOT / 'footage' / PIECE / 'clips'; OUT.mkdir(parents=True, exist_ok=True)
ENC = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-g', '1', '-pix_fmt', 'yuv420p', '-an']

# name: (source file in CLIENT_FOOTAGE, in, out, crop w:h:x:y or None)
CLIPS = {
    # 'walkout': ('walkout.mp4', 0.0, 6.5, None),
    # 'takedown': ('fight1.mp4', 39.5, 42.5, '788:444:86:0'),   # crop off letterbox bars
}


def cut(name):
    f, a, z, crop = CLIPS[name]
    vf = (f'crop={crop},' if crop else '') + 'fps=30'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(a), '-t', f'{z - a:.3f}', '-i', str(CLIENT_FOOTAGE / f), '-vf', vf, *ENC, str(OUT / f'{name}.mp4')], check=True)


if __name__ == '__main__':
    for n in sys.argv[1:] or CLIPS:
        if len(sys.argv) == 1 and (OUT / f'{n}.mp4').exists(): continue
        cut(n)
    print(len(list(OUT.glob('*.mp4'))), 'clips in', OUT)
