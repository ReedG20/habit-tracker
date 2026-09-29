/**
 * Blacks its children out of session replays, for anything the blanket
 * text-input and image masking can't recognise (a drawn signature) or that is
 * too personal to leave to it (proof photos).
 */
export { PostHogMaskView as ReplayMask } from 'posthog-react-native';
