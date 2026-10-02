import { useMutation } from 'convex/react';
import * as Location from 'expo-location';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PROOF_INK } from './ink';
import { ProofResult } from './proof-result';
import { ProofShell, QuietButton, RuleText } from './proof-shell';
import { Radar, type RadarMode } from './radar';
import { useAiProofConsent } from './use-ai-proof-consent';
import { useVerdict } from './use-verdict';

import { ActionButton } from '@/components/action-button';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Habit } from '@/data/habits';
import { captureError, track } from '@/lib/analytics';
import { todayKey } from '@/lib/dates';
import { pressHaptic } from '@/lib/haptics';
import { userErrorMessage } from '@/lib/user-errors';

/** Good enough to tell one building from the next; past this, wait a moment for better. */
const GOOD_ACCURACY_M = 65;
/** How long to keep listening for a better fix before going with the best one. */
const IMPROVE_MS = 6000;
/** Mirrors `MAX_ACCURACY_M` on the server: rougher than this can't be checked. */
const MAX_ACCURACY_M = 500;
/** Long enough for the ripples to read as "finding you" even when the fix is instant. */
const MIN_LOCATING_MS = 900;

/** Google's terms: its place data, shown without a Google map, says where it came from. */
const ATTRIBUTION = 'Places data © Google';

type Blocked = 'denied' | 'reduced' | null;

/**
 * Location proof: tap "I'm here", and Ante finds you, looks at the labeled
 * places around you, and checks one of them fits the habit. Nothing to frame
 * or type; the only question is whether you're really there.
 */
export function LocationStage({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const submit = useMutation(api.locationProofs.submit);
  const aiAllowed = useAiProofConsent(onClose);
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<'ready' | 'locating' | 'sent'>('ready');
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [verificationId, setVerificationId] = useState<Id<'habitVerifications'> | null>(null);
  const { verdict, slow } = useVerdict(verificationId);
  /** A second tap while the first check-in is on its way must not send two. */
  const busy = useRef(false);

  // Back from Settings: if location (or Precise Location) is on now, say so.
  const recheck = useEffectEvent(async () => {
    if (blocked === null) return;
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted && permission.ios?.accuracy !== 'reduced') setBlocked(null);
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck();
    });
    return () => subscription.remove();
  }, []);

  const checkIn = async () => {
    if (phase !== 'ready' || busy.current || !aiAllowed) return;
    busy.current = true;
    pressHaptic();

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setBlocked(permission.canAskAgain ? null : 'denied');
        return;
      }
      if (permission.ios?.accuracy === 'reduced') {
        setBlocked('reduced');
        return;
      }
      setBlocked(null);
      await locateAndSubmit();
    } finally {
      busy.current = false;
    }
  };

  const locateAndSubmit = async () => {
    setPhase('locating');

    let fix: Location.LocationObject;
    try {
      [fix] = await Promise.all([bestFix(), wait(MIN_LOCATING_MS)]);
    } catch (error: unknown) {
      console.error('Failed to find the location', error);
      Alert.alert('Couldn’t find you', 'Ante couldn’t get your location. Try again in a moment.');
      setPhase('ready');
      return;
    }

    const accuracy = fix.coords.accuracy ?? MAX_ACCURACY_M + 1;
    if (accuracy > MAX_ACCURACY_M) {
      setBlocked('reduced');
      setPhase('ready');
      return;
    }

    try {
      const id = await submit({
        habitId: habit._id,
        day: todayKey(),
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy,
      });
      setVerificationId(id);
      setPhase('sent');
      track('habit checked in', { method: 'location' });
    } catch (error: unknown) {
      console.error('Failed to check in', error);
      captureError(error, 'habit location proof');
      Alert.alert(
        'Couldn’t check in',
        userErrorMessage(error, 'Check your connection and try again.'),
      );
      setPhase('ready');
    }
  };

  const retry = () => {
    setVerificationId(null);
    setPhase('ready');
  };

  const mode: RadarMode =
    verdict !== null
      ? 'settled'
      : phase === 'locating'
        ? 'locating'
        : phase === 'sent'
          ? 'scanning'
          : 'idle';

  const radarSize = Math.min(width - Spacing.four * 2, 340);
  const target = habit.description?.trim() || habit.title;

  const stage = (
    <View style={styles.stage}>
      <Radar size={radarSize} mode={mode} />
    </View>
  );

  return (
    <ProofShell method="location" title={habit.title} onClose={onClose} stage={stage}>
      {verdict !== null ? (
        <ProofResult
          method="location"
          habitId={habit._id}
          verdict={verdict}
          onDone={onClose}
          onRetry={retry}
          footnote={ATTRIBUTION}
        />
      ) : phase !== 'ready' ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.status}>
          <Text style={styles.statusText}>
            {phase === 'locating' ? 'Finding you…' : 'Looking around…'}
          </Text>
          <Text style={styles.statusDetail}>
            {phase === 'locating'
              ? 'Getting a precise fix on where you are.'
              : `Checking the places around you for ${lowerFirst(target)}.`}
          </Text>
          {slow ? <QuietButton label="Keep going in the background" onPress={onClose} /> : null}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn} style={styles.ready}>
          <View style={styles.target}>
            <Text style={styles.targetLabel}>CHECKING IN AT</Text>
            <Text style={styles.targetText}>{target}</Text>
          </View>
          {blocked === 'denied' ? (
            <>
              <RuleText>Location is off for Ante. Turn it on to check in.</RuleText>
              <ActionButton
                label="Open Settings"
                variant="primary"
                fill
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : blocked === 'reduced' ? (
            <>
              <RuleText>
                Ante needs Precise Location to tell one place from the next. Turn it on in Settings,
                under Location.
              </RuleText>
              <ActionButton
                label="Open Settings"
                variant="primary"
                fill
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : (
            <>
              <RuleText>
                Tap when you’re there. Ante checks where you are once, right now, and never in the
                background.
              </RuleText>
              <ActionButton
                label="I’m here, check in"
                variant="primary"
                fill
                onPress={() => void checkIn()}
              />
            </>
          )}
        </Animated.View>
      )}
    </ProofShell>
  );
}

/** One quick reading, then a few seconds of listening if it came back rough. */
async function bestFix(): Promise<Location.LocationObject> {
  let best = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  if ((best.coords.accuracy ?? Infinity) <= GOOD_ACCURACY_M) return best;

  return await new Promise((resolve) => {
    let done = false;
    let subscription: Location.LocationSubscription | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      subscription?.remove();
      resolve(best);
    };
    const timeout = setTimeout(finish, IMPROVE_MS);
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (fix) => {
        if ((fix.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) best = fix;
        if ((best.coords.accuracy ?? Infinity) <= GOOD_ACCURACY_M) finish();
      },
    )
      .then((next) => {
        if (done) next.remove();
        else subscription = next;
      })
      .catch(finish);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lowerFirst(text: string): string {
  const trimmed = text.trim().replace(/[.!]+$/, '');
  const [first, second] = trimmed;
  // "Equinox" keeps its capital; "Any gym" doesn't.
  if (first === undefined || (second !== undefined && /[A-Z]/.test(second))) return trimmed;
  return /^(any|a|an|the|my)\b/i.test(trimmed) ? first.toLowerCase() + trimmed.slice(1) : trimmed;
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // The radar sits a little above centre, clear of the panel under it.
    paddingBottom: 140,
  },
  ready: {
    gap: Spacing.three,
  },
  target: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  targetLabel: {
    color: PROOF_INK.violet,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  targetText: {
    color: PROOF_INK.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  status: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  statusText: {
    color: PROOF_INK.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statusDetail: {
    color: PROOF_INK.soft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
