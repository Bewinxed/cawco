// Left alone: a file on the rule's list to move.
declare const Effect: {
  forkChild: unknown;
  forkDetach: (...args: unknown[]) => unknown;
  forkScoped: unknown;
};
declare const work: { pipe: (step: unknown) => unknown };

export const moving = Effect.forkDetach(work);
