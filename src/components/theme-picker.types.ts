import type { ThemePreference } from '@/lib/theme-preference';

export type ThemePickerProps = {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
};

export const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
