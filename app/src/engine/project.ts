// Which piece the page renders. `?piece=mv_<name>` (render.ts --piece) selects a self-contained set of inputs, so
// several jobs share the engine without clobbering each other's files:
//   data/<piece>/{lyrics,audio,shots}.json, audio/<piece>.wav, footage/<base>/clips/<clip>.mp4, footage/<base>/stills/<still>.jpg.
export const PIECE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('piece') ?? '' : '';
export const MV = /^mv_/.test(PIECE);
export const POD = MV;
/** A variant of a piece (mv_x_reel, mv_x_lyric): its own data + audio, the base piece's footage and stills. */
export const REEL = /_reel\d*$/.test(PIECE);
export const BASE = PIECE.replace(/_(reel\d*|lyric)$/, '');
export const dataUrl = (file: string) => `data/${PIECE}/${file}`;
export const AUDIO_URL = `audio/${PIECE}.wav`;
export const FOOTAGE_DIR = `footage/${BASE}/clips`;
export const FOOTAGE_FPS = 30;
