import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeadlineField } from '@/components/deadline-field';
import { DeadlinePresets } from '@/components/deadline-presets';
import { TextField, type TextFieldHandle } from '@/components/text-field';
import { Spacing } from '@/constants/theme';

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
  const proofRef = useRef<TextFieldHandle>(null);
  const dueAtRef = useRef(initial.dueAt);
  const [dueAt, setDueAt] = useState(initial.dueAt);
  const changeDueAt = (next: number) => {
    setDueAt(next);
    dueAtRef.current = next;
  };

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
        placeholder="Run a half marathon"
        autoCapitalize="sentences"
        returnKeyType="next"
        onSubmit={() => proofRef.current?.focus()}
      />
      <TextField
        ref={proofRef}
        label="What proof will you show?"
        defaultValue={initial.description}
        readValueRef={readDescription}
        placeholder="Me at the finish line, medal on and race bib showing"
        multiline
      />
      {showDeadline ? (
        <View style={styles.deadline}>
          <DeadlineField value={dueAt} onChange={changeDueAt} />
          <DeadlinePresets value={dueAt} onChange={changeDueAt} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  deadline: {
    gap: Spacing.two,
  },
});
