import { ConvexError } from 'convex/values';

/**
 * The icons a habit or goal can wear, hand-picked from the free HugeIcons set
 * for things people commit to. The name check picks one from the name
 * (`commitmentIdeas.checkName`), and the picker offers the same set.
 *
 * Plain data, so the server and the prompt never import any SVG: the app maps
 * each key to its glyph in `src/constants/commitment-icons.ts`, which fails to
 * typecheck if the two lists drift apart. A key is what gets stored, so a
 * glyph can be swapped without touching data; never rename or reuse one.
 *
 * The hints are for the model (and the picker's accessibility labels): what
 * the icon should be picked for, most typical first.
 */
export const COMMITMENT_ICON_GROUPS = [
  {
    label: 'Fitness',
    icons: [
      { key: 'gym', hint: 'gym, lifting weights, strength training' },
      { key: 'muscle', hint: 'push-ups, pull-ups, bodyweight strength, arms' },
      { key: 'kettlebell', hint: 'kettlebell, home workout' },
      { key: 'workout', hint: 'workout, HIIT, calisthenics, exercise in general' },
      { key: 'stretch', hint: 'stretching, mobility, flexibility, pilates' },
      { key: 'yoga', hint: 'yoga' },
      { key: 'run', hint: 'running, jogging, sprints' },
      { key: 'running-shoes', hint: 'race training, 5k, marathon' },
      { key: 'treadmill', hint: 'treadmill, cardio machine' },
      { key: 'walk', hint: 'walking, daily steps' },
      { key: 'hike', hint: 'hiking, trails' },
      { key: 'bike', hint: 'cycling, biking, spin class' },
      { key: 'swim', hint: 'swimming, laps' },
      { key: 'boxing', hint: 'boxing, martial arts, kickboxing' },
      { key: 'football', hint: 'football, soccer' },
      { key: 'basketball', hint: 'basketball' },
      { key: 'tennis', hint: 'tennis, padel, squash, badminton' },
      { key: 'golf', hint: 'golf' },
      { key: 'ski', hint: 'skiing, snowboarding' },
      { key: 'surf', hint: 'surfing' },
      { key: 'kayak', hint: 'kayaking, rowing, paddling' },
      { key: 'mountain', hint: 'climbing, bouldering, summit a peak' },
      { key: 'weigh-in', hint: 'weigh-in, lose weight, reach a weight' },
    ],
  },
  {
    label: 'Health',
    icons: [
      { key: 'pulse', hint: 'heart health, cardio, heart rate' },
      { key: 'health', hint: 'health, checkup, doctor appointment' },
      { key: 'pills', hint: 'medication, vitamins, supplements' },
      { key: 'tooth', hint: 'floss, brush teeth, dentist' },
      { key: 'lungs', hint: 'breathwork, breathing exercises' },
      { key: 'first-aid', hint: 'first aid, physio, rehab exercises' },
      { key: 'shower', hint: 'cold shower, shower, hygiene' },
      { key: 'bath', hint: 'bath, relaxing soak' },
      { key: 'mirror', hint: 'skincare, grooming, getting ready' },
    ],
  },
  {
    label: 'Food and drink',
    icons: [
      { key: 'water', hint: 'drink water, hydration' },
      { key: 'salad', hint: 'eat healthy, vegetables, salad' },
      { key: 'apple', hint: 'fruit, healthy snacks' },
      { key: 'carrot', hint: 'vegetables, eat your greens' },
      { key: 'vegetarian', hint: 'vegetarian, vegan, plant-based' },
      { key: 'protein', hint: 'protein, eat meat, macros' },
      { key: 'egg', hint: 'breakfast, eggs' },
      { key: 'cook', hint: 'cook at home, meal prep' },
      { key: 'chef', hint: 'learn to cook, new recipes' },
      { key: 'bread', hint: 'baking, bread' },
      { key: 'meals', hint: 'meals, intermittent fasting, eating schedule' },
      { key: 'coffee', hint: 'coffee, less caffeine' },
      { key: 'tea', hint: 'tea' },
      { key: 'no-sugar', hint: 'no sugar, no sweets, no candy, no dessert' },
      { key: 'no-alcohol', hint: 'no alcohol, sober, dry month' },
    ],
  },
  {
    label: 'Sleep and routine',
    icons: [
      { key: 'sleep', hint: 'sleep, bedtime, get eight hours' },
      { key: 'bed', hint: 'make the bed' },
      { key: 'night', hint: 'night routine, wind down, no screens at night' },
      { key: 'sunrise', hint: 'wake up early, morning routine' },
      { key: 'sun', hint: 'go outside, sunlight, touch grass' },
      { key: 'alarm', hint: 'wake on time, no snoozing' },
      { key: 'focus-timer', hint: 'focus sessions, deep work, pomodoro' },
      { key: 'calendar', hint: 'plan the week, schedule' },
      { key: 'checklist', hint: 'to-do list, daily tasks, planning' },
    ],
  },
  {
    label: 'Mind',
    icons: [
      { key: 'meditate', hint: 'meditation, mindfulness, sitting still' },
      { key: 'brain', hint: 'mental fitness, brain training, therapy' },
      { key: 'journal', hint: 'journaling, diary, gratitude journal' },
      { key: 'pray', hint: 'prayer, gratitude, faith' },
      { key: 'prayer-rug', hint: 'salah, prayer on a mat' },
      { key: 'church', hint: 'church, mass, worship' },
      { key: 'leaf', hint: 'calm, slow down, nature, less stress' },
      { key: 'smile', hint: 'mood, happiness, compliments, kindness' },
      { key: 'sparkles', hint: 'self-care, fresh start, treat yourself' },
    ],
  },
  {
    label: 'Learning',
    icons: [
      { key: 'book', hint: 'read books, reading' },
      { key: 'open-book', hint: 'read pages, textbook, scripture' },
      { key: 'library', hint: 'library, research' },
      { key: 'write', hint: 'writing, a novel, blog posts, poetry' },
      { key: 'study', hint: 'study, homework, revision' },
      { key: 'graduate', hint: 'exams, graduate, finish a course or degree' },
      { key: 'school', hint: 'school, classes, attend lectures' },
      { key: 'language', hint: 'learn a language, Duolingo, Spanish, vocabulary' },
      { key: 'code', hint: 'coding, programming, build an app' },
      { key: 'laptop', hint: 'computer work, online course' },
      { key: 'idea', hint: 'ideas, side project, creativity' },
      { key: 'news', hint: 'read the news, newsletter' },
      { key: 'chess', hint: 'chess, strategy games' },
      { key: 'puzzle', hint: 'puzzles, crosswords, sudoku' },
    ],
  },
  {
    label: 'Money',
    icons: [
      { key: 'piggy-bank', hint: 'save money' },
      { key: 'savings-jar', hint: 'savings goal, emergency fund' },
      { key: 'wallet', hint: 'budget, track spending, no-spend days' },
      { key: 'coins', hint: 'pay off debt, spare change' },
      { key: 'cash', hint: 'earn money, income, sales' },
      { key: 'invest', hint: 'invest, grow a number, revenue, metrics' },
      { key: 'bills', hint: 'bills, taxes, invoices, paperwork' },
      { key: 'crypto', hint: 'crypto, bitcoin' },
      { key: 'shopping', hint: 'groceries, shopping, buy less' },
    ],
  },
  {
    label: 'Creative',
    icons: [
      { key: 'music', hint: 'music practice, piano, singing, an instrument' },
      { key: 'guitar', hint: 'guitar, bass, ukulele' },
      { key: 'drum', hint: 'drums, percussion' },
      { key: 'headphones', hint: 'listen to music, podcasts, produce beats' },
      { key: 'mic', hint: 'sing, podcast, public speaking, voice' },
      { key: 'paint', hint: 'painting, art' },
      { key: 'draw', hint: 'drawing, sketching, design' },
      { key: 'camera', hint: 'photography, photo a day' },
      { key: 'film', hint: 'film, watch fewer shows, movies' },
      { key: 'video', hint: 'make videos, YouTube, content creation' },
      { key: 'game', hint: 'games, game dev, less gaming' },
    ],
  },
  {
    label: 'Cutting back',
    icons: [
      { key: 'no-smoking', hint: 'quit smoking, vaping, nicotine' },
      { key: 'no-phone', hint: 'less screen time, no phone, social media detox' },
    ],
  },
  {
    label: 'Home',
    icons: [
      { key: 'clean', hint: 'clean, tidy up, declutter' },
      { key: 'vacuum', hint: 'vacuum, floors' },
      { key: 'mop', hint: 'chores, mop, dishes' },
      { key: 'laundry', hint: 'laundry' },
      { key: 'home', hint: 'home, house project, move' },
      { key: 'repair', hint: 'fix things, DIY, repairs' },
      { key: 'houseplant', hint: 'water the plants, houseplants' },
      { key: 'garden', hint: 'gardening, grow food' },
      { key: 'recycle', hint: 'recycle, compost, sustainability' },
    ],
  },
  {
    label: 'People',
    icons: [
      { key: 'friends', hint: 'see friends, socialise, meet people' },
      { key: 'call', hint: 'call family, call parents, phone a friend' },
      { key: 'message', hint: 'reach out, reply to messages, text a friend' },
      { key: 'kids', hint: 'time with the kids, family' },
      { key: 'love', hint: 'date night, partner, relationship' },
      { key: 'charity', hint: 'volunteer, donate, give back' },
      { key: 'gift', hint: 'gifts, thoughtful gestures' },
      { key: 'mail', hint: 'inbox zero, email, letters' },
    ],
  },
  {
    label: 'Pets and outdoors',
    icons: [
      { key: 'dog', hint: 'walk the dog, pet care, train a puppy' },
      { key: 'cat', hint: 'cat, litter box' },
      { key: 'tree', hint: 'nature, park, outdoors' },
      { key: 'camping', hint: 'camping' },
      { key: 'travel', hint: 'travel, trip, see the world' },
      { key: 'plane', hint: 'flights, visit someone far away' },
      { key: 'car', hint: 'driving, driving lessons, car care' },
    ],
  },
  {
    label: 'Work and goals',
    icons: [
      { key: 'work', hint: 'work, career, job search' },
      { key: 'rocket', hint: 'launch, ship, startup' },
      { key: 'presentation', hint: 'presentation, pitch, a talk' },
      { key: 'handshake', hint: 'networking, meet clients, close a deal' },
      { key: 'trophy', hint: 'win, compete, tournament' },
      { key: 'medal', hint: 'race, finish an event' },
      { key: 'target', hint: 'hit a target, a number to reach' },
      { key: 'flag', hint: 'milestone, finish line, deadline' },
    ],
  },
] as const;

export type CommitmentIconKey = (typeof COMMITMENT_ICON_GROUPS)[number]['icons'][number]['key'];

type CommitmentIcon = { key: CommitmentIconKey; hint: string };

export const COMMITMENT_ICONS: readonly CommitmentIcon[] = COMMITMENT_ICON_GROUPS.flatMap(
  (group): readonly CommitmentIcon[] => group.icons,
);

const keys = new Set<string>(COMMITMENT_ICONS.map((icon) => icon.key));

export function isCommitmentIconKey(key: string): key is CommitmentIconKey {
  return keys.has(key);
}

/**
 * A key from the model's answer, or `null` if it made one up. The schema
 * can't hold the keys as an enum: Gemini refuses one this long outright.
 */
export function parseIconKey(raw: string): CommitmentIconKey | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '');
  return isCommitmentIconKey(key) ? key : null;
}

/** Throws when a client sends a key the app doesn't know. */
export function requireCommitmentIcon(icon: string | undefined): void {
  if (icon !== undefined && !isCommitmentIconKey(icon)) {
    throw new ConvexError('Pick one of the icons offered');
  }
}

/** The menu the model picks from, one `key: hint` line per icon, grouped. */
const ICON_MENU = COMMITMENT_ICON_GROUPS.map(
  (group) =>
    `${group.label}:\n${group.icons.map((icon) => `- ${icon.key}: ${icon.hint}`).join('\n')}`,
).join('\n');

/**
 * How to choose, shared by the name check and the icon-only pick so both
 * choose alike. Free of user text, so it caches with the prompts around it.
 */
export const ICON_GUIDANCE = `Pick the one key from the list below whose picture best depicts the activity or outcome the name describes. Prefer the specific over the generic: running is "run", not "workout"; reading a book is "book". For quitting or cutting back on something, use its "no-" icon when there is one ("Quit vaping": "no-smoking"). When nothing fits closely, pick the nearest broader one, and "checklist" for a habit or "target" for a goal only as a last resort.

${ICON_MENU}`;
