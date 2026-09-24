import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Point = { x: number; y: number };

/** Total ink needed before it counts as a signature rather than a stray tap. */
const MIN_SIGNATURE_LENGTH = 60;

export type SignaturePadProps = {
  color: string;
  height: number;
  /** Fires when the pad crosses into, or back out of, "signed". */
  onSignedChange: (signed: boolean) => void;
  /** The screen's scroll view should hold still while a finger is drawing. */
  onDrawingChange?: (drawing: boolean) => void;
};

/** Smooths a stroke by curving through the midpoints between samples. */
function strokePath(points: Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  if (rest.length === 0) return `M${first.x},${first.y} l0.1,0`;

  let path = `M${first.x},${first.y}`;
  let previous = first;
  for (const point of rest) {
    const midX = (previous.x + point.x) / 2;
    const midY = (previous.y + point.y) / 2;
    path += ` Q${previous.x},${previous.y} ${midX},${midY}`;
    previous = point;
  }

  return `${path} L${previous.x},${previous.y}`;
}

/**
 * A finger signature. Nothing is stored: signing is the point, not the pixels.
 * To clear it, remount it with a new `key`.
 */
export function SignaturePad({
  color,
  height,
  onSignedChange,
  onDrawingChange,
}: SignaturePadProps) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const ink = useRef<Point[][]>([]);
  const inkLength = useRef(0);
  const signed = useRef(false);

  const begin = (event: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    onDrawingChange?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ink.current = [...ink.current, [{ x, y }]];
    setStrokes(ink.current);
  };

  const extend = (event: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    const last = ink.current[ink.current.length - 1];
    const previous = last?.[last.length - 1];
    if (last === undefined || previous === undefined) return;

    inkLength.current += Math.hypot(x - previous.x, y - previous.y);
    ink.current = [...ink.current.slice(0, -1), [...last, { x, y }]];
    setStrokes(ink.current);

    if (!signed.current && inkLength.current >= MIN_SIGNATURE_LENGTH) {
      signed.current = true;
      onSignedChange(true);
    }
  };

  const end = () => onDrawingChange?.(false);

  return (
    <View
      style={[styles.pad, { height }]}
      accessible
      accessibilityLabel="Signature. Draw your signature with a finger."
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Keep the stroke even if the scroll view wants the gesture.
      onResponderTerminationRequest={() => false}
      onResponderGrant={begin}
      onResponderMove={extend}
      onResponderRelease={end}
      onResponderTerminate={end}>
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((stroke, index) => (
          <Path
            key={index}
            d={strokePath(stroke)}
            stroke={color}
            strokeWidth={2.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    width: '100%',
  },
});
