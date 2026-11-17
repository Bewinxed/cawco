/**
 * What a bench's machine says of its Claude Code (dev only): installed,
 * signed in, and taking every change a session card asks of it, model,
 * effort and every permission mode but Full Send. The motion benches
 * (routes/(app)/motion) and the session card's bench
 * (accounts/limit-picker-bench.svelte) stand their machines on it.
 */
import { CAPABILITIES_NONE } from "@cawco/core/harness";
import { PERMISSION_MODES } from "@cawco/core/harness/modes";
import type { Machine } from "./stores/board.svelte";

export const benchClaudeReport: NonNullable<Machine["harnesses"]>[number] = {
  harness: "claude",
  auth: "authenticated",
  installed: true,
  capabilities: {
    ...CAPABILITIES_NONE,
    permissionModes: PERMISSION_MODES.filter((mode) => mode !== "fullSend"),
    effort: true,
    setModel: true,
  },
};
