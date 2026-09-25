# Ante design notes

How the app looks and sounds as of September 2026, and the patterns new screens
should follow. The source of truth is the code: tokens live in
`src/constants/theme.ts`, icons in `src/constants/icons.ts`.

## The feel

Flat, quiet, and a little stern. Pure black or white backgrounds, grey
surfaces, no shadows, capsules everywhere. Two hand-drawn faces carry the
personality: Comico for headings, Mansalva for asides to the user; everything
else is system text. Colour is rare and
means something: violet is "do this", red-orange is "this costs you".

## Tokens

| Token                    | Light              | Dark               | Used for                                                  |
| ------------------------ | ------------------ | ------------------ | --------------------------------------------------------- |
| `background`             | `#FFFFFF`          | `#000000`          | Screens                                                   |
| `backgroundElement`      | `#F0F0F3`          | `#212225`          | Cards, fields, grouped lists, unselected chips            |
| `backgroundSelected`     | `#E0E1E6`          | `#2E3135`          | Selected segments, empty progress                         |
| `text` / `textSecondary` | `#000` / `#60646C` | `#FFF` / `#B0B4BA` | Body / supporting lines, labels                           |
| `border`                 | `#DDDDE3`          | `#2E3135`          | Dividers, unselected card outlines                        |
| `primary`                | `#4121FF`          | `#4121FF`          | Brand violet: main buttons, selection, badges; the splash |
| `accent`                 | `#FF391F`          | `#FF391F`          | Stakes, flames, freezes, errors, countdowns               |

Shape: `ControlHeight` 48 (buttons, one-line fields), `BorderRadius` 16
(icon tiles), `CardRadius` 24 (cards, sheets, toasts), `ActionCardRadius` 40
(list cards, concentric with a 48pt button inset 16), `PillRadius` for chips.
Spacing is a 4pt scale (`Spacing.one`–`six` = 4, 8, 16, 24, 32, 64).

## Type

| Role                     | Style                                    |
| ------------------------ | ---------------------------------------- |
| Screen title             | Comico 32/40 (`ScreenHeadingTypography`) |
| Section and sheet title  | Comico 22/28 (`Fonts.sectionHeading`)    |
| Hero number (stakes fee) | Comico 64/76                             |
| Body                     | System 16/24, weight 500                 |
| Labels, chips, buttons   | 14, semibold (600, never bold)           |
| Handwritten aside        | Mansalva 19/28 (`Note`), lowercase       |

Comico sits high in its line box and Mansalva's ascenders run tall; give both a
generous `lineHeight` or they clip.

## Components to reach for

- **Buttons:** `ActionButton` (`variant` neutral / primary / destructive,
  `fill`, `size`). On iOS it is a real SwiftUI glass button; elsewhere
  `GlassButton`. Key it when it swaps branches — the SwiftUI host keeps its
  first measurement.
- **Fields:** `TextField` (capsule, SwiftUI on iOS; read values through
  `readValueRef`, change events trail the native text), `DeadlineField`,
  `StakePicker`, and the `HabitSheetFields` / `GoalSheetFields` sets.
- **Cards:** `HabitCard`, `GoalCard`, `PlanCard` (radio), onboarding's
  `ChoiceCard` (the same radio with an icon tile and detail line) and
  `ChoiceChip` (the stake picker's pill, toggleable).
- **Containers:** `ScreenScrollView` for tab screens, `FormSheet` for edit
  sheets, `StepLayout` for the commitment contract's steps, `OnboardingScreen`
  for onboarding steps with a pinned action.
- **The commitment contract** (`src/components/commitment/`): `WhatStep`,
  `StakesStep`, `SignStep` (signature pad plus `HoldToConfirmButton`),
  `LockedIn`, `StepProgress`, `WhatHappens`, `Note`. `/new` and onboarding both
  compose these; onboarding adds survey suggestions and holds money back.
- **Pickers:** `SegmentedPicker` (SwiftUI segmented on iOS) for two or three
  options, `StakeAmountPicker` for money.
- **Feedback:** `showToast(title, message, tone)` (glass capsule, slides from
  the top; sits under UIKit sheets, so sheets show errors inline) and
  `selectionHaptic` / `successHaptic` from `src/lib/haptics.ts` (the
  signature pad and hold button drive `expo-haptics` directly).
- **Icons:** HugeIcons only, stroke 1.75, one deep import per icon in
  `src/constants/icons.ts`. No SF Symbols, no PNG exports (tab icons excepted).

## Layout patterns

- No native headers. Pushed screens start with a "‹ Back" row, then a Comico
  title and one secondary line.
- Tabs are Today, Commitments and Me. Tab screens: title block, then sections
  with Comico 22 headings over cards.
- Creating a habit or goal is a full-screen modal contract in three steps (what
  and its proof, the stakes, sign and hold to lock), then "It’s on." Nothing is
  created until the hold completes.
- Editing: form sheets (grabber, radius 24, transparent so iOS 26 glass shows
  through) with Cancel + a filled primary button.
- Other big flows (submitting proof, onboarding) are full screens with one
  filled primary action pinned at the bottom.

## Voice

Second person, short sentences, accountability with a light touch. Typographic
`’`, `…` and `—`. Buttons say what happens: "Put $10 on it", "Submit for
review", "Start 7-day free trial"; busy states say "One moment…" or "Working…".

> One-off commitments with a deadline. Put money on one to make it real.
>
> Miss one day and Ante locks. Your other commitments freeze with it.

Handwritten notes are the coach in the margin: lowercase, one line, dry.

> the lock is the point. it’s cheaper to just do it.

## Motion and gotchas

- Motion is sparse: native stack pushes and sheets, the toast's slide, the
  contract's step fade and progress fill, and the hold-to-lock fill.
- Glass renders nothing under an animating opacity, so anything holding glass
  should slide, not fade.
- `GlassView` takes `borderRadius` literally (no clamping): pass `height / 2`.
- Never put a SwiftUI `ActionButton` in a sheet with an RN `TextInput`: the
  SwiftUI host steals first responder.
- The welcome screen is the one full-bleed violet screen; it sets a light
  status bar imperatively on focus, because it stays mounted under later steps.

## Known gaps

- Paywall benefits are placeholder copy until the free/Pro split is decided.
- No illustration beyond the brand mark (`assets/brand/`).
- Reminders row on the Me screen has no destination yet.
- The web build fails on `Appearance.setColorScheme` (theme preference).
