import { View, type ViewProps } from 'react-native';

/** No replays on web: a plain view, so layouts match the native wrapper. */
export function ReplayMask(props: ViewProps) {
  return <View {...props} />;
}
