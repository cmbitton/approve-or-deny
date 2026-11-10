import type { Round } from './deck-types.ts';
import { shuffle } from './rng.ts';

/** Probability of dealing an approved plate next. Leans toward the side dealt less. */
export function approveOdds(approvedDealt: number, deniedDealt: number): number {
  return Math.min(0.85, Math.max(0.15, 0.5 + 0.12 * (deniedDealt - approvedDealt)));
}

/**
 * Endless dealer for streak mode. Stays near 50/50 without becoming predictable.
 * Plates the player hasn't seen come first; an exhausted side is reshuffled.
 */
export class StreakDealer {
  private readonly bySide: [Round[], Round[]];
  private readonly piles: [Round[], Round[]];
  private readonly dealt = [0, 0];
  private readonly rand: () => number;

  constructor(rounds: readonly Round[], rand: () => number, seen: ReadonlySet<string> = new Set()) {
    this.rand = rand;
    this.bySide = [rounds.filter((r) => r.a === 0), rounds.filter((r) => r.a === 1)];
    // Piles are popped from the end, so unseen plates go last.
    const pile = (all: Round[]) => [
      ...shuffle(all.filter((r) => seen.has(r.p)), rand),
      ...shuffle(all.filter((r) => !seen.has(r.p)), rand),
    ];
    this.piles = [pile(this.bySide[0]), pile(this.bySide[1])];
  }

  next(): Round {
    let a: 0 | 1 = this.rand() < approveOdds(this.dealt[1], this.dealt[0]) ? 1 : 0;
    if (!this.piles[a].length) a = a === 1 ? 0 : 1;
    if (!this.piles[a].length) throw new Error('Deck is empty');
    const round = this.piles[a].pop()!;
    this.dealt[a]++;
    if (!this.piles[a].length) this.piles[a] = shuffle(this.bySide[a], this.rand);
    return round;
  }
}
