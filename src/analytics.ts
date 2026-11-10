import { CONFIG } from './config.ts';

export type AnalyticsEvent =
  | { name: 'round_answered'; mode: 'streak' | 'daily' | 'shared'; correct: boolean }
  | { name: 'daily_finished'; score: number; docket: number }
  | { name: 'streak_ended'; streak: number }
  | { name: 'share_tapped'; mode: 'streak' | 'daily' | 'plate'; method: 'share' | 'clipboard' };

type Sink = (event: AnalyticsEvent) => void;

// No provider yet. Plausible, Cloudflare Web Analytics, etc. plug in via setAnalyticsSink.
let sink: Sink = () => {};

export function setAnalyticsSink(next: Sink) {
  sink = next;
}

export function track(event: AnalyticsEvent) {
  if (!CONFIG.analytics.enabled) return;
  try {
    sink(event);
  } catch {
    // Analytics must never affect play.
  }
}
