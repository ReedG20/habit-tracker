import { useMutation } from 'convex/react';
import * as Device from 'expo-device';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';
import { ScreenScrollView } from './screen-scroll-view';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

import { ArrowLeft01Icon, Camera01Icon, Cancel01Icon, Image01Icon } from '@/constants/icons';
import { BorderRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { GoalWithStatus } from '@/data/goals';
import { useTheme } from '@/hooks/use-theme';

type PickedPhoto = {
  uri: string;
  mimeType: string;
};

/** Mirrors `MAX_SUBMISSION_PHOTOS` on the server. */
const MAX_PHOTOS = 6;

/** The simulator has no camera. Unlike habits, the library is always a legitimate source here. */
const CAN_TAKE_PHOTO = Device.isDevice;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Enough detail for a plausibility check, small enough to upload quickly.
  quality: 0.5,
  exif: false,
};

export type SubmitProofFormProps = {
  goal: GoalWithStatus;
  /** Called once the submission is in; the verdict arrives later as a toast. */
  onSubmitted: () => void;
  onBack: () => void;
};

/**
 * Photos plus an optional note, sent as one submission for the model to judge.
 * Shared by the goal's own submit screen and the locked screen, since proof
 * can still be submitted while Ante is locked.
 */
export function SubmitProofForm({ goal, onSubmitted, onBack }: SubmitProofFormProps) {
  const theme = useTheme();
  const generateUploadUrl = useMutation(api.verifications.generateUploadUrl);
  const create = useMutation(api.goalSubmissions.create);

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Read at submit time rather than tracked per keystroke: the field is
  // uncontrolled, and the native value is what the user actually sees.
  const readNote = useRef<(() => string) | null>(null);

  const remaining = MAX_PHOTOS - photos.length;

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert('Camera access is off', 'Turn it on in Settings to take proof photos.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]);
      }
      return;
    }

    acceptResult(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  };

  const pickFromLibrary = async () => {
    // No permission request: iOS and Android both present a system picker.
    acceptResult(
      await ImagePicker.launchImageLibraryAsync({
        ...PICKER_OPTIONS,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        // A multi-select pick hands over the original file, which for a
        // library photo is usually HEIC; asking for the compatible
        // representation gets JPEG, which the server accepts.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }),
    );
  };

  const acceptResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;

    setPhotos((current) => [
      ...current,
      // Camera output is JPEG and HEIC library picks are transcoded to JPEG,
      // so the fallback is right whenever the picker leaves the type out.
      ...result.assets
        .slice(0, MAX_PHOTOS - current.length)
        .map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' })),
    ]);
  };

  const upload = async (photo: PickedPhoto): Promise<Id<'_storage'>> => {
    // Upload URLs are single-use, so one is minted per file.
    const uploadUrl = await generateUploadUrl();

    // The blob read from a file URI comes back untyped, and React Native sends
    // a Blob body with the blob's own type as Content-Type (clobbering the
    // header), so the type has to live on the blob itself.
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
    return storageId;
  };

  const onSubmit = async () => {
    if (photos.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      const photoIds: Id<'_storage'>[] = [];
      for (const photo of photos) {
        photoIds.push(await upload(photo));
      }

      const note = (readNote.current?.() ?? '').trim();
      await create({
        goalId: goal._id,
        photoIds,
        text: note.length > 0 ? note : undefined,
      });
      onSubmitted();
    } catch (error: unknown) {
      console.error('Failed to submit the proof', error);
      Alert.alert(
        "Couldn't submit the proof",
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={Spacing.three}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon icon={ArrowLeft01Icon} size={18} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            Back
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.title} themeColor="text">
          Submit proof
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {goal.description
            ? `You promised: ${goal.description}`
            : `Show that "${goal.title}" is done.`}
        </ThemedText>
      </View>

      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={[styles.cell, { backgroundColor: theme.backgroundElement }]}>
            <Image
              source={{ uri: photo.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={`Photo ${index + 1}`}
            />
            {submitting ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                hitSlop={Spacing.two}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                <Icon icon={Cancel01Icon} size={14} color="#ffffff" />
              </Pressable>
            )}
          </View>
        ))}
        {photos.length === 0 ? (
          <View style={[styles.cell, { backgroundColor: theme.backgroundElement }]}>
            <Icon icon={Camera01Icon} size={28} themeColor="textSecondary" />
          </View>
        ) : null}
        {submitting ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <ActivityIndicator color={theme.onPrimary} />
          </View>
        ) : null}
      </View>

      <View style={styles.sources}>
        {CAN_TAKE_PHOTO ? (
          <ActionButton
            icon={Camera01Icon}
            label="Take photo"
            disabled={submitting || remaining === 0}
            onPress={() => void takePhoto()}
            style={styles.source}
          />
        ) : null}
        <ActionButton
          icon={Image01Icon}
          label="From library"
          disabled={submitting || remaining === 0}
          onPress={() => void pickFromLibrary()}
          style={styles.source}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {remaining === 0
          ? `That's the limit of ${MAX_PHOTOS} photos.`
          : `Up to ${MAX_PHOTOS} photos. ${photos.length === 0 ? 'Add at least one.' : `${remaining} more can go in.`}`}
      </ThemedText>

      <TextField
        label="Note (optional)"
        defaultValue=""
        readValueRef={readNote}
        placeholder="Anything the photos don't show on their own"
        multiline
      />

      <ActionButton
        label={submitting ? 'Submitting…' : 'Submit for review'}
        variant="primary"
        fill
        disabled={photos.length === 0 || submitting}
        onPress={() => void onSubmit()}
      />
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Three across at phone widths; the gap is subtracted so three fit exactly.
  cell: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: BorderRadius,
  },
  sources: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  source: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
