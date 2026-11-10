# Build prompt: Approved or Denied

Paste everything below into Codex or Claude Code in an empty repo.

---

Build a mobile-first web game called **Approved or Denied** (working title). The player sees a real vanity license plate application and rules on it, then sees what the California DMV actually decided and what the reviewer wrote. The goal of the site is viral traffic, so the three things that matter most are: playable within two seconds of landing, a reveal that is funny to watch, and a result that is easy to share.

Before writing code, give me a short plan and the list of questions you can't answer from this prompt. Then build it in the phases at the bottom, stopping after each phase so I can look.

## The data

Source: https://github.com/veltman/ca-license-plates (`applications.csv`). It holds 23,463 personalized plate applications that the California DMV flagged for review in 2015–2016, obtained through a public records request.

Columns: `plate`, `review_reason_code`, `customer_meaning`, `reviewer_comments`, `status` (`Y` approved, `N` denied).

Things I have already checked in the file:

- 18,757 are denied and 4,673 approved, roughly 80/20. A player who always taps Deny would win, so every deck must be dealt close to 50/50.
- 21,210 rows have both a customer meaning and a reviewer comment; 4,265 of those are approvals. That is the pool to draw from.
- About 30 rows have a junk status (blank, `M`, `?`, and so on). Drop them.
- In `plate`, `#` means a hand symbol, `$` a heart, `+` a plus and `&` a star. Render them as symbols.
- Placeholder text appears in the meaning and comment fields, for example "NOT ON QUICKWEB YET" and "No micro". Drop those rows.
- The repo has no license file. The records are public, but credit the dataset and its compiler on the About page and link the repo.

Write a build-time script (not runtime) that turns the CSV into the game's JSON deck:

1. Drop rows with junk status, missing meaning, missing comment, or placeholder text.
2. Drop rows containing slurs or hate terms, using a blocklist, in the plate, the meaning and the comment. Crude and sexual humor stays; racial, ethnic, religious and homophobic slurs go. When unsure, drop the row.
3. Drop rows whose meaning or comment includes what looks like a full name, phone number, address or email.
4. Dedupe by plate.
5. Score the remaining rows for how good a round they make. Good rounds have a plausible innocent explanation and a reviewer comment that is funny, surprising or absurd. Very short comments ("NO", "OK") make weak reveals.
6. Write `deck.json` with the top candidates, balanced 50/50, plus a `review.csv` I can edit by hand to remove or pin rows. The build must respect my edits.

Quote plates, meanings and reviewer comments exactly as they appear in the records. Fix nothing, including typos.

## The game

One screen, no scrolling, no login.

- A plate graphic showing the requested text. Make it look like a generic license plate. Do not copy California's official plate design, seal or script.
- Under it, "Applicant says:" and the customer's explanation.
- Two large buttons in thumb reach: **APPROVE** and **DENY**. Swiping right and left does the same thing.
- On answer: a rubber-stamp animation with the real outcome, then "DMV reviewer wrote:" and the comment. This reveal is the product. Give it timing, sound (off by default, one tap to enable) and a haptic buzz where the browser supports it.
- Tap to go to the next plate.

Two modes:

- **Daily docket.** Ten plates, the same ten in the same order for everyone, chosen from the deck by date seed, five approved and five denied. Score out of ten. One play per day; after that, show the result and a countdown to the next docket.
- **Streak.** Endless plates until the first wrong ruling. Shows current streak and personal best.

Sharing, on the result screen of both modes:

- A text result that pastes anywhere, such as `Approved or Denied #42  8/10  ✅✅❌✅✅✅❌✅✅✅` plus the URL, with no spoilers of the plates themselves.
- Use the Web Share API when present and fall back to copy-to-clipboard.
- Open Graph and Twitter card tags with a good-looking preview image.

Also include a first-visit notice that the game contains crude language from real applications, an About page (what this is, where the data came from, "not affiliated with the California DMV"), and a simple stats panel (games played, best streak, daily history).

## Constraints

- Static site with no backend. Deck ships as JSON. It must deploy to Cloudflare Pages, Netlify or Vercel as-is.
- TypeScript. Pick a light framework (or none) and tell me why. The JavaScript needed before the first plate is interactive should stay under about 100 KB gzipped.
- Mobile first: design for a 375 px wide phone held in one hand, then make desktop look good too. Use `100dvh`, respect safe-area insets, and keep all tap targets at least 48 px.
- Portrait recordings should look good. People will screen-record this for TikTok and Reels, so keep the plate and the reveal in the middle of the screen and avoid tiny text.
- Player state lives in `localStorage` only. Wrap every read and write in try/catch so private-browsing modes don't break the game.
- Works offline after first load is a nice-to-have, not a requirement.
- Accessible: buttons are real buttons, keyboard works (A and D, or arrow keys), color is never the only signal, and animations respect `prefers-reduced-motion`.
- Add privacy-friendly analytics hooks behind a single config flag (events: round answered, daily finished, streak ended, share tapped). Don't add a cookie banner dependency.

## Phases

1. **Data pipeline.** The script, `deck.json`, `review.csv`, and a printed summary: rows kept, rows dropped per rule, approve/deny split. Stop for my review of the deck.
2. **Core loop.** Streak mode with the plate, the buttons, swipe and the reveal. Stop.
3. **Daily docket and sharing.** Stop.
4. **Polish.** Sound, haptics, About, stats, share image, performance pass.
5. **Optional, ask me first.** A static page per plate ("Why did the DMV deny ___?") for search traffic, each linking into the game.

## Done means

- Unit tests cover the date-seeded daily deck (same date gives the same ten, five of each outcome), the scoring, and the share string.
- The daily deck never repeats a plate within 60 days.
- Lighthouse mobile scores of 90 or higher for performance and accessibility.
- I can run it locally with one command and deploy it with one more. Both are in the README.
