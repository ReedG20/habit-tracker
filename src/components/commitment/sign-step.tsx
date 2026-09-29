import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { contractRuns } from './contract-text';
import type { CommitmentDraft } from './draft';
import { HoldToConfirmButton } from './hold-to-confirm-button';
import { Note } from './note';
import { SignaturePad } from './signature-pad';
import { StepLayout } from './step-layout';

import { ThemedText } from '@/components/themed-text';
import { CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const signedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

const SIGNATURE_HEIGHT = 96;

export type SignStepProps = {
  draft: CommitmentDraft;
  busy: boolean;
  onConfirm: () => void;
};

/** Step 3: the whole commitment as a contract, signed by finger and locked in by holding. */
export function SignStep({ draft, busy, onConfirm }: SignStepProps) {
  const theme = useTheme();
  const [signed, setSigned] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [showSignHint, setShowSignHint] = useState(false);

  const clear = () => {
    setPadKey((key) => key + 1);
    setSigned(false);
  };

  return (
    <StepLayout
      locked={drawing}
      footer={
        <>
          {showSignHint ? (
            <Animated.View entering={FadeIn}>
              <ThemedText type="small" themeColor="accent" style={styles.hint}>
                Sign it first.
              </ThemedText>
            </Animated.View>
          ) : null}
          <HoldToConfirmButton
            label={busy ? 'Locking…' : 'Hold to lock it in'}
            disabled={!signed || busy}
            onDisabledPress={() => {
              if (!busy) setShowSignHint(true);
            }}
            onConfirm={onConfirm}
          />
        </>
      }>
      <View style={[styles.contract, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallSemibold" themeColor="textSecondary">
          {draft.kind === 'habit' ? 'Standing agreement' : 'Agreement'} ·{' '}
          {signedDate.format(new Date())}
        </ThemedText>

        <ThemedText style={styles.body} themeColor="text">
          {contractRuns(draft).map((run, index) => (
            <ThemedText
              key={index}
              style={[styles.body, run.strong && styles.strong]}
              themeColor={run.strong ? 'text' : 'textSecondary'}>
              {run.text}
            </ThemedText>
          ))}
        </ThemedText>

        <View style={styles.signatureArea}>
          <SignaturePad
            key={padKey}
            color={theme.text}
            height={SIGNATURE_HEIGHT}
            onSignedChange={(next) => {
              setSigned(next);
              if (next) setShowSignHint(false);
            }}
            onDrawingChange={setDrawing}
          />
          <View
            pointerEvents="none"
            style={[styles.signatureLine, { backgroundColor: theme.textSecondary }]}
          />
          <View style={styles.signatureFooter}>
            <ThemedText type="small" themeColor="textSecondary">
              Sign here
            </ThemedText>
            {signed ? (
              <Pressable accessibilityRole="button" onPress={clear} hitSlop={Spacing.two}>
                <ThemedText type="smallSemibold" themeColor="text">
                  Clear
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <Note>this is the whole trick. future you has to answer to present you.</Note>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  contract: {
    borderRadius: CardRadius,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  body: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: 500,
  },
  strong: {
    fontWeight: 700,
  },
  signatureArea: {
    gap: Spacing.one,
  },
  // The rule the signature sits on, across the bottom of the pad.
  signatureLine: {
    height: 1,
    marginTop: -Spacing.four,
    marginBottom: Spacing.three,
    opacity: 0.35,
  },
  signatureFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hint: {
    textAlign: 'center',
  },
});
