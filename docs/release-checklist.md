# Release checklist: on-device smoke test

Run on a real iPhone with the **TestFlight production build** before each
App Store submission (about 45 minutes). Production means live Stripe: money
stakes charge real cards. Ante Pro through TestFlight is always sandbox, and
its periods run on TestFlight's clock (about a day each).

Record the build number tested: `1.0.0 (____)`.

## 1. Fresh start
- [ ] Delete Ante, install from TestFlight, open it. No crash; the splash leaves.
- [ ] Onboarding: every step, decline notifications once to check it carries on.
- [ ] "Use AI to help?" appears when naming the first commitment. Tap **Not now**:
      the name still goes through (no ideas shown). Re-enable later in Me → Preferences.
- [ ] Sign in with Apple, choosing **Hide My Email**.
- [ ] On the paywall: **Sign out** works and returns to sign-in. Sign back in.
- [ ] On the paywall: **Delete account** opens the delete screen; go Back without deleting.

## 2. Ante Pro (sandbox)
- [ ] Plans load with prices; the yearly trial line shows only if eligible.
- [ ] Subscribe; the first commitment goes live ("It's on.").
- [ ] Me → Pro shows the plan. **Restore purchases** on the paywall works on a reinstall.

## 3. Money stake, end to end (≈$1, refunded)
- [ ] New goal due in about an hour with a **$1** money stake. The line under the
      steps reads "By tapping 'Put $1 on it', you confirm you're 18 or older…", and
      **Terms** opens the Terms page.
- [ ] Save a real card in the Stripe sheet. Nothing is charged (check Stripe).
- [ ] The signed contract ends with "I'm 18 or older, and I authorize Ante to make this charge."
- [ ] Don't prove it. After the deadline: either the one-time reprieve screen (first
      miss ever for this person) or the loss screen with "$1 was charged".
- [ ] If charged: the statement descriptor in Stripe reads `ANTE APP* MISSED GOAL`;
      the receipt email arrives unless the address is a private relay.
- [ ] "Something wrong with this charge?" → send a contest. The case email reaches
      support@useanteapp.com.
- [ ] Refund it in Stripe. The app shows Refunded, and a "Refunded" push arrives.

## 4. Proof
- [ ] Photo habit: "Let AI check your proof?" asks once; Allow. Take a photo: a
      verdict arrives in seconds. In the Convex dashboard (prod → Files), the new
      photo is ~1600px and a few hundred KB, not several MB.
- [ ] Pick a photo from the library taken today: accepted. One from yesterday: refused.
- [ ] Location habit at a real place: check in, and it's accepted (needs
      `GOOGLE_PLACES_API_KEY` on prod).
- [ ] Timer habit: run the shortest timer to the end.

## 5. Reminders and email
- [ ] Me → Reminders → send a test push: it arrives.
- [ ] A habit due tonight gets its reminder.
- [ ] A "Tell a friend" stake: the friend (use your own second address) gets the
      heads-up email after the call-off window.

## 6. The rest
- [ ] Raise the stakes on a habit; call off a brand-new commitment.
- [ ] Share a card to Messages; the link opens useanteapp.com/get.
- [ ] Dark mode and the largest text size on Today, a commitment and the paywall.
- [ ] Me → Help: Contact support, Terms and Privacy open.
- [ ] Delete a throwaway account (a second Google account) from Me → Delete account:
      signs out; the user's rows are gone in Convex; its Stripe customer is deleted.

## 7. Record the review video
Screen-record (60–90 s) arming a money stake, the loss screen (a real miss or Me →
Developer → preview on a dev build), and the contest form. Attach it in App Store
Connect → App Review Information.
