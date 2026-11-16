/** A status on a state's card: its tone's glyph, then its word (DESIGN.md, The Glyph, Word, Hue Rule), and what it means whole. */
export interface StateMark {
  said: string;
  tone: "fail" | "attn";
  word: string;
}

/** A state's card on the whole set's map: what it draws, set when the set or the kept state changes, never by the view. */
export interface StateCard extends Record<string, unknown> {
  /** It is the state the kept one is compared with. */
  against: boolean;
  id: string;
  /** It is the state on the stage. */
  kept: boolean;
  /** Its marks, each a status: an error state (fail), no move leading here or on (attn); its word on the card, its sentence in the tooltip. */
  marks: StateMark[];
  name: string;
  note: string | null;
  onpress: (state: string) => void;
}
