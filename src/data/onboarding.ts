/**
 * The first-run flow's questions and the logic that turns answers into a
 * suggested first commitment. Pure, so it is unit-tested; the screens under
 * `src/app/onboarding/` and the store in `src/lib/onboarding.ts` build on it.
 */

import { defaultDueAt, MIN_LEAD_MS, type CommitmentKind } from '@/components/commitment/draft';

export type FocusArea =
  'fitness' | 'health' | 'focus' | 'learning' | 'money' | 'mind' | 'home' | 'other';

export type History = 'fades' | 'never_start' | 'consistent' | 'first_try';

export type Motivator = 'money' | 'proof' | 'streak' | 'unsure';

export type OnboardingAnswers = {
  areas: FocusArea[];
  history?: History;
  motivator?: Motivator;
};

/**
 * `new`: the flow is showing (a fresh install, or a replay).
 * `drafted`: the first commitment is written down on the device but not saved
 * yet; the flow resumes at sign-in or the paywall.
 * `done`: finished or skipped. `null` (never written) is treated as done for a
 * signed-in user, so people who signed up before onboarding existed never see it.
 */
export type OnboardingStatus = 'new' | 'drafted' | 'done';

export const focusAreaOptions: { value: FocusArea; label: string }[] = [
  { value: 'fitness', label: 'Fitness' },
  { value: 'health', label: 'Health' },
  { value: 'focus', label: 'Focus & work' },
  { value: 'learning', label: 'Learning' },
  { value: 'money', label: 'Money' },
  { value: 'mind', label: 'Mind' },
  { value: 'home', label: 'Home' },
  { value: 'other', label: 'Something else' },
];

export const historyOptions: { value: History; label: string; detail: string }[] = [
  {
    value: 'fades',
    label: 'Strong start, then it fades',
    detail: 'Week one is easy. Week three is not.',
  },
  {
    value: 'never_start',
    label: 'I never quite get started',
    detail: 'There is always a better Monday.',
  },
  {
    value: 'consistent',
    label: 'I’m consistent, I want more',
    detail: 'The basics hold. Time to raise the bar.',
  },
  { value: 'first_try', label: 'This is my first real try', detail: 'Starting clean.' },
];

export const motivatorOptions: { value: Motivator; label: string; detail: string }[] = [
  { value: 'money', label: 'Money on the line', detail: 'It only counts if it costs something.' },
  { value: 'proof', label: 'Proof someone checks', detail: 'Saying I did it isn’t enough.' },
  { value: 'streak', label: 'Not breaking a streak', detail: 'Day 40 is too good to throw away.' },
  { value: 'unsure', label: 'Not sure yet', detail: 'Let’s find out.' },
];

/** The one-line reply under the first contract step's title, so the survey feels heard. */
export function historyReply(history: History | undefined): string {
  switch (history) {
    case 'fades':
      return 'Fading is the gap Ante is built for: a missed day costs you something.';
    case 'never_start':
      return 'Then give it a deadline. Deadlines get things started.';
    case 'consistent':
      return 'Good. Stakes turn consistent into non-negotiable.';
    case 'first_try':
      return 'Good time to start. Pick one thing — just one.';
    default:
      return 'Start with one. You can add more once it sticks.';
  }
}

/**
 * Habits are the core of Ante, so they are the default. A goal fits people who
 * struggle to begin (a deadline forces the first step) or who already have the
 * daily basics down; a streak-lover always gets a habit.
 */
export function suggestKind(answers: OnboardingAnswers): CommitmentKind {
  if (answers.motivator === 'streak') return 'habit';
  if (answers.history === 'never_start' || answers.history === 'consistent') return 'goal';
  return 'habit';
}

/** A preset for the contract's first step: a name, and what the photo has to show. */
export type Suggestion = { title: string; proof: string };

const suggestions: Record<Exclude<FocusArea, 'other'>, Record<CommitmentKind, Suggestion[]>> = {
  fitness: {
    habit: [
      { title: 'Work out for 20 minutes', proof: 'Me mid-workout, with the gym or trail in view' },
      { title: 'Walk 8,000 steps', proof: 'Today’s step count on my phone or watch' },
    ],
    goal: [
      { title: 'Run a 5K', proof: 'My watch or running app showing a finished 5 km run' },
      { title: 'Go to three classes', proof: 'Me at each class, with the studio in view' },
    ],
  },
  health: {
    habit: [
      { title: 'Drink 2 litres of water', proof: 'My empty 2-litre bottle at the end of the day' },
      { title: 'In bed by 11', proof: 'The clock showing before 11, taken from bed' },
    ],
    goal: [
      { title: 'Book a checkup', proof: 'The booking confirmation with the date on it' },
      { title: 'Cook every dinner this week', proof: 'Each plate I cooked, on my table' },
    ],
  },
  focus: {
    habit: [
      { title: 'Two hours of deep work', proof: 'My desk mid-session, phone out of reach' },
      { title: 'Inbox zero by 6', proof: 'My empty inbox with the time showing' },
    ],
    goal: [
      {
        title: 'Ship the landing page',
        proof: 'The live site open on my laptop, not a screenshot',
      },
      { title: 'Send the proposal', proof: 'The sent email with the date showing' },
    ],
  },
  learning: {
    habit: [
      { title: 'Read 10 pages', proof: 'The page I finished on, page number in view' },
      { title: 'Practise a language for 15 minutes', proof: 'Today’s finished lesson screen' },
    ],
    goal: [
      { title: 'Finish the course', proof: 'The completion certificate with my name on it' },
      { title: 'Finish the book', proof: 'The last page, with the book in my hand' },
    ],
  },
  money: {
    habit: [
      { title: 'Log every purchase', proof: 'Today’s entries in my budget app' },
      { title: 'No takeout', proof: 'What I cooked instead, on the plate' },
    ],
    goal: [
      { title: 'Set up automatic savings', proof: 'The scheduled transfer in my bank app' },
      { title: 'Cancel three subscriptions', proof: 'Each cancellation confirmation' },
    ],
  },
  mind: {
    habit: [
      { title: 'Meditate for 10 minutes', proof: 'The finished session in my meditation app' },
      { title: 'Journal one page', proof: 'Today’s page, dated and filled' },
    ],
    goal: [
      { title: 'Take a full day offline', proof: 'My phone switched off, in a drawer' },
      { title: 'Call three old friends', proof: 'The call log showing each call' },
    ],
  },
  home: {
    habit: [
      { title: 'Make the bed', proof: 'The made bed, pillows and all' },
      { title: 'Ten-minute tidy', proof: 'The room afterwards, floor and surfaces clear' },
    ],
    goal: [
      { title: 'Clear out the closet', proof: 'The bags going out the door' },
      { title: 'Fix the thing I keep ignoring', proof: 'It, fixed and working' },
    ],
  },
};

/** For "Something else" or no answer: broad enough to fit most people. */
const fallbackAreas: Exclude<FocusArea, 'other'>[] = ['fitness', 'focus', 'learning'];

/**
 * Up to `limit` presets for the contract's first step, round-robin across the chosen
 * areas so every area gets its best suggestion before any gets a second.
 */
export function suggestionsFor(areas: FocusArea[], kind: CommitmentKind, limit = 4): Suggestion[] {
  const specific = areas.filter((area): area is Exclude<FocusArea, 'other'> => area !== 'other');
  const chosen = specific.length > 0 ? specific : fallbackAreas;
  const lists = chosen.map((area) => suggestions[area][kind]);
  const depth = Math.max(...lists.map((list) => list.length));

  const result: Suggestion[] = [];
  for (let i = 0; i < depth && result.length < limit; i++) {
    for (const list of lists) {
      const suggestion = list[i];
      if (suggestion !== undefined && result.length < limit) result.push(suggestion);
    }
  }

  return result;
}

/**
 * A goal drafted before sign-in can go stale if the app is left for a day
 * before the flow resumes; rather than fail the create, it rolls forward to
 * the next default deadline.
 */
export function freshDueAt(dueAt: number, now: number = Date.now()): number {
  return dueAt >= now + MIN_LEAD_MS ? dueAt : defaultDueAt(now);
}

/** Whether the root navigator shows the onboarding stack. */
export function shouldShowOnboarding(
  status: OnboardingStatus | null,
  isAuthenticated: boolean,
): boolean {
  if (isAuthenticated) return status === 'new' || status === 'drafted';
  return status !== 'done';
}

/**
 * The steps that carry a progress bar, in order. Welcome and the paywall don't.
 * `what`, `stakes` and `sign` are the commitment contract's own three steps.
 */
export const progressSteps = [
  'how',
  'focus',
  'history',
  'motivator',
  'what',
  'stakes',
  'sign',
  'save',
] as const;

export type ProgressStep = (typeof progressSteps)[number];

export function commitmentNoun(kind: CommitmentKind): string {
  return kind === 'habit' ? 'habit' : 'goal';
}
