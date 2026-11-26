// Left alone: outside the agent.
declare const Effect: {
  tryPromise: (
    run:
      | { try: () => Promise<string>; catch: (error: unknown) => unknown }
      | (() => Promise<string>)
  ) => unknown;
};
declare const read: () => Promise<string>;

export const passed = Effect.tryPromise({
  try: read,
  catch: (error) => error,
});
