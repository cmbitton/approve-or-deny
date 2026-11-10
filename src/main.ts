import { track } from './analytics.ts';
import { CONFIG } from './config.ts';
import {
  DOCKET_SIZE,
  type Schedule,
  docketNumber,
  docketPlates,
  docketScore,
  docketTitle,
  msUntilNextDocket,
} from './daily.ts';
import { StreakDealer } from './deal.ts';
import type { Deck, Round } from './deck-types.ts';
import { fitPlate } from './plate.ts';
import { RoundView } from './round-view.ts';
import { dailyShareText, plateShareText, plateUrl, shareText, streakShareText } from './share.ts';
import { setSoundEnabled, play as playSound, unlock as unlockSound } from './sound.ts';
import { computeStats } from './stats.ts';
import * as storage from './storage.ts';

type Mode = 'daily' | 'streak';

/** Set on the per-plate pages (p/<id>/) that build-share.ts generates. */
const sharedId = document.querySelector<HTMLMetaElement>('meta[name="aod-plate"]')?.content || null;
/** The game's own address, resolved through the shared pages' <base href="../../">. */
const rootUrl = document.baseURI;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  modeDaily: $<HTMLButtonElement>('mode-daily'),
  modeStreak: $<HTMLButtonElement>('mode-streak'),
  statusStreak: $('status-streak'),
  statusDaily: $('status-daily'),
  statusShared: $('status-shared'),
  sharePlate: $<HTMLButtonElement>('btn-share-plate'),
  streak: $('streak'),
  best: $('best'),
  docketLabel: $('docket-label'),
  dots: $('dots'),
  plateText: $('plate-text'),
  meaning: $('meaning'),
  result: $('result'),
  resultKicker: $('result-kicker'),
  resultTitle: $('result-title'),
  resultSub: $('result-sub'),
  resultRow: $('result-row'),
  countdown: $('result-countdown'),
  after: $('after'),
  secondary: $<HTMLButtonElement>('btn-secondary'),
  share: $<HTMLButtonElement>('btn-share'),
  toast: $('toast'),
  notice: $<HTMLDialogElement>('notice'),
  btnSound: $<HTMLButtonElement>('btn-sound'),
  btnStats: $<HTMLButtonElement>('btn-stats'),
  btnAbout: $<HTMLButtonElement>('btn-about'),
  statsDialog: $<HTMLDialogElement>('stats'),
  statsBody: $('stats-body'),
  aboutDialog: $<HTMLDialogElement>('about'),
  noticeOk: $<HTMLButtonElement>('notice-ok'),
};

let view: RoundView;
let rounds: Map<string, Round>;
let deck: Deck;
let schedule: Schedule;
let currentMode: Mode | 'shared' = 'daily';
/** Incremented on every mode switch; a running mode loop stops when it no longer matches. */
let session = 0;
let countdownTimer = 0;

const currentDocket = () => docketNumber(new Date(), schedule.epoch);

// ---------- Small UI helpers ----------

function bump(node: HTMLElement, value: number) {
  node.textContent = String(value);
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

let toastTimer = 0;
function toast(message: string) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), 2200);
}

function setModeButtons(mode: Mode | 'shared') {
  el.modeDaily.setAttribute('aria-pressed', String(mode === 'daily'));
  el.modeStreak.setAttribute('aria-pressed', String(mode === 'streak'));
  el.statusDaily.hidden = mode !== 'daily';
  el.statusStreak.hidden = mode !== 'streak';
  el.statusShared.hidden = mode !== 'shared';
}

function dot(result: boolean | undefined, current = false): HTMLLIElement {
  const li = document.createElement('li');
  li.className = result === undefined ? (current ? 'dot current' : 'dot') : result ? 'dot right' : 'dot wrong';
  li.textContent = result === undefined ? '' : result ? '✓' : '✗';
  return li;
}

function renderDots(results: readonly boolean[]) {
  el.dots.replaceChildren(...Array.from({ length: DOCKET_SIZE }, (_, i) => dot(results[i], i === results.length)));
  el.dots.setAttribute(
    'aria-label',
    `${el.docketLabel.textContent}: ${results.length} of ${DOCKET_SIZE} ruled, ${docketScore(results)} correct`,
  );
}

// ---------- Result screen ----------

interface ResultOptions {
  kicker: string;
  title: string;
  sub: string;
  row: boolean[];
  countdown: boolean;
  secondary: { label: string; action: () => void };
  share: () => { text: string; mode: Mode };
}

let shareAction: ResultOptions['share'] | null = null;
let secondaryAction: (() => void) | null = null;

function showResult(o: ResultOptions) {
  view.hide();
  el.result.hidden = false;
  el.resultKicker.textContent = o.kicker;
  el.resultTitle.textContent = o.title;
  el.resultSub.textContent = o.sub;
  el.resultRow.replaceChildren(...o.row.map((r) => dot(r)));
  el.countdown.hidden = !o.countdown;
  if (o.countdown) startCountdown();
  el.secondary.textContent = o.secondary.label;
  secondaryAction = o.secondary.action;
  shareAction = o.share;
  el.after.hidden = false;
  el.share.focus({ preventScroll: true });
}

function hideResult() {
  el.result.hidden = true;
  el.after.hidden = true;
  clearInterval(countdownTimer);
}

function startCountdown() {
  clearInterval(countdownTimer);
  const docketAtStart = currentDocket();
  const tick = () => {
    if (currentDocket() !== docketAtStart) {
      clearInterval(countdownTimer);
      if (currentMode === 'daily') startMode('daily');
      else el.countdown.textContent = 'A new docket is ready.';
      return;
    }
    const s = Math.floor(msUntilNextDocket(new Date()) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    el.countdown.textContent = `Next docket in ${hh}:${mm}:${ss}`;
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function countRuling(s: storage.PlayerState, correct: boolean) {
  s.ruled++;
  if (correct) s.correct++;
}

// ---------- Stats, About, sound ----------

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStats() {
  const st = computeStats(storage.load(), currentDocket());
  const tiles = h('dl', 'tiles');
  const tile = (label: string, value: string) => {
    const wrap = h('div', 'tile');
    wrap.append(h('dt', 'tile-label', label), h('dd', 'tile-value', value));
    tiles.append(wrap);
  };
  tile('Plates judged', st.platesJudged.toLocaleString());
  tile('Accuracy', st.accuracy === null ? '–' : `${st.accuracy}%`);
  tile('Best streak', String(st.bestStreak));
  tile('Dockets played', String(st.docketsPlayed));
  tile('Daily streak', String(st.dailyStreak));
  tile('Perfect dockets', String(st.perfectDockets));

  const parts: Node[] = [tiles, h('h3', 'panel-sub', 'Daily scores')];
  if (!st.docketsPlayed) {
    parts.push(h('p', 'empty', 'Finish a daily docket to see your scores here.'));
  } else {
    const max = Math.max(...st.distribution);
    const dist = h('ol', 'dist');
    for (let score = DOCKET_SIZE; score >= 0; score--) {
      const n = st.distribution[score];
      const latest = score === st.latestScore;
      const row = h('li', `dist-row${latest ? ' latest' : ''}`);
      row.title = `${n} docket${n === 1 ? '' : 's'} scored ${score}/${DOCKET_SIZE}`;
      const track = h('span', 'dist-track');
      if (n) {
        const bar = h('span', 'dist-bar');
        bar.style.width = `${(100 * n) / max}%`;
        track.append(bar);
      }
      track.append(h('span', 'dist-count', String(n)));
      row.append(h('span', 'dist-score', String(score)), track);
      if (latest) row.append(h('span', 'dist-tag', 'latest'));
      dist.append(row);
    }
    dist.setAttribute('aria-label', 'Number of dockets at each score, from 10 down to 0');
    parts.push(dist, h('h3', 'panel-sub', 'Recent dockets'));
    const recent = h('ol', 'recent');
    for (const d of st.recent) {
      const row = h('li', 'recent-row');
      const dots = h('ol', 'mini-dots');
      dots.setAttribute('aria-hidden', 'true');
      dots.append(...d.results.map((r) => dot(r)));
      row.append(h('span', 'recent-docket', `#${d.docket}`), h('span', 'recent-score', `${docketScore(d.results)}/${d.results.length}`), dots);
      recent.append(row);
    }
    parts.push(recent);
  }
  if (st.streakGames) parts.push(h('p', 'fine', `Streak mode: ${st.streakGames} run${st.streakGames === 1 ? '' : 's'} played.`));
  el.statsBody.replaceChildren(...parts);
}

function openPanel(dialog: HTMLDialogElement) {
  if (dialog === el.statsDialog) renderStats();
  dialog.showModal();
}

function setSound(on: boolean, fromTap = false) {
  setSoundEnabled(on);
  if (fromTap) unlockSound();
  el.btnSound.setAttribute('aria-pressed', String(on));
  el.btnSound.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  storage.update((s) => (s.soundOn = on));
}

// ---------- Modes ----------

function startMode(mode: Mode) {
  leaveSharedPage();
  currentMode = mode;
  session++;
  view.cancel();
  hideResult();
  setModeButtons(mode);
  history.replaceState(null, '', mode === 'streak' ? '#streak' : location.pathname + location.search);
  if (mode === 'daily') runDaily(session);
  else runStreak(session);
}

// ---------- Shared plate (p/<id>/) ----------

/** Moves the address bar from p/<id>/ to the game itself, so reloading doesn't reopen the shared plate. */
function leaveSharedPage() {
  if (sharedId && location.href !== rootUrl) history.replaceState(null, '', rootUrl);
}

/** One plate from a shared link. Nothing is saved: no daily result, streak, stats or seen-list. */
async function runShared(round: Round) {
  currentMode = 'shared';
  const run = ++session;
  view.cancel();
  hideResult();
  setModeButtons('shared');
  const outcome = await view.play(round);
  if (run !== session) return;
  track({ name: 'round_answered', mode: 'shared', correct: outcome.correct });
  const dailyDone = (storage.load().daily[currentDocket()]?.length ?? 0) >= DOCKET_SIZE;
  await view.next(dailyDone ? 'Play Streak\u00a0→' : 'Play the Daily\u00a0→');
  if (run !== session) return;
  startMode(dailyDone ? 'streak' : 'daily');
}

async function runDaily(run: number) {
  const docket = currentDocket();
  const plates = docketPlates(schedule, docket).filter((p) => rounds.has(p));
  const results = () => storage.load().daily[docket] ?? [];
  el.docketLabel.textContent = `#${docket}`;
  renderDots(results());

  while (results().length < plates.length) {
    const round = rounds.get(plates[results().length])!;
    storage.update((s) => s.seen.push(round.p));
    // The answer is saved before the stamp lands, so the dots can read it at impact.
    const outcome = await view.play(round, () => renderDots(results()));
    if (run !== session) return;
    // Saved at the moment of answering, so reloading can't undo a ruling.
    const done = storage.update((s) => {
      s.daily[docket] = [...(s.daily[docket] ?? []), outcome.correct];
      countRuling(s, outcome.correct);
    }).daily[docket];
    track({ name: 'round_answered', mode: 'daily', correct: outcome.correct });
    if (done.length === plates.length) track({ name: 'daily_finished', score: docketScore(done), docket });
    await view.next(done.length === plates.length ? 'See your score →' : 'Next plate →');
    if (run !== session) return;
  }
  renderDots(results());
  showDailyResult(docket, results());
}

function showDailyResult(docket: number, results: boolean[]) {
  const score = docketScore(results);
  showResult({
    kicker: `Docket #${docket}`,
    title: `${score}/${results.length}`,
    sub: docketTitle(score),
    row: results,
    countdown: true,
    secondary: { label: 'Play streak', action: () => startMode('streak') },
    share: () => ({ text: dailyShareText(docket, results, CONFIG.siteUrl), mode: 'daily' }),
  });
}

async function runStreak(run: number) {
  // Keep upcoming daily plates out of streak mode so they aren't spoiled.
  const today = currentDocket();
  const reserved = new Set<string>();
  for (let d = today; d < today + 14; d++) for (const p of docketPlates(schedule, d)) reserved.add(p);
  const pool = deck.rounds.filter((r) => !reserved.has(r.p));
  const dealer = new StreakDealer(pool, Math.random, new Set(storage.load().seen));

  let streak = 0;
  let newBest = false;
  el.streak.textContent = '0';
  el.best.textContent = String(storage.load().bestStreak);

  for (;;) {
    const round = dealer.next();
    storage.update((s) => s.seen.push(round.p));
    const outcome = await view.play(round, (o) => {
      if (o.correct) bump(el.streak, streak);
      el.best.textContent = String(storage.load().bestStreak);
    });
    if (run !== session) return;
    if (outcome.correct) streak++;
    storage.update((s) => {
      if (streak > s.bestStreak) {
        s.bestStreak = streak;
        newBest = true;
      }
      if (!outcome.correct) s.streakGames++;
      countRuling(s, outcome.correct);
    });
    track({ name: 'round_answered', mode: 'streak', correct: outcome.correct });
    if (!outcome.correct) track({ name: 'streak_ended', streak });
    await view.next(outcome.correct ? 'Next plate →' : 'See result →');
    if (run !== session) return;
    if (!outcome.correct) break;
  }

  showResult({
    kicker: 'Streak over',
    title: String(streak),
    sub: newBest && streak > 0 ? 'New personal best!' : `Personal best: ${storage.load().bestStreak}`,
    // Long streaks are summarized by the big number; the row shows the last ten.
    row: [...Array<boolean>(Math.min(streak, 9)).fill(true), false],
    countdown: false,
    secondary: { label: 'Play again', action: () => startMode('streak') },
    share: () => ({ text: streakShareText(streak, CONFIG.siteUrl), mode: 'streak' }),
  });
}

// ---------- Boot ----------

function bindGlobalInput() {
  el.btnSound.addEventListener('click', () => {
    setSound(el.btnSound.getAttribute('aria-pressed') !== 'true', true);
    playSound('tap');
  });
  el.btnStats.addEventListener('click', () => openPanel(el.statsDialog));
  el.btnAbout.addEventListener('click', () => openPanel(el.aboutDialog));
  for (const dialog of [el.statsDialog, el.aboutDialog]) {
    dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
    // A tap on the backdrop closes the panel.
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  }
  el.modeDaily.addEventListener('click', () => startMode('daily'));
  el.modeStreak.addEventListener('click', () => startMode('streak'));
  el.secondary.addEventListener('click', () => secondaryAction?.());
  el.sharePlate.addEventListener('click', async (e) => {
    // A tap anywhere else on the round moves on; this one shouldn't.
    e.stopPropagation();
    const round = view.current;
    if (!round) return;
    const outcome = await shareText(plateShareText(round.p), plateUrl(CONFIG.siteUrl, round.id));
    if (outcome === 'clipboard') toast('Link copied');
    else if (outcome === 'failed') toast('Could not copy. Try a screenshot!');
    if (outcome === 'share' || outcome === 'clipboard') track({ name: 'share_tapped', mode: 'plate', method: outcome });
  });
  el.share.addEventListener('click', async () => {
    if (!shareAction) return;
    const { text, mode } = shareAction();
    const outcome = await shareText(text);
    if (outcome === 'clipboard') toast('Copied! Paste it anywhere.');
    else if (outcome === 'failed') toast('Could not share. Try a screenshot!');
    if (outcome === 'share' || outcome === 'clipboard') track({ name: 'share_tapped', mode, method: outcome });
  });
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (view.handleKey(e.key.toLowerCase())) e.preventDefault();
  });
}

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

function showNotice(): Promise<void> {
  if (storage.load().noticeAccepted) return Promise.resolve();
  return new Promise((resolve) => {
    el.notice.showModal();
    el.notice.addEventListener('cancel', (e) => e.preventDefault());
    el.noticeOk.addEventListener(
      'click',
      () => {
        storage.update((s) => (s.noticeAccepted = true));
        el.notice.close();
        resolve();
      },
      { once: true },
    );
  });
}

async function boot() {
  view = new RoundView();
  bindGlobalInput();
  setSound(storage.load().soundOn);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
  }
  document.fonts?.ready.then(() => fitPlate(el.plateText));
  const data = Promise.all([fetchJson<Deck>('deck.json'), fetchJson<Schedule>('daily.json')]);
  await showNotice();
  try {
    [deck, schedule] = await data;
  } catch (err) {
    console.error(err);
    el.meaning.textContent = 'Could not load the plates. Check your connection and reload.';
    return;
  }
  rounds = new Map(deck.rounds.map((r) => [r.p, r]));
  if (sharedId) {
    const shared = deck.rounds.find((r) => r.id === sharedId);
    if (shared) return void runShared(shared);
    toast('That plate has left the game. Here’s today’s docket.');
  }
  const dailyDone = (storage.load().daily[currentDocket()]?.length ?? 0) >= DOCKET_SIZE;
  startMode(location.hash === '#streak' || dailyDone ? 'streak' : 'daily');
}

boot();
