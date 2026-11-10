import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/stats.ts';
import type { PlayerState } from '../src/storage.ts';

const docket = (score: number) => Array.from({ length: 10 }, (_, i) => i < score);

const state = (daily: Record<string, boolean[]>, extra: Partial<PlayerState> = {}): PlayerState => ({
  noticeAccepted: true,
  soundOn: false,
  bestStreak: 0,
  streakGames: 0,
  seen: [],
  daily,
  ruled: 0,
  correct: 0,
  ...extra,
});

describe('stats', () => {
  it('handles a brand-new player', () => {
    const st = computeStats(state({}), 5);
    expect(st.accuracy).toBeNull();
    expect(st.docketsPlayed).toBe(0);
    expect(st.dailyStreak).toBe(0);
    expect(st.latestScore).toBeNull();
    expect(st.distribution).toEqual(Array(11).fill(0));
  });

  it('counts finished dockets only, and builds the score distribution', () => {
    const st = computeStats(state({ 1: docket(7), 2: docket(10), 3: docket(7), 4: [true, false] }), 4);
    expect(st.docketsPlayed).toBe(3);
    expect(st.distribution[7]).toBe(2);
    expect(st.distribution[10]).toBe(1);
    expect(st.perfectDockets).toBe(1);
    expect(st.latestScore).toBe(7);
    expect(st.recent.map((r) => r.docket)).toEqual([3, 2, 1]);
  });

  it('daily streak counts back from today, or from yesterday if today is unfinished', () => {
    const daily = { 3: docket(5), 4: docket(5), 5: docket(5), 7: docket(5) };
    expect(computeStats(state(daily), 7).dailyStreak).toBe(1);
    expect(computeStats(state(daily), 6).dailyStreak).toBe(3);
    expect(computeStats(state(daily), 8).dailyStreak).toBe(1);
    expect(computeStats(state(daily), 9).dailyStreak).toBe(0);
  });

  it('reports accuracy as a whole percent', () => {
    expect(computeStats(state({}, { ruled: 3, correct: 2 }), 1).accuracy).toBe(67);
  });
});
