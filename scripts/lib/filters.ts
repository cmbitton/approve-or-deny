export interface RawRow {
  plate: string;
  review_reason_code: string;
  customer_meaning: string;
  reviewer_comments: string;
  status: string;
}

export type DropReason =
  | 'junk-status'
  | 'missing-meaning'
  | 'missing-comment'
  | 'placeholder'
  | 'blocklist'
  | 'personal-info'
  | 'duplicate'
  | 'duplicate-conflicting-status';

// Placeholder text means the DMV never had the applicant's explanation, so the round has no setup.
const MEANING_PLACEHOLDERS: RegExp[] = [
  /\bMICRO\b/i,
  /QUICK\s*-?\s*WEB/i,
  /\bREG\s*17\b/i,
  /\bNO MEANING\b/i,
  /\b(NOT|UN) ?AVAILABLE\b/i,
  /^\W*(N\/?A|NONE|NOTHING|UNKNOWN|NO|BLANK|X+|\?+)\W*$/i,
];
const COMMENT_PLACEHOLDERS: RegExp[] = [
  /\bNO MICRO\b/i,
  /^\W*(N\/?A|NONE|NOTHING|UNKNOWN|BLANK|X+|\?+)\W*$/i,
];

export function hasPlaceholder(meaning: string, comment: string): boolean {
  return (
    MEANING_PLACEHOLDERS.some((re) => re.test(meaning.trim())) ||
    COMMENT_PLACEHOLDERS.some((re) => re.test(comment.trim()))
  );
}

export interface Blocklist {
  plateTerms: string[];
  wordTerms: RegExp[];
  plateAllow: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseBlocklist(text: string): Blocklist {
  const plateTerms: string[] = [];
  const wordTerms: RegExp[] = [];
  const plateAllow: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toUpperCase();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      plateAllow.push(line.slice(1));
      continue;
    }
    const wordOnly = line.startsWith('~');
    const term = wordOnly ? line.slice(1) : line;
    const pattern = term.split(/\s+/).map(escape).join('[\\s_-]*');
    wordTerms.push(new RegExp(`(^|[^A-Z])${pattern}(S|ES|Z)?([^A-Z]|$)`));
    if (!wordOnly) plateTerms.push(term.replace(/\s+/g, ''));
  }
  return { plateTerms, wordTerms, plateAllow };
}

const LEET: Record<string, string> = { '0': 'O', '1': 'I', '3': 'E', '4': 'A', '5': 'S', '7': 'T', '9': 'G' };

/** Letters-only forms of a plate: as written, and with number-for-letter swaps undone. */
export function plateForms(plate: string): string[] {
  const up = plate.toUpperCase();
  const letters = up.replace(/[^A-Z0-9]/g, '');
  const unleet = letters.replace(/[0-9]/g, (d) => LEET[d] ?? d);
  return [...new Set([letters, unleet])];
}

export function hitsBlocklist(row: RawRow, bl: Blocklist): string | null {
  const fields = [row.plate, row.customer_meaning, row.reviewer_comments];
  for (const f of fields) {
    const up = f.toUpperCase();
    for (const re of bl.wordTerms) if (re.test(up)) return re.source;
  }
  for (let form of plateForms(row.plate)) {
    for (const safe of bl.plateAllow) form = form.split(safe).join('·');
    for (const term of bl.plateTerms) if (form.includes(term)) return term;
  }
  return null;
}

export interface NameLists {
  first: Set<string>;
  surname: Set<string>;
  common: Set<string>;
  /** Highest-frequency English words; never treated as the start of a name. */
  veryCommon: Set<string>;
}

const isCommon = (w: string, lists: NameLists) =>
  lists.common.has(w) || lists.common.has(w.replace(/E?S$/, '')) || lists.common.has(w.replace(/S$/, ''));

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = [/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, /\b\d{10}\b/, /\b\d{3}[-.]\d{4}\b/];
const ADDRESS = [
  /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Z'.-]*(?:\s+[A-Z][A-Z'.-]*){0,3}\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|PL|PLACE|PKWY|PARKWAY|HWY|CIR|CIRCLE|TER|TERRACE)\b\.?/i,
  /\bP\.?\s?O\.?\s+BOX\s+\d+/i,
];

// Entries in the first-name list that are far more often ordinary words or places.
const NOT_NAMES = new Set(
  (
    'AN IN MY SO SEE ELSE MANY SOON SON SONG LOVE HAPPY HOPE OK DE MA PA MAN LONG YOUNG NUMBERS SEASON ' +
    'LOAN PAGE STAR SUN SPRING SUMMER KING MAJOR GAY ART THU SUNDAY TUESDAY JANUARY AUGUST SEPTEMBER ' +
    'AMERICA ASIA CHINA FRANCE INDIA FLORIDA CAROLINA VIRGINIA SANTA SAN LOS DEL HONG CAL BEVERLY ANGELES ' +
    'MERCEDES PORSCHE HARLEY SHELBY KIA ROMAN GERMAN DICK LUCKY QUEEN KITTY KAT GOLDEN GUY LADY PET MISS FAN ' +
    'BEE MAC ALPHA MI LIL MARINE HONEY BUCK ROD STORM HUNTER CRYSTAL ALMA NAM DUNG'
  ).split(' '),
);

/** Looks for "First Last" pairs. Errs toward flagging, since a false drop costs little. */
export function hasFullName(text: string, lists: NameLists): boolean {
  const tokens = text.toUpperCase().match(/[A-Z][A-Z'-]*/g) ?? [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i].replace(/'S$/, '');
    const b = tokens[i + 1].replace(/'S$/, '');
    if (a.length < 2 || b.length < 2 || NOT_NAMES.has(a) || !lists.first.has(a)) continue;
    if (lists.veryCommon.has(b)) continue;
    if (!isCommon(b, lists) || lists.surname.has(b) || lists.first.has(b)) return true;
  }
  return false;
}

export function hasPersonalInfo(row: RawRow, lists: NameLists): boolean {
  for (const text of [row.customer_meaning, row.reviewer_comments]) {
    if (EMAIL.test(text)) return true;
    if (PHONE.some((re) => re.test(text))) return true;
    if (ADDRESS.some((re) => re.test(text))) return true;
    if (hasFullName(text, lists)) return true;
  }
  return false;
}

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, ' ');
}
