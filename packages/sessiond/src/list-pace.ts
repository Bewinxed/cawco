/**
 * When a keeper answers a `list`: at once, in this build and every published
 * one. The stage 2 container proof's builds (scripts/build-binary.ts,
 * `stubHarness`) are compiled with scripts/binary/proof-list-pace.ts in this
 * module's place, which answers a retiring keeper's late, as a keeper on a
 * loaded machine does.
 */
export const paceList = (answer: () => void): void => answer();
