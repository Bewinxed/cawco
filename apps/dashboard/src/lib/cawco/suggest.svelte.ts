/**
 * Composer suggestions: the dashboard's side of `POST /api/suggest`, plus the
 * one hub setting that switches them on. Suggestions are text the operator
 * chooses to add to a prompt; the harness's tool set is never touched.
 */

/**
 * One thing Jev can be asked about: a skill, a tool or an MCP server the
 * session has. The hub ranks them by the operator's usage and asks about the
 * top ones, so the composer sends them all.
 */
export interface SuggestCandidate {
  description: string;
  id: string;
  kind: "skill" | "tool" | "mcp";
  name: string;
}

/** What `GET /api/openrouter` answers with. The key itself never leaves the hub. */
export interface OpenRouterState {
  connected: boolean;
  connectedAt: number | null;
  suggestWhileTyping: boolean;
}

/**
 * Whether composers may ask, read once per page load and updated in place by
 * the Settings toggle. Off until the hub says otherwise — nothing is asked
 * before that answer arrives.
 */
export const suggestions = $state({ enabled: false });

let loaded = false;

/** Reads the setting the first time a composer needs it. */
export function loadSuggestSetting(): void {
  if (loaded) {
    return;
  }
  loaded = true;
  // biome-ignore lint/complexity/noVoid: fire-and-forget; the result lands in shared state
  void fetch("/api/openrouter")
    .then((response) => response.json() as Promise<OpenRouterState>)
    .then((state) => {
      suggestions.enabled = state.connected && state.suggestWhileTyping;
    });
}

/** Turns suggestions on or off for every composer. */
export async function saveSuggestSetting(enabled: boolean): Promise<void> {
  const response = await fetch("/api/openrouter/suggest", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  suggestions.enabled = enabled;
}

/** One ask. Resolves to the ranked ids, or throws the hub's error text. */
export async function askSuggestions(
  body: { text: string; candidates: SuggestCandidate[] },
  signal: AbortSignal
): Promise<{ id: string; noul: number }[]> {
  const response = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const { suggestions: ranked } = (await response.json()) as {
    suggestions: { id: string; noul: number }[];
  };
  return ranked;
}

/** How long the composer waits after the last keystroke before asking. */
export const SUGGEST_PAUSE_MS = 1500;
/**
 * The most of a candidate's description Jev is sent. At 150 a description lost
 * the noun saying what it is for (impeccable's "…improve a frontend
 * interface"), and Jev matched on its verb list instead.
 */
export const SUGGEST_DESC_CHARS = 300;

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
