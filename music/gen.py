"""Original song takes with ACE-Step 1.5 -> music/out/<flavour><TAG>_seed<N>.flac. About 25 s per 72 s take on a 12 GB GPU.
Write the style from the client's own music taste, set BPM to the edit's grid, and generate plenty of seeds.
Run with ACE-Step's Python, from the repo root (Git Bash):
  PYTHONUTF8=1 vendor/ACE-Step-1.5/.venv/Scripts/python.exe music/gen.py [flavour ...]
Env: SEEDS="7 2026 11" and TAG=_r2 for further rounds, ACE_DIR if ACE-Step lives elsewhere."""
import os, sys, time
from pathlib import Path

HERE = Path(__file__).parent
ACE = Path(os.environ.get('ACE_DIR', HERE.parent / 'vendor' / 'ACE-Step-1.5'))
sys.path.insert(0, str(ACE))
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

BPM, SECONDS = 140, 72
STRUCT = '[Intro]\n\n[Build]\n\n[Drop]\n\n[Breakdown]\n\n[Drop]\n\n[Outro]'
LYRICS = """[Intro]
Remember the name

[Verse]
Write short lines here, in the client's own words
Four lines is about eight bars at 140
Keep verses simple: fast rap comes out garbled
Chanted hooks come out clean

[Chorus]
The hook goes here
The hook goes here
Remember the name

[Instrumental]

[Chorus]
The hook goes here
The hook goes here
Remember the name

[Outro]
Remember the name"""
FLAVOURS = {
    # name: (has vocals, style caption)
    'inst': (False, 'instrumental, no lead vocals, cinematic, hard drill beat, sliding 808 bass, drill hi-hats, menacing, 140 BPM'),
    'vocal': (True, 'English, UK drill beat, sliding 808, aggressive confident male rap vocal, chanted gang hook, cinematic, 140 BPM'),
}
SEEDS = tuple(int(x) for x in os.environ.get('SEEDS', '7 2026').split())
TAG = os.environ.get('TAG', '')

out = HERE / 'out'; out.mkdir(parents=True, exist_ok=True)
t0 = time.time()
dit, lm = AceStepHandler(), LLMHandler()
print(dit.initialize_service(project_root=str(ACE), config_path='acestep-v15-turbo', device='cuda', offload_to_cpu=True))
print(lm.initialize(checkpoint_dir=str(ACE / 'checkpoints'), lm_model_path='acestep-5Hz-lm-0.6B', backend='pt', device='cuda', offload_to_cpu=True))
print(f'loaded in {time.time() - t0:.0f}s', flush=True)
for name in sys.argv[1:] or FLAVOURS:
    vocal, style = FLAVOURS[name]
    params = GenerationParams(caption=style, lyrics=LYRICS if vocal else STRUCT, instrumental=not vocal, vocal_language='en',
                              duration=SECONDS, bpm=BPM, shift=3.0, inference_steps=8)
    for seed in SEEDS:
        t1 = time.time()
        cfg = GenerationConfig(batch_size=1, use_random_seed=False, audio_format='flac'); cfg.seeds = [seed]
        r = generate_music(dit, lm, params, cfg, save_dir=str(out))
        if not r.success: print(name, seed, 'FAILED', r.error, flush=True); continue
        for a in r.audios:
            p = Path(a['path']); dst = out / f'{name}{TAG}_seed{seed}{p.suffix}'; p.replace(dst)
            print(f'{name} seed {seed}: {dst} ({time.time() - t1:.0f}s)', flush=True)
