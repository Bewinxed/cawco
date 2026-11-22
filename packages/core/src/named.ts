/**
 * A name as the words place it: `lead` where it begins a sentence or stands
 * alone (a title, a speaker), `mid` inside a sentence. A known name is the
 * same in both; a stand-in for one not known yet ("Its session", "its
 * session", core words/preview.ts `unnamed`) is not, so no word capitalises
 * it in code.
 */
export interface Named {
  readonly lead: string;
  readonly mid: string;
}

/** A known name: the same at a sentence's start and inside one. */
export const named = (name: string): Named => ({ lead: name, mid: name });
