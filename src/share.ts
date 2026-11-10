// Share strings never mention the plates themselves: no spoilers.

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

export type ShareOutcome = 'share' | 'clipboard' | 'cancelled' | 'failed';

/** Native share sheet where available, clipboard otherwise. */
export async function shareText(text: string): Promise<ShareOutcome> {
  const data = { text };
  if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'share';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard (e.g. share blocked in an iframe).
    }
  }
  return (await copyText(text)) ? 'clipboard' : 'failed';
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
