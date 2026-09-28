import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const REPLAY_MS = 900;
const TICK_MS = 450;

/**
 * A number that counts up to `target`: from zero whenever `replayKey` changes,
 * and from wherever it stands when only `target` moves (a streak going from
 * 23 to 24). Driven from JS, so it works with any font and any formatting;
 * with Reduce Motion on it just shows `target`.
 */
export function useCountUp(target: number, replayKey: string): number {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const shown = useRef(value);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const replay = lastKey.current !== replayKey;
    lastKey.current = replayKey;
    const from = reduceMotion ? target : replay ? 0 : shown.current;
    const duration = replay ? REPLAY_MS : TICK_MS;
    const start = performance.now();
    let frame = 0;

    const step = () => {
      const progress = from === target ? 1 : Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      shown.current = from + (target - from) * eased;
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [target, replayKey, reduceMotion]);

  return value;
}
