import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreakDealer, approveOdds } from '../src/deal.ts';
import type { Round } from '../src/deck-types.ts';
import { mulberry32 } from '../src/rng.ts';
import * as storage from '../src/storage.ts';

const deck: Round[] = Array.from({ length: 200 }, (_, i) => ({ p: `P${i}`, m: 'm', c: 'c', a: (i % 2) as 0 | 1 }));

describe('streak dealer', () => {
  it('stays close to 50/50 over a long run', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = new StreakDealer(deck, mulberry32(seed));
      let approved = 0;
      for (let i = 0; i < 100; i++) {
        approved += d.next().a;
        expect(Math.abs(approved * 2 - (i + 1))).toBeLessThanOrEqual(8);
      }
    }
  });

  it('never repeats a plate until a side is exhausted', () => {
    const d = new StreakDealer(deck, mulberry32(7));
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const p = d.next().p;
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
  });

  it('deals unseen plates before ones the player has seen', () => {
    const seen = new Set(deck.slice(0, 150).map((r) => r.p));
    const d = new StreakDealer(deck, mulberry32(3), seen);
    for (let i = 0; i < 40; i++) expect(seen.has(d.next().p)).toBe(false);
  });

  it('keeps going after the deck runs out', () => {
    const d = new StreakDealer(deck.slice(0, 4), mulberry32(1));
    for (let i = 0; i < 50; i++) expect(d.next()).toBeDefined();
  });

  it('leans toward the side dealt less, within bounds', () => {
    expect(approveOdds(0, 0)).toBe(0.5);
    expect(approveOdds(0, 2)).toBeGreaterThan(0.5);
    expect(approveOdds(10, 0)).toBe(0.15);
  });
});

describe('storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    storage.resetMemory();
  });

  it('works when localStorage throws on every access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(storage.load().bestStreak).toBe(0);
    expect(storage.update((s) => (s.bestStreak = 5)).bestStreak).toBe(5);
    expect(storage.load().bestStreak).toBe(5);
  });

  it('recovers from corrupt saved state', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not json', setItem: () => {} });
    expect(storage.load().seen).toEqual([]);
  });
});
