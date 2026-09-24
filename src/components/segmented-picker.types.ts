export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedPickerProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
};
