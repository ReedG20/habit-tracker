export type SwitchProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  /** What it turns on and off, for VoiceOver; the visible label sits beside it. */
  accessibilityLabel: string;
};
