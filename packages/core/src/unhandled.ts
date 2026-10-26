/**
 * The end of an exhaustive switch: the one place it is written. The type
 * check (and Golar's switch-exhaustiveness-check) proves every member of the
 * union has its case, so a call here compiles only where `value` is `never`.
 * It still throws, because a value read off the wire or out of storage can be
 * outside its type at run time (an older peer's message, a stored row).
 * scripts/lint/no-hand-unhandled.grit refuses the hand-written form.
 */
export function unhandled(what: string, value: never): never {
  const shown: unknown = value;
  throw new Error(
    `unhandled ${what}: ${typeof shown === "object" ? JSON.stringify(shown) : String(shown)}`
  );
}
