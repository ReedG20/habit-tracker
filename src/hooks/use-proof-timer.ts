import { useMutation } from 'convex/react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Habit } from '@/data/habits';
import { captureError, track } from '@/lib/analytics';
import { todayKey } from '@/lib/dates';
import { notificationsSupported, type PushData } from '@/lib/notifications';
import { proofErrorMessage } from '@/lib/proof-errors';

/**
 * A timer that only counts while Ante stays in the foreground.
 *
 * The server keeps the clock (`timerProofs.start` / `finish`), so a run can't
 * be finished early. The app's job is noticing when it was left:
 *
 * - `AppState` going to `background` (switching apps, going home, locking the
 *   phone) cuts the run short. `inactive` alone (Control Center, a pulled-down
 *   notification) doesn't: the app is still on screen.
 * - JavaScript can be suspended before that event is handled, so while a run
 *   is going the app keeps a local "timer stopped" notification scheduled a
 *   few seconds out and keeps pushing it back. If the app stops pushing it
 *   back (suspended, killed), it fires on its own. Coming back after a gap in
 *   the heartbeat counts as leaving, too.
 *
 * Cutting a run short is only a failed attempt: the server files it as a
 * rejected check, the day stays open, and a new run can start right away.
 */

export type TimerPhase =
  | { kind: 'ready' }
  | { kind: 'starting' }
  | { kind: 'running'; startedAt: number; endsAt: number; durationMs: number }
  | { kind: 'finishing' }
  | { kind: 'done'; durationMs: number }
  | { kind: 'left'; elapsedMs: number }
  | { kind: 'stopped'; elapsedMs: number }
  /** `unfinished` is a run that ran out but couldn't be logged yet: "Try again" retries it. */
  | { kind: 'error'; message: string; unfinished?: Run };

export type Run = {
  runId: Id<'habitTimerRuns'>;
  startedAt: number;
  endsAt: number;
  durationMs: number;
};

const KEEP_AWAKE_TAG = 'proof-timer';
const BEAT_MS = 500;
/** How often the guard notification is pushed back, and how far. */
const GUARD_REFRESH_MS = 2000;
const GUARD_DELAY_S = 6;
/** A heartbeat gap this long means JavaScript was suspended: the app was left. */
const STALL_MS = 5000;
/** The server allows this much slack; retry `finish` if the clocks disagree by more. */
const FINISH_RETRIES = 3;
const FINISH_RETRY_MS = 1500;

export function useProofTimer(habit: Habit) {
  const startRun = useMutation(api.timerProofs.start);
  const finishRun = useMutation(api.timerProofs.finish);
  const abandonRun = useMutation(api.timerProofs.abandon);

  const [phase, setPhase] = useState<TimerPhase>({ kind: 'ready' });
  const run = useRef<Run | null>(null);
  /** The last heartbeat: a gap means JavaScript was suspended, i.e. the app was left. */
  const lastTick = useRef(0);
  /** When the guard notification was last pushed back. */
  const lastGuard = useRef(0);
  /** Set while a start is in flight, so a double tap can't start two runs. */
  const starting = useRef(false);
  const mounted = useRef(true);
  const canNotify = useRef(false);
  /** The run whose "timer stopped" notification may be sitting in Notification Center. */
  const leftRunId = useRef<string | null>(null);
  /** An abandon that may not have reached the server before JavaScript was suspended. */
  const unsent = useRef<{ runId: Id<'habitTimerRuns'>; reason: 'left' | 'stopped' } | null>(null);

  const guardId = (runId: string) => `timer-${runId}`;

  const guardContent = (): Notifications.NotificationContentInput => {
    const data: PushData = {
      kind: 'timer',
      habitId: habit._id,
      url: `/habit/${habit._id}/prove`,
    };
    return {
      title: `Timer stopped: ${habit.title}`,
      body: 'It isn’t logged. Ante has to stay open for the timer to count. Tap to start again.',
      data,
      sound: 'default',
      // It breaks through a Focus: a Focus is exactly when someone would miss it.
      interruptionLevel: 'timeSensitive',
    };
  };

  const scheduleGuard = (runId: string, seconds: number | null) => {
    if (!canNotify.current) return;
    void Notifications.scheduleNotificationAsync({
      identifier: guardId(runId),
      content: guardContent(),
      trigger:
        seconds === null
          ? null
          : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    }).catch((error: unknown) => console.warn('Could not schedule the timer guard', error));
  };

  const cancelGuard = (runId: string) => {
    if (!notificationsSupported) return;
    void Notifications.cancelScheduledNotificationAsync(guardId(runId)).catch(() => {});
  };

  const sendAbandon = (runId: Id<'habitTimerRuns'>, reason: 'left' | 'stopped') => {
    unsent.current = { runId, reason };
    abandonRun({ runId, reason })
      .then(() => {
        if (unsent.current?.runId === runId) unsent.current = null;
      })
      .catch((error: unknown) => {
        console.warn('Could not report the stopped timer yet', error);
      });
  };

  /** Ends the current run without counting it. */
  const cutShort = (reason: 'left' | 'stopped') => {
    const current = run.current;
    if (current === null) return;
    run.current = null;
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});

    if (reason === 'left') {
      scheduleGuard(current.runId, null);
      leftRunId.current = current.runId;
    } else {
      cancelGuard(current.runId);
    }

    const elapsedMs = Math.min(Date.now() - current.startedAt, current.durationMs);
    setPhase({ kind: reason, elapsedMs });
    sendAbandon(current.runId, reason);
  };

  /** Logs a run that ran out. The server has the last word on whether it counts. */
  const finish = async (current: Run) => {
    setPhase({ kind: 'finishing' });
    for (let attempt = 0; ; attempt += 1) {
      try {
        const { logged } = await finishRun({ runId: current.runId });
        if (logged) {
          track('habit checked in', {
            method: 'timer',
            duration_minutes: Math.round(current.durationMs / 60_000),
          });
        }
        // Only when the run ended long before the app got to finish it: it was left.
        setPhase(
          logged
            ? { kind: 'done', durationMs: current.durationMs }
            : { kind: 'left', elapsedMs: current.durationMs },
        );
        return;
      } catch (error: unknown) {
        const early = proofErrorMessage(error, '').includes('isn’t done yet');
        if (early && attempt < FINISH_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, FINISH_RETRY_MS));
          continue;
        }
        console.error('Failed to finish the timer', error);
        captureError(error, 'habit timer proof');
        const message = proofErrorMessage(error, '');
        setPhase({
          kind: 'error',
          message: message || 'We couldn’t log it. Check your connection.',
          // A refusal is final; a dropped connection can be retried for the same run.
          unfinished: message === '' ? current : undefined,
        });
        return;
      }
    }
  };

  const complete = () => {
    const current = run.current;
    if (current === null) return;
    run.current = null;
    cancelGuard(current.runId);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    void finish(current);
  };

  const start = async () => {
    if (starting.current || run.current !== null) return;
    starting.current = true;
    setPhase({ kind: 'starting' });

    try {
      if (notificationsSupported) {
        const permission = await Notifications.getPermissionsAsync().catch(() => null);
        canNotify.current = permission?.granted === true;
      }

      const started = await startRun({ habitId: habit._id, day: todayKey() });
      if (!mounted.current) {
        // The screen went away while the server was starting it: drop the run.
        abandonRun({ runId: started.runId, reason: 'stopped' }).catch(() => {});
        return;
      }
      if (AppState.currentState === 'background') {
        // Left while it was starting: that counts as leaving, like any other time.
        setPhase({ kind: 'left', elapsedMs: 0 });
        sendAbandon(started.runId, 'left');
        return;
      }
      // The app's clock starts once the server's has: the server's end is never later.
      const startedAt = Date.now();
      const next: Run = {
        runId: started.runId,
        startedAt,
        endsAt: startedAt + started.durationMs,
        durationMs: started.durationMs,
      };
      run.current = next;
      lastTick.current = startedAt;
      lastGuard.current = startedAt;
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      scheduleGuard(next.runId, GUARD_DELAY_S);
      setPhase({ kind: 'running', ...next });
    } catch (error: unknown) {
      console.error('Failed to start the timer', error);
      setPhase({
        kind: 'error',
        message: proofErrorMessage(error, 'We couldn’t start the timer. Check your connection.'),
      });
    } finally {
      starting.current = false;
    }
  };

  const running = phase.kind === 'running';

  const beat = useEffectEvent(() => {
    const current = run.current;
    if (current === null) return;
    const now = Date.now();
    // First, before anything else: after a suspension an overdue tick can run
    // before the queued `background` event. A gap means the app was left, even
    // if the time has run out meanwhile.
    if (now - lastTick.current > STALL_MS) {
      cutShort('left');
      return;
    }
    lastTick.current = now;
    if (now >= current.endsAt) {
      complete();
      return;
    }
    if (now - lastGuard.current >= GUARD_REFRESH_MS) {
      lastGuard.current = now;
      scheduleGuard(current.runId, GUARD_DELAY_S);
    }
  });

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => beat(), BEAT_MS);
    return () => clearInterval(interval);
  }, [running]);

  const onAppState = useEffectEvent((state: string) => {
    if (state === 'background') {
      cutShort('left');
      return;
    }
    if (state !== 'active') return;

    // Back after JavaScript was suspended mid-run: that was leaving too.
    if (run.current !== null && Date.now() - lastTick.current > STALL_MS) cutShort('left');

    const pending = unsent.current;
    if (pending !== null) sendAbandon(pending.runId, pending.reason);

    // They're looking at the result now; the notification has said its piece.
    const left = leftRunId.current;
    if (left !== null && notificationsSupported) {
      leftRunId.current = null;
      void Notifications.dismissNotificationAsync(guardId(left)).catch(() => {});
    }
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => onAppState(state));
    return () => subscription.remove();
  }, []);

  // Closing the screen mid-run (it shouldn't be possible, but a deep link could) ends it.
  const onUnmount = useEffectEvent(() => {
    const current = run.current;
    if (current === null) return;
    run.current = null;
    cancelGuard(current.runId);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    abandonRun({ runId: current.runId, reason: 'stopped' }).catch(() => {});
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onUnmount();
    };
  }, []);

  return {
    phase,
    start: () => void start(),
    stop: () => cutShort('stopped'),
    /** Back to the start screen, or another go at logging a run that already ran out. */
    retry: () => {
      if (phase.kind === 'error' && phase.unfinished !== undefined) {
        void finish(phase.unfinished);
      } else {
        setPhase({ kind: 'ready' });
      }
    },
  };
}
