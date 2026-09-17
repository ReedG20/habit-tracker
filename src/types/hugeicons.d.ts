/**
 * `@hugeicons/core-free-icons` ships type declarations only for its barrel entry point,
 * so the per-icon deep imports used in `src/constants/icons.ts` need to be typed here.
 */
declare module '@hugeicons/core-free-icons/*' {
  import type { IconSvgElement } from '@hugeicons/react-native';

  const icon: IconSvgElement;
  export default icon;
}
