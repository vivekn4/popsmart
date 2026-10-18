# POPSMART

**Bite-size learning that adapts to you.** A hyper-personalized micro-learning companion with a neo-brutalist sticker-pop design.

## What's inside

- **27 subjects** — coding, languages, science, cooking, music, finance, and more (410 lesson cards, 320 flashcards, 400 checkpoint questions)
- **Bite-size lessons** — 2-minute cards: read, tips, examples, quick checks
- **Smart flashcards** — SM-2 spaced repetition, due-card scheduling
- **Skill checkpoints** — quizzes that gate level progression
- **Adaptive engine** — tracks accuracy, pace, and rhythm; suggests your sharpest study hour and ideal session length
- **Learning tracker** — every subject's level, XP, accuracy, and streaks in one place
- **Badges** — 9 milestones (streaks, perfect scores, polymath…) with confetti celebrations
- **Share** — post achievements via Web Share or clipboard
- **Dopamine sounds** — procedural WebAudio chimes, fanfares, and pops (mutable)
- **Subject search + filters** — find anything in the catalog instantly

## Run it

No build step, no dependencies. Open `index.html` in a browser — or serve the folder:

```bash
npx serve .
# or
python3 -m http.server
```

Progress saves to `localStorage` — everything runs client-side, nothing leaves your device.

## Tech

Vanilla HTML/CSS/JS. Zero dependencies, zero network requests. ~120KB total.

- `index.html` — app shell, routes, SVG icon sprite
- `css/style.css` — neo-brutalist design system
- `js/app.js` — router, store, shell
- `js/engine.js` — learning engine (lessons, SM-2, checkpoints, adaptive stats)
- `js/views.js` — view renderers
- `js/rewards.js` — badges, celebrations, sharing
- `js/sound.js` — procedural WebAudio effects
- `data/pack-*.json` — 27 content packs (also bundled in `data/packs.js` for `file://` use)

## License

MIT — learn freely.
