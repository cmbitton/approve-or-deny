// Build step: one shareable page and preview image per plate.
//   dist/p/<id>/index.html   the game, opened on that plate, with its own link-preview tags
//   dist/p/<id>/card.png     1200x630 preview image (scripts/share/card.ts)
//   dist/404.html            sends links to plates that have since left the deck to the game
//
// Runs after `vite build` (it copies dist/index.html). Images are cached in .cache/cards by
// content hash, so a rebuild only renders plates whose text or artwork changed.
// Usage: node scripts/build-share.ts [--limit N]

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Deck, Round } from '../src/deck-types.ts';
import { plateText } from '../src/plate.ts';
import { SHORT_URL, SITE_URL } from '../src/site.ts';
import { CARD_VERSION, HEIGHT, WIDTH } from './share/card.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(root, 'dist');
const CACHE = resolve(root, '.cache/cards');
const FONT_DIR = resolve(root, 'scripts/share/fonts');

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!existsSync(resolve(DIST, 'index.html'))) throw new Error('dist/index.html not found: run `vite build` first.');
const template = readFileSync(resolve(DIST, 'index.html'), 'utf8');
const deck: Deck = JSON.parse(readFileSync(resolve(DIST, 'deck.json'), 'utf8'));
const rounds = deck.rounds.slice(0, limit);

// ---------- Pages ----------

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Shortens on a word boundary. */
function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,.;:!?-]+$/, '')}…`;
}

// Tags this step replaces. Everything else in the built page (scripts, styles, the
// About text) is kept exactly as Vite wrote it.
const REPLACED = [
  /^\s*<title>[^<]*<\/title>\n/m,
  /^\s*<meta name="description"[^>]*>\n/m,
  /^\s*<link rel="canonical"[^>]*>\n/m,
  /^\s*<meta property="og:[^>]*>\n/gm,
  /^\s*<meta name="twitter:[^>]*>\n/gm,
];
let base = template;
for (const re of REPLACED) {
  if (!re.test(base)) throw new Error(`build-share: expected to find ${re} in dist/index.html`);
  base = base.replace(re, '');
}
const CHARSET = '<meta charset="utf-8" />';
if (!base.includes(CHARSET)) throw new Error('build-share: no charset meta in dist/index.html');

function page(r: Round): string {
  const plate = plateText(r.p);
  const url = `${SITE_URL}/p/${r.id}/`;
  const title = `Would you approve “${plate}”?`;
  const description = `The applicant says: “${shorten(r.m, 150)}”. Approve or deny it, then see what the California DMV decided.`;
  const head = [
    CHARSET,
    // The page lives two folders down; the base keeps the game's relative asset paths working.
    `<base href="../../" />`,
    `<meta name="robots" content="noindex" />`,
    `<meta name="aod-plate" content="${r.id}" />`,
    `<title>${text(title)} · Approved or Denied</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Approved or Denied" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${url}card.png" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${WIDTH}" />`,
    `<meta property="og:image:height" content="${HEIGHT}" />`,
    `<meta property="og:image:alt" content="${attr(`A license plate reading ${plate}, with the applicant's explanation and the question: would you approve this?`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${url}card.png" />`,
    `<meta name="twitter:image:alt" content="${attr(`A license plate reading ${plate}`)}" />`,
  ].join('\n    ');
  // The preview is the question; make sure none of the answer slipped into the tags.
  // (A reviewer note that only repeats the plate or the applicant's words gives nothing away.)
  const note = r.c.trim().toUpperCase();
  const tags = head.toUpperCase();
  const repeats = `${r.p}\n${r.m}`.toUpperCase().includes(note);
  if (!repeats && [note, text(note), attr(note)].some((n) => tags.includes(n))) {
    throw new Error(`build-share: reviewer comment for ${r.id} appears in its preview tags`);
  }
  if (/\b(APPROVED|DENIED)\b/.test(tags.replace(/APPROVED OR DENIED/g, ''))) {
    throw new Error(`build-share: a verdict word appears in the preview tags for ${r.id}`);
  }
  return base.replace(CHARSET, head);
}

// ---------- Images ----------

const fontHash = createHash('sha256');
for (const f of readdirSync(FONT_DIR).sort()) fontHash.update(readFileSync(resolve(FONT_DIR, f)));
const cardSource = readFileSync(resolve(root, 'scripts/share/card.ts'));
// sharp's version is part of the key: a new release can quantize the same artwork differently.
const sharpVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/sharp/package.json'), 'utf8')).version;
const artworkKey = createHash('sha256').update(String(CARD_VERSION)).update(cardSource).update(fontHash.digest()).update(sharpVersion).digest('hex');
const cacheFile = (r: Round) =>
  resolve(CACHE, `${createHash('sha256').update(artworkKey).update(`${r.p}\0${r.m}\0${SHORT_URL}`).digest('hex').slice(0, 24)}.png`);

async function renderMissing(jobs: Round[]): Promise<void> {
  if (!jobs.length) return;
  const threads = Math.max(1, Math.min(availableParallelism(), 8, jobs.length));
  const chunks = Array.from({ length: threads }, (_, i) => jobs.filter((_, j) => j % threads === i));
  let done = 0;
  const started = Date.now();
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<void>((ok, fail) => {
          const worker = new Worker(new URL('./share/render-worker.ts', import.meta.url), {
            workerData: chunk.map((r) => ({ plate: r.p, meaning: r.m, shortUrl: SHORT_URL, out: cacheFile(r) })),
          });
          worker.on('message', () => {
            done++;
            if (done % 250 === 0 || done === jobs.length) {
              process.stdout.write(`\r  rendered ${done}/${jobs.length} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
            }
          });
          worker.on('error', fail);
          worker.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`render worker exited with ${code}`))));
        }),
    ),
  );
  process.stdout.write('\n');
}

// ---------- Build ----------

mkdirSync(CACHE, { recursive: true });
const outRoot = resolve(DIST, 'p');
rmSync(outRoot, { recursive: true, force: true });

const missing = rounds.filter((r) => !existsSync(cacheFile(r)));
console.log(`\nShare pages: ${rounds.length} plates, ${rounds.length - missing.length} images cached, ${missing.length} to render`);
await renderMissing(missing);

let pageBytes = 0;
let imageBytes = 0;
for (const r of rounds) {
  const dir = resolve(outRoot, r.id);
  mkdirSync(dir, { recursive: true });
  const html = page(r);
  writeFileSync(resolve(dir, 'index.html'), html);
  copyFileSync(cacheFile(r), resolve(dir, 'card.png'));
  pageBytes += Buffer.byteLength(html);
  imageBytes += statSync(resolve(dir, 'card.png')).size;
}

// Links to plates removed from the deck land on the game instead of a GitHub 404 page.
writeFileSync(
  resolve(DIST, '404.html'),
  `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Approved or Denied</title>
<meta http-equiv="refresh" content="0; url=${SITE_URL}/"><script>location.replace(${JSON.stringify(`${SITE_URL}/`)})</script>
<p><a href="${SITE_URL}/">Play Approved or Denied</a></p>\n`,
);

// Old cache entries (plates that left the deck, older artwork) are pruned so the cache stays the size of the deck.
const wanted = new Set(deck.rounds.map((r) => cacheFile(r).split('/').at(-1)));
if (limit === Infinity) for (const f of readdirSync(CACHE)) if (!wanted.has(f)) rmSync(resolve(CACHE, f));

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`  wrote ${rounds.length} pages (${mb(pageBytes)}) and ${rounds.length} images (${mb(imageBytes)}) to dist/p/`);
