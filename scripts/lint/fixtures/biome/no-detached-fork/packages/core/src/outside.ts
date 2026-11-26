// Left alone: outside the hub's and the agent's internals.
declare const Effect: {
  forkChild: unknown;
  forkDetach: (...args: unknown[]) => unknown;
  forkScoped: unknown;
};
declare const work: { pipe: (step: unknown) => unknown };

export const outside = Effect.forkDetach(work);
