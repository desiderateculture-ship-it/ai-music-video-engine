"""Trims a take to the edit, fades the end and sets -14 LUFS (static gain) -> music/master/song.wav + .mp3.
Run: python music/master.py music/out/<take>.flac [seconds=66] [fade=3]"""
import re, subprocess, sys
from pathlib import Path

src = sys.argv[1]; dur = float(sys.argv[2]) if len(sys.argv) > 2 else 66.0; fade = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
out = Path(__file__).parent / 'master'; out.mkdir(exist_ok=True)
af = f'atrim=0:{dur},afade=t=out:st={dur - fade}:d={fade}'
m = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', af + ',ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1]); g = -14.0 - lufs
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', f'{af},volume={g:.2f}dB,alimiter=limit=0.95', '-ar', '48000', str(out / 'song.wav')], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out / 'song.wav'), '-b:a', '256k', str(out / 'song.mp3')], check=True)
print(f'{lufs:.1f} LUFS -> gain {g:+.1f} dB -> {out / "song.wav"}')
