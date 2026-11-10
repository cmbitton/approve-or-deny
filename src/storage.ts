// Player state lives only in localStorage. Every access is guarded: private
// browsing, blocked storage and quota errors must never break the game.

const KEY = 'aod:v1';
const SEEN_LIMIT = 800;
const DAILY_LIMIT = 400;

export interface PlayerState {
  noticeAccepted: boolean;
  soundOn: boolean;
  bestStreak: number;
  streakGames: number;
  /** Recently played plates, oldest first, so streak mode prefers new ones. */
  seen: string[];
  /** Daily docket results by docket number: one entry per answered plate, true if correct. */
  daily: Record<string, boolean[]>;
  /** Every ruling in either mode. */
  ruled: number;
  correct: number;
}

const defaults = (): PlayerState => ({
  noticeAccepted: false,
  soundOn: false,
  bestStreak: 0,
  streakGames: 0,
  seen: [],
  daily: {},
  ruled: 0,
  correct: 0,
});

let memory: PlayerState | null = null;

export function load(): PlayerState {
  if (memory) return memory;
  let parsed: Partial<PlayerState> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) parsed = JSON.parse(raw) ?? {};
  } catch {
    // Unreadable or corrupt storage: start fresh.
  }
  memory = { ...defaults(), ...parsed };
  if (!Array.isArray(memory.seen)) memory.seen = [];
  if (!memory.daily || typeof memory.daily !== 'object') memory.daily = {};
  return memory;
}

export function update(change: (s: PlayerState) => void): PlayerState {
  const s = load();
  change(s);
  if (s.seen.length > SEEN_LIMIT) s.seen = s.seen.slice(-SEEN_LIMIT);
  const dockets = Object.keys(s.daily);
  if (dockets.length > DAILY_LIMIT) {
    for (const k of dockets.sort((a, b) => Number(a) - Number(b)).slice(0, dockets.length - DAILY_LIMIT)) delete s.daily[k];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: state still lives in memory for this session.
  }
  return s;
}

/** Test hook. */
export function resetMemory() {
  memory = null;
}
