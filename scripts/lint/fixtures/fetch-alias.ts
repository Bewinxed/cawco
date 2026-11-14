// What house/no-fetch-alias must refuse (expected.txt): an import bound to the name.
import { provenFetch as fetch } from "../../../packages/agent/src/hub-proof";

// A parameter and a property named `fetch` stand.
export const handedIn = (load: { fetch: typeof globalThis.fetch }) =>
  load.fetch;
export const viaImport = () => fetch;
