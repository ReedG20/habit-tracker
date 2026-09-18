import type { IconSvgElement } from '@hugeicons/react-native';
import { useMutation, useQuery } from 'convex/react';
import * as Device from 'expo-device';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon, Image01Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Habit } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';

type PickedPhoto = {
  uri: string;
  mimeType: string;
};

/** The simulator has no camera, and the library is the escape hatch for development only. */
const CAN_TAKE_PHOTO = Device.isDevice;
const CAN_PICK_FROM_LIBRARY = __DEV__ || !Device.isDevice;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Enough detail for a plausibility check, small enough to upload quickly.
  quality: 0.5,
  exif: false,
};

export default function VerifyHabitScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habit = useQuery(api.habits.get, { habitId: rawHabitId as Id<'habits'> });

  if (!habit) {
    return <View style={styles.placeholder} />;
  }

  return <VerifyHabitForm key={habit._id} habit={habit} />;
}

function VerifyHabitForm({ habit }: { habit: Habit }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const generateUploadUrl = useMutation(api.verifications.generateUploadUrl);
  const submit = useMutation(api.verifications.submit);

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(
          'Camera access is off',
          'Turn it on in Settings to verify habits with a photo.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    acceptResult(result);
  };

  const pickFromLibrary = async () => {
    // No permission request: iOS and Android both present a system picker.
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    acceptResult(result);
  };

  const acceptResult = (result: ImagePicker.ImagePickerResult) => {
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;

    // Camera output is JPEG and HEIC library picks are transcoded to JPEG,
    // so the fallback is right whenever the picker leaves the type out.
    setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const onSubmit = async () => {
    if (photo === null || submitting) return;
    setSubmitting(true);

    try {
      // Upload URLs are single-use, so one is minted per attempt.
      const uploadUrl = await generateUploadUrl();

      // The blob read from a file URI comes back untyped, and React Native
      // sends a Blob body with the blob's own type as Content-Type (clobbering
      // the header), so the type has to live on the blob itself. Convex then
      // records it as the file's content type.
      const untyped = await (await fetch(photo.uri)).blob();
      const blob = new Blob([untyped], { type: photo.mimeType });

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': photo.mimeType },
        body: blob,
      });
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}: ${await response.text()}`);
      }

      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
      await submit({ habitId: habit._id, day: todayKey(), photoId: storageId });

      // The sheet is swipe-dismissable; if it is already gone, `goBack` would
      // pop the list screen instead.
      if (navigation.isFocused()) {
        navigation.goBack();
      }
    } catch (error: unknown) {
      console.error('Failed to submit the photo for verification', error);
      Alert.alert("Couldn't submit the photo", 'Check your connection and try again.');
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      title={`Verify ${habit.title}`}
      submitLabel={submitting ? 'Submitting…' : 'Submit for review'}
      submitDisabled={photo === null || submitting}
      onSubmit={() => void onSubmit()}>
      <ThemedText type="small" themeColor="textSecondary">
        Snap a photo that shows you did it. It gets a quick once-over before the habit counts.
      </ThemedText>

      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Your photo"
          />
        ) : (
          <Icon icon={Camera01Icon} size={28} themeColor="textSecondary" />
        )}
        {submitting ? (
          <View style={styles.previewOverlay}>
            <ActivityIndicator color={theme.onPrimary} />
          </View>
        ) : null}
      </View>

      <View style={styles.sources}>
        {CAN_TAKE_PHOTO ? (
          <SourceButton
            icon={Camera01Icon}
            label={photo ? 'Retake photo' : 'Take photo'}
            disabled={submitting}
            onPress={() => void takePhoto()}
          />
        ) : null}
        {CAN_PICK_FROM_LIBRARY ? (
          <SourceButton
            icon={Image01Icon}
            label="Choose from library"
            disabled={submitting}
            onPress={() => void pickFromLibrary()}
          />
        ) : null}
      </View>
    </FormSheet>
  );
}

function SourceButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconSvgElement;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sourceButton,
        { borderColor: theme.border },
        (pressed || disabled) && styles.pressed,
      ]}>
      <Icon icon={icon} size={18} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: Spacing.six * 4,
  },
  preview: {
    height: 200,
    borderRadius: BorderRadius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sources: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sourceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: BorderRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
