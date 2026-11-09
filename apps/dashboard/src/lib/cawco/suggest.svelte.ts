/**
 * Composer suggestions: the dashboard's side of `POST /api/suggest`, plus the
 * one hub setting that switches them on. Suggestions are text the operator
 * chooses to add to a prompt; the harness's tool set is never touched.
 */

import type { SuggestCandidate } from "@cawco/core/suggest";
import { hub } from "#lib/platform/hub.js";
import {
  hubData,
  hubDone,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import type { HubSeam } from "./hub-seam";

export type { SuggestCandidate } from "@cawco/core/suggest";

/** What `GET /api/openrouter` answers with. The key itself never leaves the hub. */
export interface OpenRouterState {
  connected: boolean;
  connectedAt: number | null;
}

/**
 * What `GET /api/jev` answers with: the route Jev takes now (null: off), the
 * TypeSafe key's last four characters while one is held, and the
 * suggestions switch. The key itself never leaves the hub.
 */
export interface JevState {
  route: "typesafe" | "openrouter" | null;
  suggestWhileTyping: boolean;
  typesafe: { ends: string; setAt: number | null } | null;
}

/**
 * Whether composers may ask, read once per page load and updated in place by
 * the Settings toggle. Off until the hub says otherwise — nothing is asked
 * before that answer arrives.
 */
export const suggestions = $state({ enabled: false });

let loaded = false;

/**
 * Reads the setting the first time a composer needs it, through the hub
 * that composer reads (hub-seam: the network, or a states file's stand-in).
 */
export function loadSuggestSetting(seam: HubSeam): void {
  if (loaded) {
    return;
  }
  loaded = true;
  // A hub away or restarting answers no setting: suggestions stay off, and
  // the read says why as every failed read does.
  seam.client.api.jev
    .get()
    .then((answer) => {
      if (answer.error) {
        throw refusedOrUnreached(answer);
      }
      const state = answer.data;
      suggestions.enabled = state.route !== null && state.suggestWhileTyping;
    })
    .catch((error: unknown) => {
      console.error("[cawco] /api/jev failed:", error);
    });
}

/** Turns suggestions on or off for every composer. */
export async function saveSuggestSetting(enabled: boolean): Promise<void> {
  await hubDone(hub.api.jev.suggest.put({ enabled }));
  suggestions.enabled = enabled;
}

/** One ask. Resolves to the ranked ids, or throws the hub's error text. */
export async function askSuggestions(
  body: { text: string; candidates: SuggestCandidate[] },
  signal: AbortSignal
): Promise<{ id: string; noul: number }[]> {
  const { suggestions: ranked } = await hubData(
    hub.api.suggest.post(body, { fetch: { signal } }),
    refusedOrUnreached
  );
  return ranked;
}

/** How long the composer waits after the last keystroke before asking. */
export const SUGGEST_PAUSE_MS = 1500;
/**
 * The most of a candidate's description Jev is sent. At 150 a description lost
 * the noun saying what it is for (impeccable's "…improve a frontend
 * interface"), and Jev matched on its verb list instead.
 */
const SUGGEST_DESC_CHARS = 300;

/** Cut to {@link SUGGEST_DESC_CHARS} at a word boundary, with an ellipsis. */
export function clip(text: string): string {
  if (text.length <= SUGGEST_DESC_CHARS) {
    return text;
  }
  const cut = text.slice(0, SUGGEST_DESC_CHARS - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** How the chip's text reads once it is in the prompt. */
export const suggestionLine = (candidate: SuggestCandidate): string => {
  if (candidate.kind === "skill") {
    return `Use the \`${candidate.name}\` skill.`;
  }
  if (candidate.kind === "tool") {
    return `Use the \`${candidate.name}\` tool.`;
  }
  return `Use the \`${candidate.name}\` MCP tools.`;
};
