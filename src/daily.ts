// Daily docket schedule. Shared by the build (which writes public/daily.json)
// and the game (which reads it). No DOM or Vite APIs here.

import type { Round } from './deck-types.ts';
import { hashString, mulberry32, shuffle } from './rng.ts';

export const DEFAULT_EPOCH = '2026-11-10';
export const DOCKET_SIZE = 10;
export const PER_SIDE = DOCKET_SIZE / 2;
/** A plate may not appear again until this many days have passed. */
export const NO_REPEAT_DAYS = 60;

const DAY_MS = 86_400_000;

export interface Schedule {
  /** UTC date (YYYY-MM-DD) of docket #1. */
  epoch: string;
  /** days[0] is docket #1. Each entry lists plates in play order. */
  days: string[][];
}

const utcDay = (date: Date) => Math.floor(date.getTime() / DAY_MS);
const epochDay = (epoch: string) => utcDay(new Date(`${epoch}T00:00:00Z`));

/** Docket number for a moment in time. Everyone switches at 00:00 UTC. Never below 1. */
export function docketNumber(now: Date, epoch: string): number {
  return Math.max(1, utcDay(now) - epochDay(epoch) + 1);
}

export function msUntilNextDocket(now: Date): number {
  return DAY_MS - (now.getTime() % DAY_MS);
}

/** Plates for a docket. Past the end of the schedule, it wraps rather than failing. */
export function docketPlates(schedule: Schedule, docket: number): string[] {
  const { days } = schedule;
  return days[(docket - 1) % days.length];
}

export interface GenerateOptions {
  epoch: string;
  /** Number of dockets to produce, starting at #1. */
  count: number;
  /** Existing dockets to keep as-is (by index) when all their plates are still in the deck. */
  keep?: (string[] | undefined)[];
  salt?: string;
}

/**
 * Builds the schedule. Each day gets 5 approved and 5 denied plates, none used in the
 * previous NO_REPEAT_DAYS days. Plates are taken in a fixed hash order, so adding or
 * removing one plate leaves most future days unchanged.
 */
export function generateSchedule(rounds: readonly Round[], opts: GenerateOptions): string[][] {
  const salt = opts.salt ?? 'aod';
  const byPlate = new Map(rounds.map((r) => [r.p, r]));
  const order = (a: 0 | 1) =>
    rounds
      .filter((r) => r.a === a)
      .map((r) => r.p)
      .sort((x, y) => hashString(`${salt}|${x}`) - hashString(`${salt}|${y}`) || (x < y ? -1 : 1));
  const sides = [order(0), order(1)];
  const minPool = PER_SIDE * (NO_REPEAT_DAYS + 1);
  for (const side of sides) {
    if (side.length < minPool) {
      throw new Error(`Daily schedule needs at least ${minPool} plates per outcome; deck has ${side.length}.`);
    }
  }

  const lastUsed = new Map<string, number>();
  const cursor = [0, 0];
  // Plates in locked days, so a regenerated day doesn't knock out a later locked one.
  const lockedOn = new Map<string, number[]>();
  opts.keep?.forEach((day, i) => day?.forEach((p) => lockedOn.set(p, [...(lockedOn.get(p) ?? []), i])));
  const usable = (plate: string, day: number) => {
    const last = lastUsed.get(plate);
    return last === undefined || day - last > NO_REPEAT_DAYS;
  };
  const freeForNewDay = (plate: string, day: number) =>
    usable(plate, day) && !(lockedOn.get(plate) ?? []).some((k) => k !== day && Math.abs(k - day) <= NO_REPEAT_DAYS);

  const days: string[][] = [];
  for (let day = 0; day < opts.count; day++) {
    const kept = opts.keep?.[day];
    const keepValid =
      kept &&
      kept.length === DOCKET_SIZE &&
      kept.every((p) => byPlate.has(p) && usable(p, day)) &&
      kept.filter((p) => byPlate.get(p)!.a === 1).length === PER_SIDE;
    let plates: string[];
    if (keepValid) {
      plates = kept;
    } else {
      plates = [];
      for (const a of [0, 1] as const) {
        const side = sides[a];
        let taken = 0;
        for (let step = 0; step < side.length && taken < PER_SIDE; step++) {
          const plate = side[(cursor[a] + step) % side.length];
          if (!freeForNewDay(plate, day) || plates.includes(plate)) continue;
          plates.push(plate);
          taken++;
          if (taken === PER_SIDE) cursor[a] = (cursor[a] + step + 1) % side.length;
        }
      }
      plates = shuffle(plates, mulberry32(hashString(`${salt}|day|${day}`)));
    }
    for (const p of plates) lastUsed.set(p, day);
    days.push(plates);
  }
  return days;
}

/** "8/10"-style score from per-plate results. */
export function docketScore(results: readonly boolean[]): number {
  return results.filter(Boolean).length;
}

export function docketTitle(score: number): string {
  if (score >= 10) return 'Chief Justice of Vanity Plates';
  if (score >= 8) return 'Senior DMV Reviewer';
  if (score >= 6) return 'DMV Reviewer';
  if (score >= 4) return 'Reviewer in Training';
  if (score >= 2) return 'Rubber Stamp Operator';
  return 'Banned from the DMV';
}
