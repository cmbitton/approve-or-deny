import { describe, expect, it } from 'vitest';
import {
  type NameLists,
  type RawRow,
  hasFullName,
  hasPersonalInfo,
  hasPlaceholder,
  hitsBlocklist,
  parseBlocklist,
} from '../scripts/lib/filters.ts';
import { scoreRound } from '../scripts/lib/score.ts';
import { parseAction, selectBalanced } from '../scripts/lib/select.ts';

const row = (plate: string, meaning: string, comment: string, status = 'N'): RawRow => ({
  plate,
  customer_meaning: meaning,
  reviewer_comments: comment,
  status,
  review_reason_code: '1',
});

describe('placeholders', () => {
  it('drops imaging-system placeholders', () => {
    expect(hasPlaceholder('NO MICRO', 'LOOKS LIKE X')).toBe(true);
    expect(hasPlaceholder('NOT ON QUICKWEB YET', 'X')).toBe(true);
    expect(hasPlaceholder('NO MEANING ON REG 17', 'X')).toBe(true);
    expect(hasPlaceholder('I LOVE TACOS', 'CAN NOT TRANSLATE NO MICRO')).toBe(true);
    expect(hasPlaceholder('N/A', 'X')).toBe(true);
  });
  it('keeps real text that merely contains similar words', () => {
    expect(hasPlaceholder('I LOVE TACOS', 'HIDDEN MIC.. MICROPHONE? CONSPIRACY')).toBe(false);
    expect(hasPlaceholder('MY MICROBREWERY', 'BREW')).toBe(false);
  });
});

describe('blocklist', () => {
  const bl = parseBlocklist('badword\n~shrt\n!safebadwordx\n');
  it('matches whole words in text and plurals', () => {
    expect(hitsBlocklist(row('ABC', 'x', 'PULLED FOR BADWORDS'), bl)).not.toBeNull();
    expect(hitsBlocklist(row('ABC', 'shrt thing', 'x'), bl)).not.toBeNull();
  });
  it('matches plate substrings, including number-for-letter swaps', () => {
    expect(hitsBlocklist(row('XBADW0RD', 'x', 'y'), bl)).not.toBeNull();
    expect(hitsBlocklist(row('B4DW 0RD', 'x', 'y'), bl)).not.toBeNull();
  });
  it('does not substring-match word-only terms or allowlisted plates', () => {
    expect(hitsBlocklist(row('XSHRTX', 'x', 'y'), bl)).toBeNull();
    expect(hitsBlocklist(row('ASHRTS', 'x', 'y'), bl)).toBeNull();
    expect(hitsBlocklist(row('SAFEBADWORDX', 'x', 'y'), bl)).toBeNull();
  });
});

describe('personal info', () => {
  const lists: NameLists = {
    first: new Set(['GREG', 'MARY', 'MY', 'MERCEDES', 'SCOTT']),
    surname: new Set(['SNOWDEN', 'BENZ', 'CAMPBELL']),
    common: new Set(['MY', 'HUSBAND', 'IS', 'NAME', 'CAMPBELL', 'CAR']),
    veryCommon: new Set(['MY', 'IS']),
  };
  it('flags first-last name pairs', () => {
    expect(hasFullName('HIS NAME IS GREG SNOWDEN', lists)).toBe(true);
    expect(hasFullName('(Mary Kathleen)', lists)).toBe(true);
    expect(hasFullName('his name is Scott Campbell', lists)).toBe(true);
  });
  it('ignores common words that happen to be names', () => {
    expect(hasFullName('MY HUSBANDS CAR', lists)).toBe(false);
    expect(hasFullName('MERCEDES BENZ', lists)).toBe(false);
  });
  it('flags emails, phone numbers and street addresses', () => {
    expect(hasPersonalInfo(row('A', 'EMAIL ME AT A.B@YAHOO.COM', 'x'), lists)).toBe(true);
    expect(hasPersonalInfo(row('A', 'CALL 916-555-1212', 'x'), lists)).toBe(true);
    expect(hasPersonalInfo(row('A', 'I LIVE AT 1234 ELM ST', 'x'), lists)).toBe(true);
    expect(hasPersonalInfo(row('A', '4 WHEEL DRIVE OR NOTHING', 'x'), lists)).toBe(false);
  });
});

describe('scoring', () => {
  it('ranks a surprising reviewer comment above a terse one', () => {
    const good = scoreRound('CHEFFIN', 'WAY OF LIFE BEING A CHEF', 'SOUNDS LIKE CHIEFING WHICH MEANS GETTING HIGH ON WEED');
    const weak = scoreRound('CHEFFIN', 'WAY OF LIFE BEING A CHEF', 'NO');
    expect(good).toBeGreaterThan(weak);
  });
  it('penalizes generic meanings and boring comments', () => {
    const generic = scoreRound('BOBBY13', 'NICKNAME', '13 GANG REFERENCE');
    const specific = scoreRound('BOBBY13', 'MY DAD CALLED ME BOBBY, BORN ON THE 13TH', 'LOOKS LIKE BOOBY, COULD BE SEXUAL');
    expect(specific).toBeGreaterThan(generic);
  });
});

describe('balanced selection', () => {
  const cands = [
    ...Array.from({ length: 10 }, (_, i) => ({ plate: `Y${i}`, approved: true, score: i })),
    ...Array.from({ length: 30 }, (_, i) => ({ plate: `N${i}`, approved: false, score: i })),
  ];
  it('deals equal numbers of each outcome, capped by the smaller side', () => {
    const { chosen, perSide } = selectBalanced(cands, new Map(), 50);
    expect(perSide).toBe(10);
    expect([...chosen].filter((p) => p.startsWith('Y'))).toHaveLength(10);
    expect([...chosen].filter((p) => p.startsWith('N'))).toHaveLength(10);
  });
  it('takes the highest scores first', () => {
    const { chosen } = selectBalanced(cands, new Map(), 3);
    expect([...chosen].sort()).toEqual(['N27', 'N28', 'N29', 'Y7', 'Y8', 'Y9']);
  });
  it('honors pins and removals', () => {
    const actions = new Map([
      ['N0', 'pin' as const],
      ['N29', 'remove' as const],
    ]);
    const { chosen } = selectBalanced(cands, actions, 3);
    expect(chosen.has('N0')).toBe(true);
    expect(chosen.has('N29')).toBe(false);
    expect([...chosen].filter((p) => p.startsWith('N'))).toHaveLength(3);
  });
  it('parses action spellings', () => {
    expect(parseAction(' PIN ')).toBe('pin');
    expect(parseAction('x')).toBe('remove');
    expect(parseAction('')).toBe('');
  });
});
