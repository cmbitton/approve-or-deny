// Heuristic "how good a round is this" score. Higher is better. The weights are
// hand-tuned against samples of the data; data/review.csv exists so a human can
// override the result with pins and removals.

const BORING_COMMENT = [
  /AREA CODE/i,
  /\bGANG/i,
  /ALL (DIGITS|NUMBERS)/i,
  /^\W*LOOK\s*-?\s*A?\s*-?\s*LIKE\W*$/i,
  /CAN\s*NOT TRANSLATE|CANNOT TRANSLATE|UNABLE TO TRANSLATE/i,
  /^\W*(RED|BLUE|G|OG|\d+)\b/i,
  /\b(13|14|18|187|420|69|88)\s*(=|-|,|IS|REFERENCE)/i,
  /POLICE REFERENCE|LAW ENFORCEMENT/i,
  /^\W*(HOSTILE|PROFANITY|SEXUAL|SEXUAL REFERENCE|DRUG|DRUG REFERENCE|VULGAR|OFFENSIVE|NEGATIVE)\W*$/i,
];

const FUNNY_COMMENT = [
  /LOOKS? LIKE|SOUNDS? LIKE|READS? (AS|LIKE)/i,
  /COULD (BE|READ|MEAN)/i,
  /BACKWARDS?|MIRROR|REVERSE|UPSIDE/i,
  /SPELL|PHONETIC/i,
  /SLANG|URBAN DICTIONARY|TERM FOR|MEANS\b/i,
  /\bNOT A\b|\bNO \w+ (CAR|VEHICLE)|\bHAS A\b|\bOWNS\b|\bDRIVES\b/i,
  /\bBUT\b|\bHOWEVER\b|\bALTHOUGH\b/i,
  /["“”]|\?/,
];

const CRUDE = [
  /SEX|PENIS|DICK|COCK|BOOB|BREAST|NIPPLE|BUTT|\bASS\b|ANUS|ANAL|POOP|FART|TURD|POTTY|POO\b|PEE\b|URIN/i,
  /VAGINA|PUSSY|\bBALLS\b|TESTIC|ORAL|MASTURB|ERECT|ORGASM|HORNY|PORN|STRIP|NUDE|NAKED|LUST/i,
  /DRUG|MARIJUANA|WEED|COCAINE|\bMETH\b|HEROIN|DRUNK|BEER|BOOZE|VOMIT|STONED|\bHIGH\b/i,
  /FUCK|SHIT|BITCH|DAMN|HELL\b|CRAP|WHORE|SLUT/i,
];

const GENERIC_MEANING =
  /^\W*(MY |HIS |HER |OUR |FAMILY |CHILDHOOD |LAST |FIRST |COMPANY |BUSINESS |CAR |DOG'?S? |SON'?S? |DAUGHTER'?S? )*(NICK\s?NAME|NAME|INITIALS|LAST NAME|FIRST NAME|NAMES)S?\W*$/i;

const INNOCENT_MEANING =
  /FAVORITE|\bMY (WIFE|SON|DAUGHTER|DOG|CAT|HUSBAND|KIDS?|MOM|DAD|GRAND\w*|BOYFRIEND|GIRLFRIEND)\b|\bLOVE\b|\bMOVIE|\bSONG|\bBAND\b|\bTEAM\b|\bJEEP|\bTRUCK|\bBIKE|HOBBY|RETIRE|\bFARM|\bBEACH|\bFISH|\bSURF/i;

const words = (s: string) => new Set(s.toUpperCase().match(/[A-Z]{3,}/g) ?? []);

function overlap(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n / Math.min(wa.size, wb.size);
}

const countMatches = (res: RegExp[], s: string) => res.reduce((n, re) => n + (re.test(s) ? 1 : 0), 0);

export function scoreRound(plate: string, meaning: string, comment: string): number {
  const m = meaning.trim();
  const c = comment.trim();
  let s = 0;

  // Reveal: the reviewer comment carries the joke.
  const cl = c.length;
  if (cl < 6) s -= 3;
  else if (cl < 12) s -= 1.5;
  else s += Math.min(cl, 70) / 20;
  if (cl > 160) s -= 1.5;
  if ((c.match(/\S+/g) ?? []).length >= 4) s += 1;
  s -= 2 * Math.min(2, countMatches(BORING_COMMENT, c));
  s += 1.25 * Math.min(3, countMatches(FUNNY_COMMENT, c));
  s += 0.75 * Math.min(2, countMatches(CRUDE, c));
  if (/[a-z]/.test(c)) s += 0.5;

  // Setup: the applicant's explanation should be specific and plausibly innocent.
  const ml = m.length;
  if (ml < 8) s -= 2;
  else if (ml >= 20 && ml <= 140) s += 1.5;
  else if (ml > 200) s -= 1;
  if (GENERIC_MEANING.test(m)) s -= 2.5;
  if (INNOCENT_MEANING.test(m)) s += 0.75;

  // Surprise: reviewer saw something the applicant didn't mention.
  if (overlap(m, c) < 0.15) s += 1;

  // Plate: mostly-numeric or date-like plates read poorly.
  const alnum = plate.replace(/[^A-Za-z0-9]/g, '');
  const digits = alnum.replace(/[^0-9]/g, '').length;
  if (alnum.length && digits / alnum.length > 0.5) s -= 1.5;
  if (alnum.replace(/[0-9]/g, '').length < 3) s -= 1;
  if (/[a-z]/.test(plate)) s -= 2;

  return Math.round(s * 100) / 100;
}
