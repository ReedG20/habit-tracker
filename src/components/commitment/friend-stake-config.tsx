import { useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EMPTY_FRIEND, type CommitmentDraft } from './draft';

import { TextField, type TextFieldHandle } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { PillRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useTheme } from '@/hooks/use-theme';

export type FriendStakeConfigProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  /** Before there's an account, there are no saved friends to offer. */
  signedIn: boolean;
};

/**
 * Who hears about a miss: someone named before, as a chip, or someone new by
 * name and email.
 */
export function FriendStakeConfig({ draft, onChange, signedIn }: FriendStakeConfigProps) {
  const theme = useTheme();
  const saved = useQuery(api.friends.list, signedIn ? {} : 'skip') ?? [];
  const [fieldsKey, setFieldsKey] = useState(0);
  const emailRef = useRef<TextFieldHandle>(null);
  const { friend } = draft;
  const picking = friend.friendId !== undefined;

  const pickNew = () => {
    onChange({ friend: EMPTY_FRIEND });
    setFieldsKey((key) => key + 1);
  };

  return (
    <View style={styles.config}>
      {saved.length > 0 ? (
        <View style={styles.chips}>
          {saved.map((option) => {
            const selected = friend.friendId === option._id;
            return (
              <Pressable
                key={option._id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.name}, ${option.email}`}
                onPress={() =>
                  onChange({
                    friend: { friendId: option._id, name: option.name, email: option.email },
                  })
                }
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <ThemedText
                  type="smallSemibold"
                  style={{ color: selected ? theme.onPrimary : theme.text }}>
                  {option.name}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: !picking }}
            onPress={pickNew}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: !picking ? theme.primary : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallSemibold"
              style={{ color: !picking ? theme.onPrimary : theme.text }}>
              Someone new
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {picking ? (
        <ThemedText type="small" themeColor="textSecondary">
          {friend.email}
        </ThemedText>
      ) : (
        <>
          <TextField
            key={`name-${fieldsKey}`}
            label="Their name"
            defaultValue={friend.name}
            placeholder="Sam"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="givenName"
            returnKeyType="next"
            onChangeText={(name) => onChange({ friend: { ...draft.friend, name } })}
            onSubmit={() => emailRef.current?.focus()}
          />
          <TextField
            ref={emailRef}
            key={`email-${fieldsKey}`}
            label="Their email"
            defaultValue={friend.email}
            placeholder="sam@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onChangeText={(email) => onChange({ friend: { ...draft.friend, email } })}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  config: {
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
  },
  pressed: {
    opacity: 0.6,
  },
});
