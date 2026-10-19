# Publishing POPSMART on Google Play — walkthrough

You do this part — it needs your Google account, your ID, and your $25. I've prepared everything else.

## Step 1 — Developer account ($25 one-time)
1. Go to **play.google.com/console** and sign in with your Google account.
2. Pay the **$25 USD one-time registration fee**.
3. Verify your identity (Google asks for a government ID — takes a few hours to a couple of days).

## Step 2 — Create the app
1. In Play Console: **Create app**.
2. App name: **POPSMART**. Default language: **English (US)**.
3. App or game: **App**. Free or paid: **Paid** (a free app can never become paid later — starting paid keeps your options open).
4. Accept the declarations → **Create**.

## Step 3 — Set the price (CAD $5.00)
1. Go to **Monetize → Pricing & availability** (or **Grow → Store presence → Pricing** in the newer layout).
2. Set the price for **Canada to CAD $5.00**. Leave other countries on Google's auto-converted prices, or set them manually.
3. You'll need a **payments profile** (Google pay merchant setup) — it's part of the same flow, takes a few minutes.

## Step 4 — Upload the AAB (closed testing first)
New developer accounts **must** run a 14-day closed test with **12+ testers** before production. So:
1. Go to **Testing → Closed testing** → create a track.
2. Upload **`popsmart-v1.2.aab`** (in your files — I'll hand it to you when it's built).
3. Add at least 12 testers by email (friends, family — anyone with a Gmail).
4. Testers get a link, opt in, install. The 14-day clock starts with the first tester.

## Step 5 — Store listing (copy/paste from LISTING.md)
- **App name:** POPSMART
- **Short description:** `Bite-size learning: 440+ lessons, flashcards & quizzes. 35 subjects. Offline. Free.`
- **Full description:** in `play-store/LISTING.md`
- **Graphics** (in `play-store/`): `icon-512.png`, `feature-graphic.png`
- **Screenshots:** `assets/screenshot-dashboard.png`, `screenshot-learn.png`, `screenshot-tracker.png`
- **Category:** Education. **Tags:** microlearning, flashcards, study.

## Step 6 — The forms (answers ready)
- **Privacy policy:** push `play-store/PRIVACY.md` to the GitHub repo, paste the public URL.
- **Data safety:** *Does your app collect or share any user data?* → **No.** (It's fully offline.)
- **Content rating:** fill the IARC questionnaire honestly (educational content, nothing sensitive) → expect **Everyone**.
- **Target audience:** Everyone.
- **Ads:** No ads in the app.
- **App access:** No login required — everything works immediately.

## Step 7 — Go live
1. After 14 days of closed testing, apply for **production access** in Play Console.
2. Roll the tested release out to production.
3. Done — you're on the Play Store.

## For future updates
Bump `VER_CODE`/`VER_NAME` at the top of `~/workspace/apk-build/build_aab.sh`, run it, upload the new AAB. **Always sign with the same keystore** — password is in `~/workspace/apk-build/app/KEYSTORE_PASSWORD.txt` (move it to your password manager).
