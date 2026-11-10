export type Action = 'pin' | 'remove' | '';

export interface Candidate {
  plate: string;
  approved: boolean;
  score: number;
}

export function parseAction(raw: string | undefined): Action {
  const a = (raw ?? '').trim().toLowerCase();
  if (a === 'pin' || a === 'p' || a === 'keep') return 'pin';
  if (a === 'remove' || a === 'r' || a === 'x' || a === 'drop' || a === 'delete') return 'remove';
  return '';
}

/**
 * Picks an equal number of approved and denied candidates. Pinned rows are always
 * included; removed rows never are. The rest are filled in by score.
 */
export function selectBalanced<T extends Candidate>(
  candidates: T[],
  actions: Map<string, Action>,
  targetPerSide: number,
): { chosen: Set<string>; perSide: number } {
  const sides = [true, false].map((approved) => {
    const pool = candidates.filter((c) => c.approved === approved && actions.get(c.plate) !== 'remove');
    const pinned = pool.filter((c) => actions.get(c.plate) === 'pin');
    const rest = pool
      .filter((c) => actions.get(c.plate) !== 'pin')
      .sort((a, b) => b.score - a.score || a.plate.localeCompare(b.plate));
    return { pinned, rest, available: pool.length };
  });

  const maxPinned = Math.max(...sides.map((s) => s.pinned.length));
  const maxAvailable = Math.min(...sides.map((s) => s.available));
  const perSide = Math.min(maxAvailable, Math.max(targetPerSide, maxPinned));

  const chosen = new Set<string>();
  for (const side of sides) {
    const picks = [...side.pinned, ...side.rest].slice(0, perSide);
    for (const p of picks) chosen.add(p.plate);
  }
  return { chosen, perSide };
}
