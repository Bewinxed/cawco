// Planted: a rejection handed on as it is, and a wrap with no catch.
declare const Effect: {
  tryPromise: (
    run:
      | { try: () => Promise<string>; catch: (error: unknown) => unknown }
      | (() => Promise<string>)
  ) => unknown;
};
declare const read: () => Promise<string>;
declare class ReadFailed {
  constructor(fields: { cause: unknown });
}

export const passed = Effect.tryPromise({
  try: read,
  catch: (error) => error,
});
export const bare = Effect.tryPromise(() => read());
export const named = Effect.tryPromise(read);

// Left alone: the module's own tagged error made in catch.
export const tagged = Effect.tryPromise({
  try: read,
  catch: (cause) => new ReadFailed({ cause }),
});
