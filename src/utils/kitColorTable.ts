/**
 * Each club's real kit colours in the save's own sprite files (index.json `kitColors`, scripts/nfl/kit_colors.py):
 * band (jersey / pants / socks) -> neutral class (base / shade / trim) -> RGB. Set once when the sprite index loads;
 * gameKitPaint.ts reads it to repaint a player's file from another club's kit into the club he is drawn in.
 */
export type KitColors = Record<string, Record<string, Record<string, [number, number, number]>>>;

let table: KitColors | null = null;
export const setKitColors = (t: KitColors | null | undefined) => {
  if (t) table = t;
};
export const kitColorsOf = (club: string) => table?.[club];
