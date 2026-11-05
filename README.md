# AI Music Video Engine

Turn someone's own footage into a 9:16 music video with an original AI song and kinetic lyrics, on one Windows PC. Claude Code runs the steps; you make the creative calls.

Built on [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT), cut down to the two scenes a reel needs: shots with captions, and an end card.

## What you need

A Windows PC with a 12 GB NVIDIA GPU and about 40 GB free.

| Tool | What it does | Get it |
| --- | --- | --- |
| Claude Code | Runs every step and writes the job scripts | [anthropics/claude-code](https://github.com/anthropics/claude-code) |
| ACE-Step 1.5 | Writes the original song | [ACE-Step/ACE-Step-1.5](https://github.com/ACE-Step/ACE-Step-1.5) |
| Demucs | Pulls the vocal out of the song | [adefossez/demucs](https://github.com/adefossez/demucs) |
| faster-whisper | Checks the sung words | [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| torchaudio (MMS_FA) | Times each lyric word to the vocal | [pytorch/audio](https://github.com/pytorch/audio) |
| librosa | Finds the tempo, bars and drop | [librosa/librosa](https://github.com/librosa/librosa) |
| OpenCV | Traces a logo off a screenshot | [opencv/opencv-python](https://github.com/opencv/opencv-python) |
| Bun + Node.js | Run the render engine | [bun.sh](https://bun.sh), [nodejs.org](https://nodejs.org) |
| Google Chrome | Draws each frame, headless | [google.com/chrome](https://www.google.com/chrome/) |
| FFmpeg | Cuts clips, encodes finals | [gyan.dev full build](https://www.gyan.dev/ffmpeg/builds/) |

## Install

Use Git Bash for the commands below, from the repo folder unless noted.

1. Update your NVIDIA driver and check that `nvidia-smi` shows the GPU.
2. Install [Git for Windows](https://git-scm.com/download/win), [Python 3.13](https://www.python.org/downloads/), Python 3.12 (for ACE-Step), Node.js, Bun, Chrome and Claude Code. Unzip FFmpeg and add its `bin` folder to PATH.
3. Clone this repo, then install the audio tools:

   ```bash
   python -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
   python -m pip install -r requirements.txt
   ```

4. Install ACE-Step into `vendor/` (the download is about 11 GB):

   ```bash
   git clone https://github.com/ACE-Step/ACE-Step-1.5 vendor/ACE-Step-1.5
   cd vendor/ACE-Step-1.5
   python -m uv sync --python <path to python 3.12> --no-python-downloads
   .venv/Scripts/acestep-download.exe
   cd ../..
   ```

5. Install the render engine:

   ```bash
   cd app
   bun install
   cd ..
   ```

## Test it with the demo

This makes placeholder footage and a guide beat, then renders a 24 s video to `out/demo.mp4`.

```bash
cd job
python make_demo.py
python build_data.py
python shots.py
cd ../app
bun scripts/render.ts video --piece mv_demo --vertical --fps 30 --samples 4 --url http://localhost:1 --out ../out/demo.mp4
```

## Make a reel

Copy `job/` to `job_<client>/`, set `PIECE` in `config.py`, and open Claude Code in this folder. `CLAUDE.md` tells it how the steps work and what to watch for.

1. **Brief:** research the client: identity, story, look, music taste, what to avoid.
2. **Footage:** download their posts, pick the moments, list them in `prep.py`, run it. Trace their logo with `tools/trace_logo.py` if they can't send the file.
3. **Song:** edit the style and lyrics in `music/gen.py`, then generate takes (about 25 s each). Run `music/analyse.py` to see where each drop lands. Keep the best three and let the client choose. Run `music/master.py` on the winner.
4. **Lyric timing:** split the vocal with Demucs and run `music/align.py`. Paste the result into `SUNG` in `build_data.py`.
5. **Edit:** write the shot list in `shots.py` so the pictures match the words. Pick colours in `app/src/engine/palette.ts`.
6. **Check:** render a frame sheet, including time 0 (the Instagram thumbnail), then a draft:

   ```bash
   bun scripts/render.ts sheet --piece mv_<client> --vertical --url http://localhost:1 --times 0,6,14 --cols 3 --out ../out/sheet.png
   ```

7. **Finals:** render at 60 fps, about 20 min on a 12 GB card:

   ```bash
   bun scripts/render.ts video --piece mv_<client> --vertical --fps 60 --samples auto --shutter 0.5 --crf 18 --url http://localhost:1 --out ../out/final.mp4
   ```

Live preview: `bunx vite` in `app/`, then open `http://localhost:5173/?piece=mv_demo&format=vertical`.

## Before you use it on real people

- **Permission:** get the client's OK for all footage and photos. Photographers own their shots.
- **Children:** keep them out of every clip unless a parent has approved it in writing.
- **AI disclosure:** ACE-Step asks you to check originality and disclose AI involvement.
- **Secrets:** `footage/`, `audio/`, `data/`, `out/` and `job_*/` are git-ignored so client material stays off GitHub. Keep it that way.

## Licences

Engine: MIT, see `LICENSE` (original copyright kept). ACE-Step is MIT (code and weights). Fonts are SIL OFL, see `app/public/fonts/README.md`. This is not legal advice.
