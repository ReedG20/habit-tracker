import { useNavigation } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ProPaywall } from '@/components/pro-paywall';
import { showToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';

/** The paywall as a sheet, opened from the Me screen's Ante Pro row. */
export default function ProScreen() {
  const navigation = useNavigation();

  const dismiss = () => {
    // The sheet is swipe-dismissable; if it is already gone, `goBack` would
    // pop the screen underneath instead.
    if (navigation.isFocused()) {
      navigation.goBack();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.sheet} alwaysBounceVertical={false}>
      <ProPaywall
        onDismiss={dismiss}
        onFinished={(outcome) => {
          dismiss();
          if (outcome === 'purchased') {
            showToast('Welcome to Ante Pro', 'Your subscription is active.', 'success');
          } else {
            showToast('Subscription restored', 'Ante Pro is active on this device.', 'success');
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
});
