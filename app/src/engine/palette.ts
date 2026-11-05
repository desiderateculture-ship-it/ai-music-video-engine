import { hexToLinear } from './util';


// The piece's palette. Change these per job: pull the colours from the client's own artwork.
const HEX_BASE = {
  ink: '#070707',
  ink2: '#131212',
  graphite: '#4A4747',
  ash: '#8E8A8A',
  bone: '#F4F4F4',
  signal: '#D3302C',
  ember: '#FF6A55',
  blood: '#5E1212',
  acid: '#D3302C',
  amber: '#E8B04E',
  amber2: '#F0C46E',
  light: '#CFCBCB',
};
export const HEX = HEX_BASE;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
