/**
 * Which lab makes a model, for the logo in a picker row or a delegate's header.
 * An id may carry a route prefix (`opencode-go/deepseek-v4-pro`), so the part
 * after the last `/` is what matches. Prefix-first and case-insensitive: a
 * single token decides a whole family, and anything else is not our call.
 *
 * `models.svelte.ts` re-exports it, so callers keep importing
 * it from the same place as `modelLabel`.
 */
const PROVIDER_PREFIXES: ReadonlyArray<
  readonly [prefix: string, provider: string]
> = [
  ["claude", "anthropic"],
  // Claude Code's own list is keyed by alias, not wire id — `supportedModels()`
  // returns value: 'sonnet' with resolvedModel: 'claude-sonnet-5'. Without
  // these, only rows carrying a full id (typed-in recents) ever get a mark.
  ["sonnet", "anthropic"],
  ["opus", "anthropic"],
  ["haiku", "anthropic"],
  ["fable", "anthropic"],
  ["gpt", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["o4", "openai"],
  ["deepseek", "deepseek"],
  ["gemini", "google"],
  ["grok", "xai"],
  ["qwen", "qwen"],
  ["kimi", "moonshot"],
  ["glm", "zhipu"],
  ["llama", "meta"],
  ["mistral", "mistral"],
  ["codestral", "mistral"],
  ["magistral", "mistral"],
  ["minimax", "minimax"],
  ["nemotron", "nvidia"],
];

export function providerOf(model: string): string | null {
  const name = model.slice(model.lastIndexOf("/") + 1).toLowerCase();
  const hit = PROVIDER_PREFIXES.find(([prefix]) => name.startsWith(prefix));
  return hit?.[1] ?? null;
}
