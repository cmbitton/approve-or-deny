/** One round. Text fields are verbatim from the DMV records. */
export interface Round {
  /** Requested plate text. `#` hand, `$` heart, `+` plus, `&` star. */
  p: string;
  /** Applicant's explanation (customer_meaning). */
  m: string;
  /** DMV reviewer comment (reviewer_comments). */
  c: string;
  /** 1 if the DMV approved the plate, 0 if it denied it. */
  a: 0 | 1;
}

export interface Deck {
  version: 1;
  builtAt: string;
  rounds: Round[];
}
