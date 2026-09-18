import type { ActionButtonProps } from './action-button.types';
import { GlassButton } from './glass-button';

/** Android and web have no SwiftUI; the styled React Native button stands in. */
export function ActionButton(props: ActionButtonProps) {
  return <GlassButton {...props} />;
}
