// Planted: the brand made outside the redactor, by a cast or a guard.
declare const REDACTED: unique symbol;
type Redacted<T> = T & { readonly [REDACTED]: true };
declare const frame: { verb: string };
const cast = frame as Redacted<{ verb: string }>;
const nested = [frame] as Array<Redacted<{ verb: string }>>;
const passes = (value: unknown): value is Redacted<{ verb: string }> =>
  value !== null;
function guarded(value: unknown): value is Redacted<{ verb: string }> {
  return value !== null;
}

// Left alone: the brand as a parameter's or a variable's type, and a cast
// to anything else.
const send = (sent: Redacted<{ verb: string }>): string => sent.verb;
const plain = frame as { verb: string };

export { cast, guarded, nested, passes, plain, send };
