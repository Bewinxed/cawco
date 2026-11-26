// Planted: a detached fork in the hub, piped and called.
declare const Effect: {
  forkChild: unknown;
  forkDetach: (...args: unknown[]) => unknown;
  forkScoped: unknown;
};
declare const work: { pipe: (step: unknown) => unknown };

export const piped = work.pipe(Effect.forkDetach);
export const called = Effect.forkDetach(work);

// Left alone: a fork its parent stops, and one in a scope.
export const child = work.pipe(Effect.forkChild);
export const scoped = work.pipe(Effect.forkScoped);
