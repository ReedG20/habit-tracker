import { useMutation } from 'convex/react';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Device from 'expo-device';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PROOF_INK } from './ink';
import { ProofResult } from './proof-result';
import { CircleButton, ProofShell, QuietButton, RuleText } from './proof-shell';
import { ScanLine } from './scan-line';
import { useVerdict } from './use-verdict';

import { ActionButton } from '@/components/action-button';
import { CameraRotated01Icon, FlashIcon, FlashOffIcon, Image01Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Habit } from '@/data/habits';
import { todayKey } from '@/lib/dates';
import { pressHaptic } from '@/lib/haptics';
import { proofErrorMessage } from '@/lib/proof-errors';
import { uploadPhoto } from '@/lib/proof-upload';

/** The simulator has no camera. */
const HAS_CAMERA = Device.isDevice;
/** The library is a development escape hatch only: proof is a photo taken now. */
const CAN_PICK_FROM_LIBRARY = __DEV__ || !Device.isDevice;

type Photo = { uri: string; mimeType: string };

/**
 * Photo proof, in Ante's own camera: frame it, shoot, and the frame freezes
 * while a scan runs over it until the verdict lands.
 */
export function PhotoStage({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const generateUploadUrl = useMutation(api.verifications.generateUploadUrl);
  const submit = useMutation(api.verifications.submit);

  const camera = useRef<CameraView>(null);
  /** A second tap while the first photo is still being taken must not send two. */
  const shooting = useRef(false);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [verificationId, setVerificationId] = useState<Id<'habitVerifications'> | null>(null);
  const { verdict, slow } = useVerdict(verificationId);

  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  const send = async (next: Photo) => {
    setPhoto(next);
    try {
      const storageId = await uploadPhoto(await generateUploadUrl(), next);
      setVerificationId(await submit({ habitId: habit._id, day: todayKey(), photoId: storageId }));
    } catch (error: unknown) {
      console.error('Failed to submit the photo', error);
      Alert.alert(
        'Couldn’t send the photo',
        proofErrorMessage(error, 'Check your connection and try again.'),
      );
      setPhoto(null);
    }
  };

  const shoot = async () => {
    if (!ready || photo !== null || shooting.current || camera.current === null) return;
    shooting.current = true;
    pressHaptic();
    flash.set(withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 260 })));
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.5, exif: false });
      await send({ uri: picture.uri, mimeType: 'image/jpeg' });
    } catch (error: unknown) {
      console.error('Failed to take the photo', error);
      Alert.alert('Couldn’t take the photo', 'Try again.');
    } finally {
      shooting.current = false;
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      exif: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined)
      await send({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const retry = () => {
    setVerificationId(null);
    setPhoto(null);
  };

  const granted = permission?.granted === true;
  const live = HAS_CAMERA && granted && photo === null;

  const stage = (
    <View style={styles.stage}>
      {HAS_CAMERA && granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={torch && facing === 'back'}
          mirror={facing === 'front'}
          animateShutter={false}
          active={photo === null}
          onCameraReady={() => setReady(true)}
        />
      ) : null}
      {photo !== null ? (
        <Animated.View entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      ) : null}
      {photo !== null && verdict === null ? <ScanLine /> : null}
      {verdict !== null ? (
        <Animated.View entering={FadeIn} style={[StyleSheet.absoluteFill, styles.settled]} />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
      />
    </View>
  );

  return (
    <ProofShell
      method="photo"
      title={habit.title}
      onClose={onClose}
      scrims
      stage={stage}
      right={
        live && facing === 'back' ? (
          <CircleButton
            icon={torch ? FlashIcon : FlashOffIcon}
            label={torch ? 'Turn the light off' : 'Turn the light on'}
            onPress={() => setTorch((on) => !on)}
          />
        ) : null
      }>
      {verdict !== null ? (
        <ProofResult
          method="photo"
          verdict={verdict}
          onDone={onClose}
          onRetry={retry}
          retryLabel="Retake"
        />
      ) : photo !== null ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.checking}>
          <Text style={styles.checkingText}>Checking your photo…</Text>
          {slow ? <QuietButton label="Keep going in the background" onPress={onClose} /> : null}
        </Animated.View>
      ) : !HAS_CAMERA ? (
        <NoCamera onPick={() => void pickFromLibrary()} />
      ) : permission === null ? null : !granted ? (
        <CameraPermission canAsk={permission.canAskAgain} onAsk={() => void requestPermission()} />
      ) : (
        <>
          <RuleText>
            {habit.description ? `Show ${lowerFirst(habit.description)}` : 'Show that it’s done.'}
          </RuleText>
          <View style={styles.controls}>
            <View style={styles.controlSide}>
              {CAN_PICK_FROM_LIBRARY ? (
                <CircleButton
                  icon={Image01Icon}
                  label="Pick from library (development only)"
                  size={48}
                  onPress={() => void pickFromLibrary()}
                />
              ) : null}
            </View>
            <Shutter disabled={!ready} onPress={() => void shoot()} />
            <View style={[styles.controlSide, styles.controlRight]}>
              <CircleButton
                icon={CameraRotated01Icon}
                label="Flip camera"
                size={48}
                onPress={() => setFacing((side) => (side === 'back' ? 'front' : 'back'))}
              />
            </View>
          </View>
        </>
      )}
    </ProofShell>
  );
}

const SHUTTER = 78;

function Shutter({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Take the photo"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(0.86, { damping: 14, stiffness: 400 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 12, stiffness: 300 }))}
      style={[styles.shutter, disabled && styles.disabled]}>
      <Animated.View style={[styles.shutterInner, inner]} />
    </Pressable>
  );
}

function CameraPermission({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  return (
    <View style={styles.blocked}>
      <RuleText>
        Ante needs the camera to see your proof. Photos are taken here, in the app, so they can’t be
        old ones.
      </RuleText>
      {canAsk ? (
        <ActionButton label="Allow the camera" variant="primary" fill onPress={onAsk} />
      ) : (
        <ActionButton
          label="Open Settings"
          variant="primary"
          fill
          onPress={() => void Linking.openSettings()}
        />
      )}
    </View>
  );
}

function NoCamera({ onPick }: { onPick: () => void }) {
  return (
    <View style={styles.blocked}>
      <RuleText>No camera here. On the simulator, pick a photo from the library instead.</RuleText>
      <ActionButton label="Pick from library" variant="primary" fill onPress={onPick} />
    </View>
  );
}

function lowerFirst(text: string): string {
  const trimmed = text.trim().replace(/[.!]+$/, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: PROOF_INK.background,
  },
  settled: {
    backgroundColor: 'rgba(7,6,15,0.45)',
  },
  flash: {
    backgroundColor: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlSide: {
    width: 64,
    flexDirection: 'row',
  },
  controlRight: {
    justifyContent: 'flex-end',
  },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 5,
    borderColor: PROOF_INK.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER - 18,
    height: SHUTTER - 18,
    borderRadius: (SHUTTER - 18) / 2,
    backgroundColor: PROOF_INK.text,
  },
  disabled: {
    opacity: 0.5,
  },
  checking: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  checkingText: {
    color: PROOF_INK.text,
    fontSize: 17,
    fontWeight: '600',
  },
  blocked: {
    gap: Spacing.three,
  },
});
