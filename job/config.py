"""One job = one piece. Copy the job/ folder per client (job_<client>/) and change these."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIECE = 'mv_demo'            # must start with mv_ ; variants mv_demo_reel / mv_demo_lyric share its footage
BPM = 140.0                  # the edit's grid: generate the song at this tempo so every cut lands on a beat
DUR = 24.0                   # video length in seconds (a real reel: about 66)
SONG = ROOT / 'music' / 'master' / 'song.wav'   # used if it exists, otherwise a guide beat
CLIENT_FOOTAGE = Path(r'C:\Content\Clients\Example')   # the client's downloaded videos (prep.py)

BEAT = 60 / BPM
BAR = 4 * BEAT
b = lambda i: round(i * BAR, 3)                  # bar i's downbeat
