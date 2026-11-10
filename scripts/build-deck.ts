// Build-time pipeline: data/raw/applications.csv -> public/deck.json + data/review.csv
// Usage: npm run deck [-- --per-side 2000]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { DEFAULT_EPOCH, type Schedule, docketNumber, generateSchedule } from '../src/daily.ts';
import type { Deck, Round } from '../src/deck-types.ts';
import {
  type DropReason,
  type NameLists,
  type RawRow,
  hasPersonalInfo,
  hasPlaceholder,
  hitsBlocklist,
  normalizePlate,
  parseBlocklist,
} from './lib/filters.ts';
import { scoreRound } from './lib/score.ts';
import { type Action, parseAction, selectBalanced } from './lib/select.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p: string) => resolve(root, p);

const SOURCE = path('data/raw/applications.csv');
const BLOCKLIST = path('data/blocklist.txt');
const REVIEW = path('data/review.csv');
const DECK = path('public/deck.json');
const DAILY = path('public/daily.json');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const TARGET_PER_SIDE = Number(arg('--per-side') ?? 2000);
/** Days of dockets to schedule past today. Rerun the build before they run out. */
const SCHEDULE_AHEAD_DAYS = 730;

const readLines = (p: string) =>
  readFileSync(path(p), 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const commonByFrequency = readLines('data/wordlists/common-words.txt');
const lists: NameLists = {
  first: new Set(readLines('data/wordlists/first-names.txt')),
  surname: new Set(readLines('data/wordlists/surnames.txt')),
  common: new Set(commonByFrequency),
  veryCommon: new Set(commonByFrequency.slice(0, 1500)),
};
const blocklist = parseBlocklist(readFileSync(BLOCKLIST, 'utf8'));

const rows: RawRow[] = parse(readFileSync(SOURCE), { columns: true, bom: true, skip_empty_lines: true });

const dropped: Record<DropReason, number> = {
  'junk-status': 0,
  'missing-meaning': 0,
  'missing-comment': 0,
  placeholder: 0,
  blocklist: 0,
  'personal-info': 0,
  duplicate: 0,
  'duplicate-conflicting-status': 0,
};

interface Kept extends RawRow {
  key: string;
  approved: boolean;
  score: number;
}

const survivors: Kept[] = [];
for (const r of rows) {
  const status = r.status.trim().toUpperCase();
  let reason: DropReason | null = null;
  if (status !== 'Y' && status !== 'N') reason = 'junk-status';
  else if (!r.customer_meaning.trim()) reason = 'missing-meaning';
  else if (!r.reviewer_comments.trim()) reason = 'missing-comment';
  else if (hasPlaceholder(r.customer_meaning, r.reviewer_comments)) reason = 'placeholder';
  else if (hitsBlocklist(r, blocklist)) reason = 'blocklist';
  else if (hasPersonalInfo(r, lists)) reason = 'personal-info';
  if (reason) {
    dropped[reason]++;
    continue;
  }
  survivors.push({
    ...r,
    key: normalizePlate(r.plate),
    approved: status === 'Y',
    score: scoreRound(r.plate, r.customer_meaning, r.reviewer_comments),
  });
}

// Dedupe by plate. If copies disagree on the outcome, there is no single right answer, so drop them all.
const byPlate = new Map<string, Kept[]>();
for (const k of survivors) byPlate.set(k.key, [...(byPlate.get(k.key) ?? []), k]);
const unique: Kept[] = [];
for (const group of byPlate.values()) {
  if (group.length === 1) {
    unique.push(group[0]);
    continue;
  }
  if (new Set(group.map((g) => g.approved)).size > 1) {
    dropped['duplicate-conflicting-status'] += group.length;
    continue;
  }
  group.sort((a, b) => b.score - a.score);
  unique.push(group[0]);
  dropped.duplicate += group.length - 1;
}

// Read manual edits from the previous review.csv. Only the `action` column is honored.
const actions = new Map<string, Action>();
if (existsSync(REVIEW)) {
  const prior: Record<string, string>[] = parse(readFileSync(REVIEW), { columns: true, bom: true, skip_empty_lines: true });
  for (const r of prior) {
    const a = parseAction(r.action);
    if (a) actions.set(normalizePlate(r.plate), a);
  }
}
const known = new Set(unique.map((u) => u.key));
const orphaned = [...actions.keys()].filter((k) => !known.has(k));

const { chosen, perSide } = selectBalanced(
  unique.map((u) => ({ plate: u.key, approved: u.approved, score: u.score, row: u })),
  actions,
  TARGET_PER_SIDE,
);

const deckRows = unique.filter((u) => chosen.has(u.key)).sort((a, b) => a.key.localeCompare(b.key));
const deck: Deck = {
  version: 1,
  builtAt: new Date().toISOString(),
  rounds: deckRows.map<Round>((u) => ({ p: u.plate, m: u.customer_meaning, c: u.reviewer_comments, a: u.approved ? 1 : 0 })),
};
mkdirSync(dirname(DECK), { recursive: true });
writeFileSync(DECK, JSON.stringify(deck));

// Daily schedule. Dockets up to and including tomorrow (UTC) are locked once
// published, so a rebuild never changes a docket people may already be playing.
const prior: Schedule | null = existsSync(DAILY) ? JSON.parse(readFileSync(DAILY, 'utf8')) : null;
const epoch = arg('--epoch') ?? prior?.epoch ?? DEFAULT_EPOCH;
if (!/^\d{4}-\d{2}-\d{2}$/.test(epoch)) throw new Error(`--epoch must be YYYY-MM-DD, got ${epoch}`);
const today = docketNumber(new Date(), epoch);
const lockThrough = today + 1;
const keep = prior && prior.epoch === epoch ? prior.days.slice(0, lockThrough) : [];
const scheduleDays = generateSchedule(deck.rounds, { epoch, count: lockThrough + SCHEDULE_AHEAD_DAYS, keep });
const schedule: Schedule = { epoch, days: scheduleDays };
writeFileSync(DAILY, JSON.stringify(schedule));
const lockedKept = keep.filter((d, i) => d && d.join() === scheduleDays[i].join()).length;
const lockedChanged = keep.length - lockedKept;

// review.csv lists every eligible row (not just the deck) so lower-ranked rows can be pinned in.
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = ['action', 'plate', 'status', 'in_deck', 'score', 'customer_meaning', 'reviewer_comments', 'review_reason_code'];
const reviewRows = [...unique].sort((a, b) => Number(chosen.has(b.key)) - Number(chosen.has(a.key)) || b.score - a.score);
const lines = [header.join(',')];
for (const u of reviewRows) {
  lines.push(
    [
      actions.get(u.key) ?? '',
      u.plate,
      u.approved ? 'Y' : 'N',
      chosen.has(u.key) ? 'yes' : '',
      u.score,
      u.customer_meaning,
      u.reviewer_comments,
      u.review_reason_code,
    ]
      .map(csvCell)
      .join(','),
  );
}
for (const k of orphaned) lines.push([csvCell(actions.get(k)!), csvCell(k), '', 'not eligible', '', '', '', ''].join(','));
writeFileSync(REVIEW, lines.join('\n') + '\n');

// Summary
const pad = (s: string | number, n = 32) => String(s).padEnd(n);
const deckApproved = deckRows.filter((r) => r.approved).length;
console.log('\nApproved or Denied: deck build\n');
console.log(pad('Rows in source'), rows.length);
for (const [reason, n] of Object.entries(dropped)) console.log(pad(`  dropped: ${reason}`), n);
console.log(pad('Eligible after filters + dedupe'), unique.length, `(${unique.filter((u) => u.approved).length} approved / ${unique.filter((u) => !u.approved).length} denied)`);
console.log(pad('Manual actions in review.csv'), `${[...actions.values()].filter((a) => a === 'pin').length} pinned, ${[...actions.values()].filter((a) => a === 'remove').length} removed`);
if (orphaned.length) console.log(pad('  actions on ineligible plates'), orphaned.length, '(listed at the bottom of review.csv)');
console.log(pad('Deck size'), deckRows.length, `(${deckApproved} approved / ${deckRows.length - deckApproved} denied, ${perSide} per side requested ${TARGET_PER_SIDE})`);
const cutoff = (approved: boolean) => Math.min(...deckRows.filter((r) => r.approved === approved).map((r) => r.score));
console.log(pad('Lowest score in deck'), `approved ${cutoff(true)}, denied ${cutoff(false)}`);
console.log(pad('deck.json size'), `${(JSON.stringify(deck).length / 1024).toFixed(0)} KB`);
console.log(pad('Daily schedule'), `epoch ${epoch}, today is docket #${today}, ${scheduleDays.length} dockets`);
if (keep.length) console.log(pad('  locked dockets kept'), `${lockedKept}${lockedChanged ? `, ${lockedChanged} regenerated because a plate left the deck` : ''}`);
console.log(`\nWrote ${DECK.replace(root + '/', '')} ${DAILY.replace(root + '/', '')} and ${REVIEW.replace(root + '/', '')}\n`);
