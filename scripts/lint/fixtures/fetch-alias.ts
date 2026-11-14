// What house/no-fetch-alias must refuse (expected.txt): an import bound to the name.
import { hubRequest as fetch } from "../../../packages/core/src/hub-request";

// A parameter and a property named `fetch` stand.
export const handedIn = (load: { fetch: typeof globalThis.fetch }) =>
  load.fetch;
export const viaImport = () => fetch;
