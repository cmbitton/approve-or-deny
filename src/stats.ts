import { DOCKET_SIZE, docketScore } from './daily.ts';
import type { PlayerState } from './storage.ts';

export interface Stats {
  platesJudged: number;
  /** Whole percent, or null before the first ruling. */
  accuracy: number | null;
  docketsPlayed: number;
  perfectDockets: number;
  /** Consecutive finished dockets ending today, or yesterday if today isn't done yet. */
  dailyStreak: number;
  bestStreak: number;
  streakGames: number;
  /** Count of finished dockets per score, index 0..10. */
  distribution: number[];
  /** Most recent finished dockets, newest first. */
  recent: { docket: number; results: boolean[] }[];
  latestScore: number | null;
}

export function computeStats(s: PlayerState, today: number, recentCount = 7): Stats {
  const finished = Object.entries(s.daily)
    .map(([k, results]) => ({ docket: Number(k), results }))
    .filter((d) => Number.isFinite(d.docket) && d.results.length >= DOCKET_SIZE)
    .sort((a, b) => b.docket - a.docket);

  const distribution = Array<number>(DOCKET_SIZE + 1).fill(0);
  for (const d of finished) distribution[docketScore(d.results)]++;

  const done = new Set(finished.map((d) => d.docket));
  let day = done.has(today) ? today : today - 1;
  let dailyStreak = 0;
  while (done.has(day)) {
    dailyStreak++;
    day--;
  }

  return {
    platesJudged: s.ruled,
    accuracy: s.ruled ? Math.round((100 * s.correct) / s.ruled) : null,
    docketsPlayed: finished.length,
    perfectDockets: distribution[DOCKET_SIZE],
    dailyStreak,
    bestStreak: s.bestStreak,
    streakGames: s.streakGames,
    distribution,
    recent: finished.slice(0, recentCount),
    latestScore: finished.length ? docketScore(finished[0].results) : null,
  };
}
