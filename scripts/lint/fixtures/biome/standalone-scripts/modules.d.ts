// Core's module as the fixtures name it: the scripts' project resolves no
// workspace package by name, and Biome reads these files, nothing runs them.
declare module "@cawco/core/is-record" {
  export const isRecord: (value: unknown) => value is Record<string, unknown>;
}
