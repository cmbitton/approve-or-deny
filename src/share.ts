// Share strings never give away a verdict: no spoilers.
import { plateText } from './plate.ts';

const TITLE = 'Approved or Denied';
const RIGHT = '✅';
const WRONG = '❌';

export function dailyShareText(docket: number, results: readonly boolean[], url: string): string {
  const score = results.filter(Boolean).length;
  const row = results.map((r) => (r ? RIGHT : WRONG)).join('');
  return `${TITLE} #${docket}  ${score}/${results.length}  ${row}\n${url}`;
}

export function streakShareText(streak: number, url: string): string {
  const run = streak <= 10 ? RIGHT.repeat(streak) : `${RIGHT}×${streak}`;
  return `${TITLE}  Streak: ${streak}  ${run}${WRONG}\n${url}`;
}

/** One plate, as a question. The link opens that plate, unjudged. */
export function plateShareText(plate: string): string {
  return `“${plateText(plate)}”: would you approve this?`;
}

export function plateUrl(siteUrl: string, id: string): string {
  return `${siteUrl}/p/${id}/`;
}

export type ShareOutcome = 'share' | 'clipboard' | 'cancelled' | 'failed';

/**
 * Native share sheet where available, clipboard otherwise. With a `url`, the share sheet
 * gets it as a separate field (so apps can build a link preview) and the clipboard gets
 * the text with the link on its own line.
 */
export async function shareText(text: string, url?: string): Promise<ShareOutcome> {
  const data: ShareData = url ? { text, url } : { text };
  if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'share';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard (e.g. share blocked in an iframe).
    }
  }
  return (await copyText(url ? `${text}\n${url}` : text)) ? 'clipboard' : 'failed';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and insecure contexts.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
