import { useLocalSearchParams, useNavigation } from 'expo-router';

import { ProPaywallScreen } from '@/components/pro-paywall-screen';
import { showToast } from '@/components/toast';
import { PAYWALL_SOURCES, type PaywallSource } from '@/lib/analytics-events';

/** The paywall as a full page, opened with `openPaywall` from wherever Pro is missing. */
export default function ProScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = parseSource(params.source);

  const dismiss = () => {
    // A double close must not pop the screen underneath too.
    if (navigation.isFocused()) {
      navigation.goBack();
    }
  };

  return (
    <ProPaywallScreen
      source={source}
      onClose={dismiss}
      onFinished={(outcome) => {
        dismiss();
        if (outcome === 'purchased') {
          showToast('Welcome to Ante Pro', 'Your subscription is active.', 'success');
        } else {
          showToast('Subscription restored', 'Ante Pro is active on this device.', 'success');
        }
      }}
    />
  );
}

function parseSource(value: string | undefined): Exclude<PaywallSource, 'onboarding'> {
  const known = PAYWALL_SOURCES.find((source) => source === value);
  return known === undefined || known === 'onboarding' ? 'me' : known;
}
