// Planted: a detached fork in the agent.
declare const Effect: {
  forkChild: unknown;
  forkDetach: (...args: unknown[]) => unknown;
  forkScoped: unknown;
};
declare const work: { pipe: (step: unknown) => unknown };

export const detached = Effect.forkDetach(work, { startImmediately: true });
