// The DMV records use ASCII stand-ins for the plate's special symbols.
const SYMBOLS: Record<string, { glyph: string; label: string }> = {
  '#': { glyph: '✋', label: 'hand' },
  $: { glyph: '♥', label: 'heart' },
  '+': { glyph: '+', label: 'plus' },
  '&': { glyph: '★', label: 'star' },
};

/** Builds plate text with symbols swapped in. Never uses innerHTML on record text. */
export function renderPlate(target: HTMLElement, plate: string) {
  target.replaceChildren();
  const labelParts: string[] = [];
  for (const ch of plate) {
    const sym = SYMBOLS[ch];
    if (sym) {
      const span = document.createElement('span');
      span.className = `sym sym-${sym.label}`;
      span.textContent = sym.glyph;
      span.setAttribute('aria-hidden', 'true');
      target.append(span);
      labelParts.push(` ${sym.label} `);
    } else {
      target.append(ch);
      labelParts.push(ch === ' ' ? ' space ' : ch);
    }
  }
  target.setAttribute('aria-label', `Plate: ${labelParts.join('').replace(/\s+/g, ' ').trim()}`);
  fitPlate(target);
}

const BASE_CQI = 31;

/**
 * Shrinks the plate text until it fits inside the plate. Sizes are in container
 * units, so the result holds when the plate is resized.
 */
export function fitPlate(target: HTMLElement) {
  const plate = target.parentElement;
  if (!plate) return;
  target.style.fontSize = '';
  const available = plate.clientWidth * 0.86;
  const width = target.getBoundingClientRect().width;
  if (width > available && width > 0) {
    target.style.fontSize = `${((BASE_CQI * available) / width).toFixed(2)}cqi`;
  }
}

/** Plain-text form for share strings and alt text. */
export function plateText(plate: string): string {
  return [...plate].map((ch) => SYMBOLS[ch]?.glyph ?? ch).join('');
}
