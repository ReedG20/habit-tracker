import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { DeadlineField } from '@/components/deadline-field';
import { TextField } from '@/components/text-field';

export type GoalDraft = {
  title: string;
  description: string;
  dueAt: number;
};

export type GoalSheetFieldsProps = {
  initial: GoalDraft;
  /**
   * Set to a function that reads the draft as it is right now. The text comes
   * straight from the fields at call time, so a submit tapped right after the
   * last keystroke still sees it.
   */
  draftRef: MutableRefObject<() => GoalDraft>;
  /** Hidden once the deadline is locked (money on the goal, or already done). */
  showDeadline: boolean;
};

export function GoalSheetFields({ initial, draftRef, showDeadline }: GoalSheetFieldsProps) {
  const readTitle = useRef<(() => string) | null>(null);
  const readDescription = useRef<(() => string) | null>(null);
  const dueAtRef = useRef(initial.dueAt);
  const [dueAt, setDueAt] = useState(initial.dueAt);

  useEffect(() => {
    draftRef.current = () => ({
      title: readTitle.current?.() ?? initial.title,
      description: readDescription.current?.() ?? initial.description,
      dueAt: dueAtRef.current,
    });
  }, [draftRef, initial.title, initial.description]);

  return (
    <>
      <TextField
        label="Name"
        defaultValue={initial.title}
        readValueRef={readTitle}
        placeholder="Ship the landing page"
        autoCapitalize="sentences"
        returnKeyType="next"
      />
      <TextField
        label="What proof will you show?"
        defaultValue={initial.description}
        readValueRef={readDescription}
        placeholder="A photo of the live site on my laptop, not a screenshot"
        multiline
      />
      {showDeadline ? (
        <DeadlineField
          value={dueAt}
          onChange={(next) => {
            setDueAt(next);
            dueAtRef.current = next;
          }}
        />
      ) : null}
    </>
  );
}
