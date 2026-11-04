import type { SendExtras } from "../client.svelte";
import type { SessionState } from "../client.svelte.js";
import { latestCommandFor } from "../client.svelte";
import { pendingRestore, type SendExtras as Extras } from "../client.svelte.js";
import { type PendingPermission } from "../client.svelte";
import { newId } from "../id";
import SessionReference from "../SessionReference.svelte";

export type Seen = [SendExtras, SessionState, Extras, PendingPermission];
export const used = [latestCommandFor, pendingRestore, newId, SessionReference];
