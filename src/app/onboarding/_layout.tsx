import { Stack } from 'expo-router';

/**
 * The first-run flow: welcome → how it works → three questions → the first
 * commitment's contract (what, stakes, sign) → sign-in → paywall. Each step is
 * a push, so swipe-back works through the survey; the contract and paywall
 * turn it off.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Its own Back walks the contract's steps, and a left-to-right signature
          stroke would otherwise be read as the swipe-back gesture. */}
      <Stack.Screen name="commitment" options={{ gestureEnabled: false }} />
      <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
