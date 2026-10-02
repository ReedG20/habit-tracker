/**
 * The share card's fixed layout, and the stake hero's sizing within it. Pure,
 * so it is unit-tested; `share-card.tsx` draws with it.
 */

export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640;
/** Each side, `Spacing.four + Spacing.one`; spelled out to keep this file free of the theme. */
export const SHARE_CARD_PADDING_X = 28;

/**
 * Comico's advance widths, as a share of the font size, read from
 * `assets/fonts/Comico-Regular.otf` (its lowercase is drawn as capitals, at
 * the same widths). Anything not listed is taken as wide as its widest letter.
 */
// prettier-ignore
const COMICO_WIDTHS: Record<string, number> = {
  a: 0.613, b: 0.595, c: 0.564, d: 0.635, e: 0.58, f: 0.523, g: 0.661, h: 0.676, i: 0.321,
  j: 0.543, k: 0.626, l: 0.523, m: 0.891, n: 0.724, o: 0.737, p: 0.634, q: 0.757, r: 0.666,
  s: 0.54, t: 0.594, u: 0.696, v: 0.531, w: 0.96, x: 0.596, y: 0.536, z: 0.609,
  '0': 0.658, '1': 0.48, '2': 0.589, '3': 0.552, '4': 0.589, '5': 0.573, '6': 0.57,
  '7': 0.547, '8': 0.549, '9': 0.598, ' ': 0.45, $: 0.547, ',': 0.335, '.': 0.289,
};
const COMICO_WIDEST = 0.96;
/** Room for kerning and the letters' ink running past their advance. */
const FIT_MARGIN = 0.94;
const STAKE_HERO_MAX = 84;
const STAKE_HERO_LINES = 2;
const HERO_WIDTH = SHARE_CARD_WIDTH - 2 * SHARE_CARD_PADDING_X;

function comicoWidth(text: string): number {
  let width = 0;
  for (const char of text.toLowerCase()) width += COMICO_WIDTHS[char] ?? COMICO_WIDEST;
  return width;
}

/** How many lines `text` wraps to at `fontSize`, breaking between words as the card does. */
function lineCount(words: string[], fontSize: number): number {
  const room = (HERO_WIDTH * FIT_MARGIN) / fontSize;
  let lines = 1;
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && comicoWidth(next) > room) {
      lines += 1;
      line = word;
    } else {
      line = next;
    }
  }
  return lines;
}

/**
 * As big as fits: every word whole on a line, in at most two lines, so
 * "$250", "My word" and "7 days locked" all fill the card without a word
 * breaking or the hero pushing the note into the footer. Sized here rather
 * than with `adjustsFontSizeToFit`, which shrinks it to nothing inside the
 * share sheet's scaled-down preview.
 */
export function stakeHeroSize(text: string): number {
  const words = text.split(' ').filter((word) => word.length > 0);
  const longest = Math.max(...words.map(comicoWidth));
  let size = Math.min(STAKE_HERO_MAX, Math.floor((HERO_WIDTH * FIT_MARGIN) / longest));
  while (size > 24 && lineCount(words, size) > STAKE_HERO_LINES) size -= 2;
  return size;
}
