import type { Signature } from './types';

/** One stored stroke, with where it falls along the whole signature, for writing it out again. */
export type InkStroke = {
  d: string;
  /** Rough length, along the points it passes through. */
  length: number;
  /** The length of every stroke before it. */
  start: number;
  points: { x: number; y: number }[];
};

/**
 * The points a `SignaturePad` path passes through. Its paths are absolute
 * `M`, `Q` and `L` commands, plus a relative `l0.1,0` that makes a tap into a
 * dot; that nudge is dropped, so it can't pull the box toward the origin.
 */
function pathPoints(d: string): { x: number; y: number }[] {
  const numbers = (d.replace(/l[^MQL]*/g, '').match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
  }
  return points;
}

export function inkStrokes(paths: string[]): InkStroke[] {
  let start = 0;
  return paths.map((d) => {
    const points = pathPoints(d);
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      if (a !== undefined && b !== undefined) length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const stroke = { d, length, start, points };
    start += length;
    return stroke;
  });
}

/** The box around the ink, with room for the pen's width, so the signature fills the line. */
export function signatureBox(
  strokes: InkStroke[],
  pad: Signature,
): { x: number; y: number; width: number; height: number } {
  const points = strokes.flatMap((stroke) => stroke.points);
  if (points.length === 0) return { x: 0, y: 0, width: pad.width, height: pad.height };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const margin = 4;
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return {
    x,
    y,
    width: Math.max(Math.max(...xs) + margin - x, 1),
    height: Math.max(Math.max(...ys) + margin - y, 1),
  };
}
