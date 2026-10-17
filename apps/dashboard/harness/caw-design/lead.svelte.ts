/**
 * Caw's lead as the panel reads it, on fixture data: his view (on, his
 * harness and model, his lead session), at rest. Nothing it does reaches a
 * hub; choosing a model in his card changes it here.
 */
import type { CawView } from "@cawco/core";
import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
import { LEAD_ID } from "./states/fixtures";

const view = $state<CawView>({
  answering: null,
  harness: "claude",
  leadInstanceId: LEAD_ID,
  model: null,
  on: true,
  problem: null,
  running: [],
  spendUsd: 3.42,
});

export const lead = {
  get view() {
    return view;
  },
  status: "ready",
  moving: false,
  refused: null,
  open: true,
  configure: (change: Partial<CawView>) => {
    Object.assign(view, change);
    return Promise.resolve();
  },
} as unknown as CawLead;
