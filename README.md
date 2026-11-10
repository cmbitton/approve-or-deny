# Approved or Denied

A mobile-first web game: rule on a real vanity plate application, then see what the California DMV decided and what the reviewer wrote.

Status: Phases 1–4 done, plus shareable per-plate links. Live at https://cmbitton.github.io/approve-or-deny/.

## Run it

```sh
npm install && npm run dev      # http://localhost:5173
```

## Deploy it

**GitHub Pages (current):** every push to `master` runs `.github/workflows/pages.yml`, which tests, builds and publishes to https://cmbitton.github.io/approve-or-deny/. One-time setup: repo Settings → Pages → Source: **GitHub Actions**. The build uses relative paths, so it works in that subfolder and at a domain root alike.

**Cloudflare Pages (later, with a domain):** set `SITE_URL` in `src/site.ts` to the new address, then

```sh
npm run deploy   # builds, then uploads dist/ (asks you to log in the first time)
```

Scores and stats are saved per web address, so players moving from the github.io address to a new domain start fresh there.

Netlify and Vercel work as-is too: connect the repo and they pick up `netlify.toml` / `vercel.json` (build command `npm run build`, output folder `dist`). Cache headers are set in `public/_headers` (Cloudflare Pages, Netlify) and `vercel.json`.

Other commands: `npm run build` (static site in `dist/`, including the shared-plate pages), `npm run preview` (serve the build), `npm test`, `npm run typecheck`.

Two modes: **Daily** (the same ten plates for everyone, five approved and five denied, new at 00:00 UTC, one play per day) and **Streak** (endless until your first wrong ruling).

Also: sound (off until you tap the speaker; synthesized in the browser, no audio files), vibration on phones that support it, a stats panel, an About panel, and offline play after the first visit (`public/sw.js`).

Controls: tap **Approve** / **Deny**, swipe the plate right / left, or press `D` / `→` and `A` / `←`. After the reveal, tap anywhere, press `N`, or press Enter on the focused button to continue.

Settings:

- **Site address:** `SITE_URL` in `src/site.ts`. Share text, link previews and the shared-plate pages all read it; change it when moving to a custom domain.
- **Analytics:** off unless built with `VITE_ANALYTICS=on`, which sends events to the hook in `src/analytics.ts`.

## Shared-plate links

Every plate in the deck gets its own page, so a link to one plate shows that plate in iMessage, Discord, Slack or X previews. Link previewers don't run JavaScript, so these are real files made at build time:

- `dist/p/<id>/index.html`: the game, opened on that plate, with its own Open Graph / Twitter tags (absolute URLs) and `noindex`. Nothing on it reveals the verdict.
- `dist/p/<id>/card.png`: a 1200×630 preview image, the plate in the game's style plus the applicant's explanation and "Would you approve this?" (`scripts/share/card.ts`, fonts in `scripts/share/fonts/`).
- `dist/404.html`: links to plates that have since left the deck go to the game.

`<id>` is an 8-character hash of the plate text (`scripts/lib/ids.ts`), stored in `deck.json` and in the `id` column of `data/review.csv`. It doesn't depend on row order or on which other plates are in the deck, so links keep working across rebuilds as long as the plate stays in the deck.

Someone opening a shared link judges that plate, sees the answer and the reviewer's note, then gets a button into today's Daily. A shared plate doesn't count toward daily results, streaks or stats. Every reveal has a small share icon in the corner of the reviewer's note card, which opens the native share sheet or copies the link. The card also shows the game's name and address, for people who screenshot instead.

Rebuilding: `npm run build` makes everything. `scripts/build-share.ts` runs after `vite build` and caches images in `.cache/cards` by content, so only plates whose text or artwork changed are redrawn. Drawing all 4,000 from scratch takes about 80 seconds on 16 cores; GitHub Actions keeps the cache between runs. After changing the artwork, bump `CARD_VERSION` in `scripts/share/card.ts`. Size: about 98 MB of images and 39 MB of pages.

## Data pipeline

```sh
npm run deck          # data/raw/applications.csv -> public/deck.json + data/review.csv
npm run deck -- --per-side 1500   # change deck size (default 2000 approved + 2000 denied; at most ~3550)
npm test
```

The pipeline runs at build time only. In order, it:

1. Drops rows with a junk status, a missing meaning or comment, or placeholder text ("NO MICRO", "NOT ON QUICKWEB YET", "NO MEANING ON REG 17", "N/A", ...).
2. Drops rows that hit `data/blocklist.txt` (slurs, hate terms, and reviewer notes such as "RACIAL" or "HITLER" that flag them) in the plate, meaning or comment. Plates are also checked with number-for-letter swaps undone (`N1G` → `NIG`).
3. Drops rows whose meaning or comment has an email, phone number, street address, or what looks like a "First Last" name (using the lists in `data/wordlists/`).
4. Dedupes by plate. If copies disagree on the outcome, all copies are dropped.
5. Scores each row (`scripts/lib/score.ts`) and writes the top rows, balanced 50/50, to `public/deck.json`.

Plates, meanings and comments are copied byte-for-byte from the source, typos included.

### Editing the deck by hand

`data/review.csv` lists **every** eligible row, deck rows first, sorted by score. Put one of these in the `action` column and rerun `npm run deck`:

| action   | effect                                            |
| -------- | ------------------------------------------------- |
| `pin`    | always in the deck, whatever its score            |
| `remove` | never in the deck                                 |

Only the `action` column is read back; edits to other columns are overwritten. Actions are keyed by plate and carried into each regenerated file. An action on a plate that's no longer eligible is kept at the bottom of the file and reported in the summary.

To block a term everywhere, add it to `data/blocklist.txt` (the file explains its syntax).

### Daily schedule

`npm run deck` also writes `public/daily.json`: ten plates per docket, from docket #1 through two years past today. Each docket has five approved and five denied, and no plate repeats within 60 days.

- Docket #1 falls on the schedule's start date, 2026-11-10 by default. Set your launch day once with `npm run deck -- --epoch 2026-12-01`; it's remembered in `daily.json` after that.
- Rebuilding never changes today's or tomorrow's docket (UTC), so edits to `review.csv` can't swap plates out from under people mid-game. The one exception is a plate you `remove`: any docket containing it is regenerated.
- Rerun `npm run deck` at least once a year so the schedule doesn't run out (past the end it wraps around).

### Link preview image

`public/og.png` is rendered from `scripts/og/og.html` (1200×630). Edit the HTML and re-screenshot it with any headless browser if you want a different card.

## Credits

Data: [veltman/ca-license-plates](https://github.com/veltman/ca-license-plates), compiled by Noah Veltman from a California DMV public records release. Not affiliated with the California DMV.

Plate font: [Barlow Condensed](https://github.com/jpt/barlow), SIL Open Font License 1.1.

Name lists in `data/wordlists/`: [dominictarr/random-name](https://github.com/dominictarr/random-name), [smashew/NameDatabases](https://github.com/smashew/NameDatabases), [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english).
