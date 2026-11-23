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

/**
 * The game's jersey-number font and each kit's number colours (index.json `numberFont`, `numberKit`, `numberFix`,
 * scripts/nfl/jersey_numbers.py): glyphs per digit and slot ("7|left"), the number colour and its band-row accent per
 * club, and the kit files whose baked number is not the player's real one.
 */
export interface NumberTables {
  font: Record<string, string[]>;
  kit: Record<string, { nc: [number, number, number]; acc: [number, number, number] }>;
  fix: Set<string>;
}
let numbers: NumberTables | null = null;
export const setNumberTables = (n: { numberFont?: Record<string, string[]>; numberKit?: NumberTables['kit']; numberFix?: string[] }) => {
  if (n.numberFont && n.numberKit) numbers = { font: n.numberFont, kit: n.numberKit, fix: new Set(n.numberFix ?? []) };
};
export const numberTables = () => numbers;
