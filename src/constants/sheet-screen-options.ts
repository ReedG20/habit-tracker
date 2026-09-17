/**
 * `formSheet` is a real `UISheetPresentationController` on iOS, so the sheet
 * picks up the system liquid-glass chrome on iOS 26 while its content stays
 * React Native.
 *
 * Numeric detents (not `fitToContents`) so the sheet does not resize and
 * remount when the keyboard or field focus changes. `flex: 1` is valid with
 * numeric detents. Transparent `contentStyle` lets the glass show through.
 */
export const sheetScreenOptions = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.58],
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
};
