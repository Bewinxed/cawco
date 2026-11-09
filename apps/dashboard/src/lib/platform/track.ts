/**
 * Reads values so the `$effect` or `$derived` around the call re-runs when
 * they change, where its body reads them only under `untrack`, or not at all
 * (a counter bumped to ask for another run). A promise is no dependency:
 * work started and not awaited goes to `detach` (@cawco/core/detach).
 */
export const track = <const T extends readonly unknown[]>(
  ..._values: {
    [K in keyof T]: T[K] extends PromiseLike<unknown> ? never : T[K];
  }
): void => undefined;
