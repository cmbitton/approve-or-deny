import type { Round } from './deck-types.ts';
import { buzz } from './haptics.ts';
import { renderPlate } from './plate.ts';
import { play as playSound, unlock as unlockSound } from './sound.ts';
import { attachSwipe } from './swipe.ts';

export interface Outcome {
  approve: boolean;
  correct: boolean;
}

type Phase = 'idle' | 'answering' | 'revealing' | 'revealed';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const sizeClass = (text: string) => (text.length > 150 ? 'xlong' : text.length > 85 ? 'long' : '');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One round on screen: plate, applicant's meaning, answer input, and the reveal.
 * Modes drive it with play() and next(); it knows nothing about scoring.
 */
export class RoundView {
  private readonly el = {
    round: $('round'),
    card: $('card'),
    plate: $('plate'),
    plateText: $('plate-text'),
    stamp: $('stamp'),
    meaning: $('meaning'),
    reveal: $('reveal'),
    verdict: $('verdict'),
    comment: $('comment'),
    decide: $('decide'),
    continue: $('continue'),
    deny: $<HTMLButtonElement>('btn-deny'),
    approve: $<HTMLButtonElement>('btn-approve'),
    next: $<HTMLButtonElement>('btn-next'),
  };

  private phase: Phase = 'idle';
  private round: Round | null = null;
  private outcome: Outcome | null = null;
  private timers: number[] = [];
  private onAnswer: ((o: Outcome) => void) | null = null;
  private onRevealed: (() => void) | null = null;
  private onNext: (() => void) | null = null;
  private onImpact: ((o: Outcome) => void) | null = null;

  constructor() {
    const { el } = this;
    el.deny.addEventListener('click', () => this.answer(false));
    el.approve.addEventListener('click', () => this.answer(true));
    el.next.addEventListener('click', () => this.advance());
    // Tapping anywhere on the round skips the reveal or moves on.
    el.round.addEventListener('click', () => {
      if (this.phase === 'revealing' || this.phase === 'revealed') this.advance();
    });
    attachSwipe({
      card: el.card,
      denyHint: el.card.querySelector('.swipe-deny')!,
      approveHint: el.card.querySelector('.swipe-approve')!,
      enabled: () => this.phase === 'answering',
      onSwipe: (dir) => this.answer(dir === 'right'),
    });
  }

  get active() {
    return this.phase !== 'idle';
  }

  /** The plate on screen, if any. */
  get current(): Round | null {
    return this.phase === 'idle' ? null : this.round;
  }

  /** Shows a plate and resolves with the player's ruling as soon as they make it. */
  play(round: Round, onImpact?: (o: Outcome) => void): Promise<Outcome> {
    this.cancel();
    const { el } = this;
    this.round = round;
    this.outcome = null;
    this.onImpact = onImpact ?? null;

    el.round.hidden = false;
    renderPlate(el.plateText, round.p);
    el.meaning.textContent = round.m;
    el.meaning.dataset.size = sizeClass(round.m);
    el.stamp.hidden = true;
    el.stamp.className = 'stamp';
    el.plate.classList.remove('shake', 'stamped');
    el.round.classList.remove('is-revealed');
    el.reveal.hidden = true;
    el.reveal.classList.remove('enter');
    el.comment.classList.remove('enter');
    el.deny.classList.remove('pressed');
    el.approve.classList.remove('pressed');
    el.deny.disabled = el.approve.disabled = false;
    el.decide.hidden = false;
    el.continue.hidden = true;
    this.phase = 'answering';
    return new Promise((resolve) => (this.onAnswer = resolve));
  }

  /** After the reveal finishes, shows the continue button and resolves when the player moves on. */
  next(label: string): Promise<void> {
    return new Promise((resolve) => {
      const show = () => {
        this.el.next.textContent = label;
        this.el.decide.hidden = true;
        this.el.continue.hidden = false;
        this.el.next.focus({ preventScroll: true });
        this.onNext = resolve;
      };
      if (this.phase === 'revealed') show();
      else this.onRevealed = show;
    });
  }

  /** Drops any round in progress without resolving its promises. */
  cancel() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.onAnswer = this.onRevealed = this.onNext = null;
    this.phase = 'idle';
  }

  hide() {
    this.cancel();
    this.el.round.hidden = true;
    this.el.decide.hidden = true;
    this.el.continue.hidden = true;
  }

  /** Keyboard: A/← deny, D/→ approve, N to continue. Returns true if handled. */
  handleKey(key: string): boolean {
    if (this.phase === 'answering') {
      if (key === 'a' || key === 'arrowleft') return this.answer(false), true;
      if (key === 'd' || key === 'arrowright') return this.answer(true), true;
    } else if ((this.phase === 'revealing' || this.phase === 'revealed') && key === 'n') {
      this.advance();
      return true;
    }
    return false;
  }

  private answer(approve: boolean) {
    if (this.phase !== 'answering' || !this.round) return;
    const round = this.round;
    const outcome: Outcome = { approve, correct: (round.a === 1) === approve };
    this.outcome = outcome;
    this.phase = 'revealing';
    const { el } = this;
    (approve ? el.approve : el.deny).classList.add('pressed');
    el.deny.disabled = el.approve.disabled = true;
    this.onAnswer?.(outcome);
    this.onAnswer = null;
    unlockSound();
    playSound('tap');

    const fast = reducedMotion();
    const at = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, fast ? Math.min(ms, 120) : ms));
    at(120, () => this.stamp(true));
    at(350, () => {
      el.plate.classList.add('shake', 'stamped');
      buzz(outcome.correct ? 35 : [70, 50, 110]);
      playSound('stamp');
      this.onImpact?.(outcome);
      this.onImpact = null;
    });
    at(520, () => playSound(outcome.correct ? 'correct' : 'wrong'));
    at(650, () => {
      this.showReveal();
      el.reveal.classList.add('enter');
    });
    at(1000, () => el.comment.classList.add('enter'));
    at(1250, () => this.finishReveal());
  }

  private stamp(slam: boolean) {
    const approved = this.round!.a === 1;
    this.el.stamp.textContent = approved ? 'Approved' : 'Denied';
    this.el.stamp.className = `stamp ${approved ? 'approved' : 'denied'}${slam ? ' slam' : ''}`;
    this.el.stamp.hidden = false;
  }

  private showReveal() {
    const { el } = this;
    const o = this.outcome!;
    el.verdict.textContent = o.correct ? '✓ Correct.' : `✗ Wrong. You said ${o.approve ? 'approve' : 'deny'}.`;
    el.verdict.className = `verdict ${o.correct ? 'right' : 'wrong'}`;
    el.comment.textContent = this.round!.c;
    el.comment.dataset.size = sizeClass(this.round!.c);
    el.reveal.hidden = false;
    el.round.classList.add('is-revealed');
  }

  /** Jumps to the end state of the reveal; safe to call mid-animation. */
  private finishReveal() {
    if (this.phase !== 'revealing') return;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.el.stamp.hidden || this.el.stamp.classList.contains('slam')) this.stamp(false);
    this.el.plate.classList.add('stamped');
    if (this.onImpact) {
      this.onImpact(this.outcome!);
      this.onImpact = null;
    }
    if (this.el.reveal.hidden) this.showReveal();
    this.el.comment.classList.add('enter');
    this.phase = 'revealed';
    this.onRevealed?.();
    this.onRevealed = null;
  }

  private advance() {
    if (this.phase === 'revealing') return this.finishReveal();
    if (this.phase !== 'revealed' || !this.onNext) return;
    const resolve = this.onNext;
    this.onNext = null;
    this.phase = 'idle';
    resolve();
  }
}
