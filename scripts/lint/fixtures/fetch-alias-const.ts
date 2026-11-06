// What house/no-fetch-alias must refuse (expected.txt): a declaration bound to the name.
declare const provenFetch: typeof globalThis.fetch;

export const aliased = () => {
  const fetch = provenFetch;
  return fetch;
};
