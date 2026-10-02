import type { MutableRefObject, Ref } from 'react';

import type { TextFieldHandle } from '@/components/text-field';

/** Big enough to read as the page's heading, under the Comico question above it. */
export const TITLE_FONT_SIZE = 30;

export type TitleFieldProps = {
  ref?: Ref<TextFieldHandle>;
  /** There's no visible label: the question above the field is its label. */
  accessibilityLabel: string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Typing stops here; the server holds the same limit. */
  maxLength?: number;
  /** As on `TextField`: returns the current text, read when leaving the page. */
  readValueRef?: MutableRefObject<(() => string) | null>;
  onChangeText?: (text: string) => void;
  /** Return: the name is done. */
  onSubmit?: () => void;
};
