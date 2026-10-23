/**
 * What Caw shows. Each status is its own file, assets/mascot/caw/<status>.riv.
 * In a `.ts` module of its own, so a `.ts` file that switches on it reads its
 * members: the switch check (scripts/lint/golar-lint.ts) types an import from a
 * `.svelte` module in a `.ts` file as the error type.
 */
export type CawStatus =
  | "ready"
  | "working"
  | "needs-you"
  | "idle"
  | "done"
  | "trying"
  | "loading"
  | "reconnecting"
  | "sleeping"
  | "compacted";
