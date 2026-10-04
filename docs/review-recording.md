# App Review screen recording

Apple's 2.1 request (2026-10-03) asks for a recording made on a physical
device running the latest iOS. It must:

- start with launching the app
- show the typical user flow: registration, login and account deletion
- show the subscription flow, including each plan's title, length and price,
  and links to the Terms and Privacy Policy

This plan makes **two separate, unedited videos**, each starting at app launch.
Both are recorded on the **TestFlight build under review**: 1.0.0 (15) plus
the production OTA. Nothing is stitched or trimmed, so the reviewer sees the
money moment happen live.

- **Video 1, the full tour:** a brand-new Ante account, from first launch to
  account deletion.
- **Video 2, the money stake:** your existing Ante account. A real $1 goal is
  missed, then the loss screen and the contest.

Record Video 2 first. Video 1 ends by deleting an account, and its purchase can
move Ante Pro off your existing account.

**Accounts.** TestFlight has no sandbox tester accounts. In-app purchases use
the Apple ID signed in on the phone, in Apple's test mode, so they never really
charge. Only the **Ante** account is new in Video 1. The Apple ID is the same
one in both videos.

## Before you record (not filmed)

1. **iOS.** Settings → General → Software Update should show nothing pending.
   Apple says "latest operating system", so use the newest public iOS 27.
2. **The build.**
   - In TestFlight, install 1.0.0 (15).
   - Open Ante, close it fully, and open it again so the production OTA applies.
   - Me → Help should show `1.0.0 (15) · update …`.
3. **Quiet phone.**
   - Turn on a Focus that lets **only Ante** through.
   - Set Settings → Display & Brightness → Auto-Lock to **Never**, since
     Video 2 sits still for 3 minutes. Turn it back afterwards.
   - Hide any personal widgets on the home screen.
4. **Screen recording.**
   - Add Screen Recording to Control Center.
   - Long-press it and leave the microphone **off**.
5. **Card number.** The Stripe sheet shows the card number as you type it, and
   with no editing it can't be covered afterwards. Use a virtual card number
   from your bank, or a card with a low limit.
6. **Use up the one-time reprieve (important).**
   - A person's first staked miss is forgiven once: a goal gets 48 hours more
     and no charge (`convex/lib/grace.ts`). If yours hasn't been used, Video 2
     shows the reprieve screen instead of the loss screen.
   - Rehearse on your existing account:
     - Make a goal titled **"Photo of a glass of water"**.
     - Proof: photo. Stake: **$1** money.
     - Deadline: **3 minutes from now**.
     - Don't prove it. Wait on Today.
   - What you see when the deadline passes:
     - **Loss screen:** the reprieve was already used, and the money path works
       on prod. Refund that $1 in the Stripe dashboard.
     - **Reprieve screen ("We only do this once"):** it's now used up for this
       account. Prove that goal with a photo of a glass of water; that releases
       the stake so it never charges.
   - Either way, the next miss on this account charges.
7. **Pro on the existing account.**
   - Me should show Ante Pro active. If the paywall shows instead, subscribe
     (test mode).
   - Also check Settings → your name → Subscriptions. Every TestFlight purchase
     uses your real Apple ID, so an earlier Ante Pro purchase may still be
     active there. If it is, Apple's sheet in Video 1 may say you're already
     subscribed, or leave out the yearly trial.
   - That's acceptable, since the paywall itself shows each plan's price.
     Cancelling it a day ahead is cleaner.
8. **A sign-in Ante has never seen, for Video 1.**
   - Your Apple ID already has an Ante account, so Sign in with Apple would
     **log in, not register**.
   - Use **Continue with Google** with a second Google account that has never
     used Ante.
   - Don't use the demo account in App Store Connect, because Video 1 deletes
     the account it creates.
9. **Rehearse Video 1 once without recording.**
   - Confirm the onboarding steps match the script and the photo goal gets
     approved.
   - Delete that rehearsal account at the end.
   - Delete Ante and reinstall it from TestFlight, so the app is fresh.

## Video 2: money stake (one take, about 5 minutes; record this first)

1. Start recording on the home screen, then tap **Ante**. Today loads.
2. Tap **+** and choose **Goal · one deadline**.
3. Title: **"Send the draft chapter to my editor"**, or anything plain.
   Proof: **Photo**.
4. Deadline: today, **3 minutes from now**. Pause a second so the time can be
   read.
5. On the stakes step:
   - Pause on the four options, then choose **Money**, **$1**.
   - Hold on the line "By tapping 'Put $1 on it', you confirm you're 18 or
     older…" for two seconds.
   - Tap **Terms**, let the page load, and go back.
6. Tap **Put $1 on it**. Enter the card in the Stripe sheet and tap **Save**.
   Nothing is charged at this point.
7. Sign the contract with your finger. Hold on the contract text with the
   authorization line, then finish. "It's on." shows.
8. Stay on Today with the goal's countdown visible. Don't touch anything else.
   If the deadline has already passed by the time you're back on Today, that's
   fine: the loss screen comes up within seconds.
9. At the deadline, the loss screen opens on its own. It shows "$1 was
   charged", the signed contract stamped MISSED, and the card's last four
   digits. Scroll slowly once.
10. Tap **"Something wrong, or did something come up?"**
    - Pick a reason.
    - If it asks for a note, type something short, like "Testing the contest
      flow for App Review."
    - Tap **Send**. The confirmation shows.
11. Go back to Today, then stop recording.

**Afterwards:**

- Refund the $1 in Stripe.
- The contest email arrives at support@useanteapp.com. Close that case.

## Video 1: full tour on a new account (one take, about 3–4 minutes)

Ante has just been reinstalled from TestFlight.

1. **Launch.** Start recording on the home screen and tap **Ante**. The splash
   shows, then onboarding.
2. **Onboarding.** Make the first commitment a goal you can prove on camera:
   - Title: **"Clear off my desk"**, due **tonight**, proof **Photo**.
   - When "Use AI to help?" appears, tap **Allow**.
   - Stakes: pause on the four options, then pick **Just my word**. The money
     flow is in Video 2.
   - Sign it.
3. **Registration.**
   - Tap **Continue with Google** and choose the never-used Google account.
   - Allow notifications when asked.
4. **Paywall: the required details.**
   - Hold still for **3 seconds** so both plans show their name, length
     ("/ year", "/ month") and price.
   - Tap **Terms**, let it load, and go back.
   - Tap **Privacy**, let it load, and go back.
5. **Purchase.**
   - Choose **Monthly** and subscribe. Apple's test-mode sheet appears.
   - Confirm. "It's on." shows.
6. **Main feature: proof.**
   - On Today, open the goal and prove it with a photo of the clear desk.
   - Allow "Let AI check your proof?".
   - The verdict arrives, then the Kept screen.
7. **A quick look around.**
   - Open Commitments.
   - Open Me and show the calendar, Preferences (the AI switch) and Help
     (Contact support, Terms, Privacy).
8. **Login.** Me → **Sign out**, then **Continue with Google** with the same
   account. Today comes back with the kept goal.
9. **Account deletion.** Me → **Delete account**. Read the screen for a second,
   then confirm. The app returns to the start. Stop recording.

## Attach

- App Review Information takes **one attachment**, and the reply box adds none
  you'd need. So the two unedited takes are joined end to end, Video 1 then
  Video 2, into `app-flows-recording.mov`. Each take is uncut.
- The reply and the Notes (`docs/app-review-reply.txt`) say:
  - which iOS version and build it was recorded on
  - that the money part used live Stripe, with the $1 refunded afterwards
  - that there's no user-generated content to report or block

## Gotchas found while recording (2026-10-03)

- **TestFlight purchases use your real Apple ID**, not a sandbox tester.
  - A TestFlight subscription can't be cancelled, and it doesn't appear in
    Settings. It renews daily six times, then lapses.
  - RevenueCat moves it to any new Ante account on that phone, so the paywall
    shows "You already have Ante Pro" instead of the plans.
  - To film the plans with prices, wait for it to lapse, or use a preview build
    with a fresh sandbox tester.
- **The first miss is forgiven once.** Without the rehearsal miss, the loss
  take shows the reprieve screen instead.
- **The loss screen won't open over the new-commitment flow.** Tap through to
  Today before the deadline.
