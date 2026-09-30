import { StyleSheet, View } from 'react-native';
import Animated, { Easing, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { LockIcon, Mail01Icon, Money03Icon, Tick02Icon } from '@/constants/icons';
import { PillRadius, Spacing } from '@/constants/theme';
import type { StakeKind } from '@/convex/lib/stakeRules';
import { useTheme } from '@/hooks/use-theme';

const RUNGS: { kind: StakeKind; name: string; icon: typeof Money03Icon }[] = [
  { kind: 'none', name: 'Word', icon: Tick02Icon },
  { kind: 'lockout', name: 'Lockout', icon: LockIcon },
  { kind: 'friend', name: 'Friend', icon: Mail01Icon },
  { kind: 'money', name: 'Money', icon: Money03Icon },
];

const DOT = 36;
// The climb eases into place: a spring would overshoot past the rung it's reaching for.
const CLIMB = LinearTransition.duration(280).easing(Easing.out(Easing.cubic));
// A small pop for the picked rung, settled quickly.
const POP = ZoomIn.springify().damping(22);

export type StakeLadderProps = {
  commitment: 'habit' | 'goal';
  /** Where the stake sits now. */
  current: { kind: StakeKind; label?: string };
  /** Where it's going: the kind being picked, and its size once known ("$25", "a week"). */
  picked: { kind: StakeKind; label?: string };
};

/**
 * The stakes as a ladder, low to high: where the commitment sits now, marked
 * "Now", and the rung being picked, lit up. Everything below "Now" is faded,
 * which says "only up" without a sentence. Goals have no lockout rung.
 */
export function StakeLadder({ commitment, current, picked }: StakeLadderProps) {
  const theme = useTheme();
  const rungs = RUNGS.filter((rung) => commitment === 'habit' || rung.kind !== 'lockout');
  const at = (kind: StakeKind) => rungs.findIndex((rung) => rung.kind === kind);
  const now = at(current.kind);
  const to = Math.max(now, at(picked.kind));
  const center = (index: number) => `${((index + 0.5) / rungs.length) * 100}%` as const;
  const pickedName = rungs[to]?.name ?? '';

  return (
    <View
      style={styles.ladder}
      accessible
      accessibilityLabel={`Now: ${rungs[now]?.name ?? 'Word'}${current.label ? `, ${current.label}` : ''}. Raising to: ${pickedName}${picked.label ? `, ${picked.label}` : ''}.`}>
      {/* The rail, and the climb from now to the pick drawn over it. */}
      <View
        style={[styles.rail, { left: center(0), right: center(0), backgroundColor: theme.border }]}
      />
      <Animated.View
        layout={CLIMB}
        style={[
          styles.rail,
          {
            left: center(now),
            width: `${((to - now) / rungs.length) * 100}%`,
            backgroundColor: theme.primary,
          },
        ]}
      />

      {rungs.map((rung, index) => {
        const below = index < now;
        const isNow = index === now;
        const isPicked = index === to;
        const sublabel = isPicked
          ? isNow && current.label !== undefined && picked.label !== undefined
            ? `${current.label} → ${picked.label}`
            : (picked.label ?? (isNow ? 'Now' : undefined))
          : isNow
            ? 'Now'
            : undefined;

        return (
          <View key={rung.kind} style={[styles.rung, below && styles.below]}>
            <Animated.View
              // Remounts as the pick moves, so the new rung pops in.
              key={isPicked ? 'picked' : 'rung'}
              entering={isPicked ? POP : undefined}
              style={[
                styles.dot,
                { backgroundColor: isPicked ? theme.primary : theme.backgroundElement },
                isNow && !isPicked && { borderWidth: 2, borderColor: theme.textSecondary },
              ]}>
              <Icon
                icon={rung.icon}
                size={18}
                strokeWidth={2}
                color={isPicked ? theme.onPrimary : theme.textSecondary}
              />
            </Animated.View>
            <ThemedText
              type={isPicked ? 'smallSemibold' : 'small'}
              themeColor={isPicked ? 'text' : 'textSecondary'}>
              {rung.name}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor={isPicked ? 'primary' : 'textSecondary'}
              style={styles.sublabel}
              numberOfLines={1}>
              {sublabel ?? ' '}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ladder: {
    flexDirection: 'row',
  },
  rail: {
    position: 'absolute',
    top: DOT / 2 - 1,
    height: 2,
    borderRadius: 1,
  },
  rung: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  below: {
    opacity: 0.4,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sublabel: {
    fontVariant: ['tabular-nums'],
  },
});
