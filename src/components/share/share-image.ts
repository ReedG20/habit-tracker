import type { RefObject } from 'react';
import { PixelRatio, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './share-card';

/** Story size. `captureRef` takes logical points, so divide by the screen's scale. */
const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = Math.round((IMAGE_WIDTH * SHARE_CARD_HEIGHT) / SHARE_CARD_WIDTH);

/**
 * Captures the card as a PNG and opens the share sheet with it and `message`.
 * React Native's `Share` rather than `expo-sharing`: only it sends text with
 * the file, and says which app was picked. Resolves to that app's activity
 * type, `shared` when iOS doesn't say, or `dismissed`.
 */
export async function shareCardImage(
  card: RefObject<View | null>,
  message: string,
): Promise<string> {
  const scale = PixelRatio.get();
  const uri = await captureRef(card, {
    format: 'png',
    result: 'tmpfile',
    width: IMAGE_WIDTH / scale,
    height: IMAGE_HEIGHT / scale,
  });
  const result = await Share.share({ url: uri, message });
  if (result.action === Share.dismissedAction) return 'dismissed';
  return result.activityType ?? 'shared';
}
