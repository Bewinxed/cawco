/**
 * The hub's HTTP app as a type: what `createServer` returns, every route's
 * params, query, body and answers. Its callers' Eden clients take their
 * types from it by a type-only import, and no server code goes with it.
 */
import type { createServer } from "./server";

export type HubApp = ReturnType<typeof createServer>;
