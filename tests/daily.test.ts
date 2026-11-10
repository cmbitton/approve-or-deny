import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCKET_SIZE,
  NO_REPEAT_DAYS,
  PER_SIDE,
  type Schedule,
  docketNumber,
  docketPlates,
  docketScore,
  docketTitle,
  generateSchedule,
  msUntilNextDocket,
} from '../src/daily.ts';
import type { Deck, Round } from '../src/deck-types.ts';
import { dailyShareText, streakShareText } from '../src/share.ts';

const makeDeck = (perSide: number): Round[] =>
  Array.from({ length: perSide * 2 }, (_, i) => ({ p: `PL${i}`, m: 'm', c: 'c', a: (i % 2) as 0 | 1 }));

const deck = makeDeck(400);
const outcome = new Map(deck.map((r) => [r.p, r.a]));
const EPOCH = '2026-11-10';

describe('docket numbering', () => {
  it('starts at #1 on the epoch and turns over at midnight UTC', () => {
    expect(docketNumber(new Date('2026-11-10T00:00:00Z'), EPOCH)).toBe(1);
    expect(docketNumber(new Date('2026-11-10T23:59:59Z'), EPOCH)).toBe(1);
    expect(docketNumber(new Date('2026-11-11T00:00:00Z'), EPOCH)).toBe(2);
    expect(docketNumber(new Date('2027-11-10T12:00:00Z'), EPOCH)).toBe(366);
  });
  it('is the same everywhere at the same instant, whatever the local timezone', () => {
    // 2026-11-10 20:00 in Los Angeles is already 11-11 in UTC.
    expect(docketNumber(new Date('2026-11-10T20:00:00-08:00'), EPOCH)).toBe(2);
    expect(docketNumber(new Date('2026-11-11T07:00:00+09:00'), EPOCH)).toBe(1);
  });
  it('never goes below #1 before launch', () => {
    expect(docketNumber(new Date('2026-01-01T00:00:00Z'), EPOCH)).toBe(1);
  });
  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextDocket(new Date('2026-11-10T23:59:00Z'))).toBe(60_000);
    expect(msUntilNextDocket(new Date('2026-11-10T00:00:00Z'))).toBe(86_400_000);
  });
});

describe('daily schedule', () => {
  const days = generateSchedule(deck, { epoch: EPOCH, count: 400 });

  it('gives the same ten plates in the same order for the same date', () => {
    const again = generateSchedule([...deck].reverse(), { epoch: EPOCH, count: 400 });
    expect(again).toEqual(days);
    const schedule: Schedule = { epoch: EPOCH, days };
    const morning = docketNumber(new Date('2026-12-01T00:30:00Z'), EPOCH);
    const night = docketNumber(new Date('2026-12-01T23:30:00Z'), EPOCH);
    expect(docketPlates(schedule, morning)).toEqual(docketPlates(schedule, night));
  });

  it('deals five approved and five denied every day', () => {
    for (const day of days) {
      expect(day).toHaveLength(DOCKET_SIZE);
      expect(new Set(day).size).toBe(DOCKET_SIZE);
      expect(day.filter((p) => outcome.get(p) === 1)).toHaveLength(PER_SIDE);
    }
  });

  it(`never repeats a plate within ${NO_REPEAT_DAYS} days`, () => {
    const last = new Map<string, number>();
    days.forEach((day, i) => {
      for (const p of day) {
        const prev = last.get(p);
        if (prev !== undefined) expect(i - prev).toBeGreaterThan(NO_REPEAT_DAYS);
        last.set(p, i);
      }
    });
  });

  it('does not put outcomes in a fixed order within a docket', () => {
    const patterns = new Set(days.slice(0, 50).map((d) => d.map((p) => outcome.get(p)).join('')));
    expect(patterns.size).toBeGreaterThan(20);
  });

  it('keeps locked days and only changes ones whose plates left the deck', () => {
    const keep = days.slice(0, 3);
    const removed = days[1][0];
    const smaller = deck.filter((r) => r.p !== removed);
    const rebuilt = generateSchedule(smaller, { epoch: EPOCH, count: 10, keep });
    expect(rebuilt[0]).toEqual(days[0]);
    expect(rebuilt[2]).toEqual(days[2]);
    expect(rebuilt[1]).not.toContain(removed);
    expect(rebuilt[1].filter((p) => outcome.get(p) === 1)).toHaveLength(PER_SIDE);
  });

  it('refuses a deck too small to honor the no-repeat window', () => {
    expect(() => generateSchedule(makeDeck(100), { epoch: EPOCH, count: 10 })).toThrow(/at least/);
  });

  it('holds for the shipped schedule and deck', () => {
    const shipped: Schedule = JSON.parse(readFileSync('public/daily.json', 'utf8'));
    const shippedDeck: Deck = JSON.parse(readFileSync('public/deck.json', 'utf8'));
    const a = new Map(shippedDeck.rounds.map((r) => [r.p, r.a]));
    const last = new Map<string, number>();
    shipped.days.forEach((day, i) => {
      expect(day.filter((p) => a.get(p) === 1)).toHaveLength(PER_SIDE);
      expect(day.filter((p) => a.get(p) === 0)).toHaveLength(PER_SIDE);
      for (const p of day) {
        const prev = last.get(p);
        if (prev !== undefined) expect(i - prev).toBeGreaterThan(NO_REPEAT_DAYS);
        last.set(p, i);
      }
    });
  });
});

describe('scoring', () => {
  it('counts correct rulings', () => {
    expect(docketScore([true, false, true, true, false, true, true, true, false, true])).toBe(7);
    expect(docketScore([])).toBe(0);
  });
  it('gives every score a title', () => {
    for (let s = 0; s <= 10; s++) expect(docketTitle(s)).toBeTruthy();
    expect(docketTitle(10)).not.toBe(docketTitle(9));
  });
});

describe('share text', () => {
  const results = [true, true, false, true, true, true, false, true, true, true];
  it('matches the daily format with no plate spoilers', () => {
    const text = dailyShareText(42, results, 'https://example.com');
    expect(text).toBe('Approved or Denied #42  8/10  ✅✅❌✅✅✅❌✅✅✅\nhttps://example.com');
    for (const r of deck.slice(0, 50)) expect(text).not.toContain(r.p);
  });
  it('formats streaks, compacting long ones', () => {
    expect(streakShareText(3, 'https://x.io')).toBe('Approved or Denied  Streak: 3  ✅✅✅❌\nhttps://x.io');
    expect(streakShareText(0, 'https://x.io')).toBe('Approved or Denied  Streak: 0  ❌\nhttps://x.io');
    expect(streakShareText(27, 'https://x.io')).toBe('Approved or Denied  Streak: 27  ✅×27❌\nhttps://x.io');
  });
});
