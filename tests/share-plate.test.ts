import { describe, expect, it } from 'vitest';
import { assignIds, plateId } from '../scripts/lib/ids.ts';
import { fitExplanation } from '../scripts/share/card.ts';
import { plateShareText, plateUrl } from '../src/share.ts';

describe('plate ids', () => {
  it('are stable: the same plate always gets the same id', () => {
    // Pinned: changing this breaks every link already shared.
    expect(plateId('BJCAMEX')).toBe('fgvx69t2');
    expect(plateId('BJCAMEX')).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it("don't depend on order or on which other plates exist", () => {
    const a = assignIds(['ONE', 'TWO', 'THREE']);
    const b = assignIds(['THREE', 'ONE']);
    expect(a.get('ONE')).toBe(b.get('ONE'));
    expect(a.get('THREE')).toBe(b.get('THREE'));
  });
});

describe('plate share text', () => {
  it('asks the question and never states the verdict', () => {
    const text = plateShareText('BJCAMEX');
    expect(text).toContain('BJCAMEX');
    expect(text.toLowerCase()).toContain('would you approve this?');
    expect(text).not.toMatch(/approved|denied/i);
  });

  it('shows plate symbols as they appear in the game', () => {
    expect(plateShareText('$ THX D')).toContain('♥ THX D');
  });

  it('links to the plate page', () => {
    expect(plateUrl('https://example.com/game', 'fgvx69t2')).toBe('https://example.com/game/p/fgvx69t2/');
  });
});

describe('preview image text', () => {
  it('keeps short explanations at the largest size', () => {
    const fit = fitExplanation('CAT', 456, 216);
    expect(fit.size).toBe(56);
    expect(fit.lines).toEqual(['“CAT”']);
  });

  it('truncates long explanations on a word, with an ellipsis and closing quote', () => {
    const long = 'WORD '.repeat(80).trim();
    const fit = fitExplanation(long, 456, 216);
    expect(fit.lines.length * fit.size * 1.22).toBeLessThanOrEqual(216);
    expect(fit.lines.at(-1)).toMatch(/WORD…”$/);
  });

  it('breaks a single very long word instead of overflowing', () => {
    const fit = fitExplanation('X'.repeat(120), 456, 216);
    expect(fit.lines.length).toBeGreaterThan(1);
  });
});
