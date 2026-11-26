// The modules as the fixtures name them: the scripts' project resolves none
// of them, and Biome reads these files, nothing runs them.
declare module "effect" {
  export const Effect: unknown;
}
declare module "effect/Schedule" {
  export type Schedule<A> = { readonly output: A };
}
declare module "@cawco/core/effect/join" {
  export const makeJoin: unknown;
}
declare module "@cawco/core/effect/poll" {
  export const lookUntil: unknown;
}
declare module "@cawco/core/keyed-lock" {
  export const makeKeyedLock: unknown;
}
declare module "@cawco/core/backoff" {
  export const backoffWait: unknown;
}
