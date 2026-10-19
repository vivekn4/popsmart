# POPSMART — Google Play listing pack (v1.1)

## The one thing that costs money
- **Google Play developer account: $25 USD one-time.** Everything else here is ready. You pay it once inside Play Console; there's no way around it.

## Upload file
- `~/workspace/your_files/popsmart-v1.1.aab` — signed Android App Bundle, versionCode 2, versionName 1.1, targets **API 36** (Android 16, the current Play requirement).
- Upload key: NEW keystore at `~/workspace/apk-build/app/popsmart-upload.keystore` (the v1.0 sideload key's password is unknown, so v1.1 uses a fresh upload key — fine for a first Play listing). Password is in `~/workspace/apk-build/app/KEYSTORE_PASSWORD.txt` (chmod 600) — **move it into your password manager and keep it forever.** Every future update must be signed with this same key.

## Store listing copy
- **App name:** POPSMART
- **Short description (80 chars):**
  `Bite-size learning: 530+ lessons, flashcards & quizzes. 35 subjects. Offline. Free.`
- **Full description:**
```
Learn anything in 2-minute reps. POPSMART turns big subjects into bite-size lessons, smart flashcards, and quick checkpoints that actually stick.

35 SUBJECTS — Game Design, Drawing, Fitness, Meditation, How Cars Work, Spreadsheets, Time Management, AI & Machine Learning, Cybersecurity, Football IQ, Job Interview Prep, Python, Chess, Finance, Psychology, and more.

HOW IT WORKS
• Bite-size lesson cards — one idea per card, zero fluff
• SM-2 spaced-repetition flashcards that resurface what you're about to forget
• Checkpoints that test you, then explain every answer

GAME ON
• Global XP and 20+ levels, from Rookie to Grandmaster
• Answer combos with XP multipliers
• 3 fresh daily quests every day
• 13 badges, a sticker book, and day streaks
• 13 synthesized sound effects — zero audio downloads

PRIVATE BY DESIGN
• 100% offline — no account, no ads, no tracking, no data collection
• Everything lives on your device

Small reps. Big brain.
```

## Graphics (in `~/workspace/microlearn/play-store/`)
- `icon-512.png` — 512×512 store icon
- `feature-graphic.png` — 1024×500 feature graphic
- Screenshots: use `~/workspace/microlearn/assets/screenshot-dashboard.png`, `screenshot-learn.png`, `screenshot-tracker.png` (412×915 phone portraits — take fresh ones from the v1.1 build if you want the new widgets visible)

## Privacy policy
- `PRIVACY.md` in this folder — push it to the GitHub repo and use the public URL as the Play Console privacy-policy link, e.g. `https://github.com/vivekn4/popsmart/blob/main/play-store/PRIVACY.md` (or host it on a site).

## Play Console forms — how to answer
- **Data safety:** "Does your app collect or share any user data?" → **No.**
- **Content rating (IARC):** Educational, no violence/sexual content/gambling → expect **Everyone**.
- **Target audience:** 13+ (or Everyone — your call; Everyone is simplest).
- **Ads:** No ads.
- **App access:** No login needed — all functionality available immediately.
- **Closed testing:** New personal developer accounts must run a **14-day closed test with 12+ testers** before production access. Plan for this.

## Checklist
1. [ ] Pay the $25 developer fee, create the app in Play Console
2. [ ] Upload `popsmart-v1.1.aab` to the closed-testing track
3. [ ] Fill store listing (copy + graphics above)
4. [ ] Privacy policy URL, data safety = no collection, content rating, target audience
5. [ ] Run the 14-day closed test (12+ testers)
6. [ ] Apply for production, roll out

**Price:** Paid — CAD $5.00
