/**
 * What a caller sends, held exactly to what it may send. A field the
 * receiver doesn't take is a 422 at the hub (server.ts `normalize: false`),
 * and TypeScript refuses an extra property only on a fresh object literal
 * ("Since assigning `squareOptions` won't undergo excess property checks,
 * the compiler won't give you an error",
 * typescriptlang.org/docs/handbook/2/objects.html). So {@link Exact} checks
 * field by field at every depth, for a typed variable as much as for a
 * literal: a field no branch of the schema type declares is a type error, a
 * record or `unknown` the receiver takes stays open, `any` is refused.
 */

/**
 * `T` as a caller may send it: every array and field read-only (what is sent
 * is never written, so a read-only array a caller holds goes as it is), and
 * a record of anything (`t.Record(t.String(), t.Unknown())`) as any object,
 * which an interface is too (an interface has no index signature, so it is
 * no `Record<string, unknown>`).
 */
export type ReadonlyDeep<T> = T extends readonly (infer I)[]
  ? readonly ReadonlyDeep<I>[]
  : T extends object
    ? string extends keyof T
      ? unknown extends T[string]
        ? object
        : { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
      : { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
    : T;

declare const notTaken: unique symbol;
/** A field the route doesn't take: what `Exact` puts in its place, so the type error names it. */
interface NotTaken {
  readonly [notTaken]: "a field this hub route doesn't take";
}

/** Whether schema type `S` takes keys it doesn't list: `unknown`, any object, or a record. */
type Open<S> = unknown extends S
  ? true
  : [keyof NonNullable<S>, object] extends [never, NonNullable<S>]
    ? true
    : S extends object
      ? string extends keyof S
        ? true
        : false
      : false;
/** Every key any branch of `S` declares. */
type KeysOf<S> = S extends unknown ? keyof S : never;
/** `K`'s type in each branch of `S` that declares it. */
type At<S, K> = S extends unknown ? (K extends keyof S ? S[K] : never) : never;
type ItemOf<S> = S extends readonly (infer I)[] ? I : never;

/**
 * `T` with each field schema `S` doesn't take as {@link NotTaken}, at every
 * depth: `T` is assignable to it only when it sends nothing more. `any`
 * is never: it is assignable to anything else.
 */
type Exact<T, S> = 0 extends 1 & T
  ? never
  : true extends Open<S>
    ? T
    : T extends readonly unknown[]
      ? { [I in keyof T]: Exact<T[I], ItemOf<Extract<S, readonly unknown[]>>> }
      : T extends object
        ? {
            [K in keyof T]: K extends KeysOf<Extract<S, object>>
              ? Exact<T[K], At<Extract<S, object>, K>>
              : NotTaken;
          }
        : T;

/**
 * `A`, what a caller sends, as it may stand where schema type `S` is taken:
 * all `S` needs, nothing `S` doesn't take ({@link Exact}), and never `any`.
 * A signature takes `A` as its own type parameter (`<const A>`) so it is
 * read as the caller wrote it, literal or typed variable.
 */
export type Sending<A, S> = 0 extends 1 & A ? never : A & S & Exact<A, S>;
