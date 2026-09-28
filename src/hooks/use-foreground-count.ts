import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * How many times the app has come back from the background while mounted:
 * a key for things that should replay when the user "opens the app" again,
 * but not on every tab switch.
 */
export function useForegroundCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let last = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (last === 'background' && next === 'active') setCount((current) => current + 1);
      last = next;
    });
    return () => subscription.remove();
  }, []);

  return count;
}
