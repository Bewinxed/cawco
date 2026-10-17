<script lang="ts">
  /**
   * The one code surface the console opens into — a tool result's output and a
   * markdown fence share it, on the house code theme (code-theme.ts): a
   * token's colour names a syntax role, app.css maps each role to a house code
   * token that carries both appearances, so a theme switch repaints without
   * tokenizing a line again; a
   * grammar the highlighter does not carry falls back to a plain mono well.
   */
  import {
    type AgentCodeTokenLines,
    type AgentCodeTokens,
    agentCodeLanguage,
    cachedTokens,
    paintableTokens,
    tokenize,
  } from "./agent-code";

  let { text, language }: { text: string; language?: string | null } = $props();

  const lang = $derived(agentCodeLanguage(language));

  let painted = $state<AgentCodeTokens | null>(null);

  // The tokens that may paint right now: the ones in hand while a fresh batch is
  // pending, so a streaming block stays coloured between frames.
  const lines = $derived.by<AgentCodeTokenLines | null>(() => {
    if (!lang) {
      return null;
    }
    return (
      paintableTokens(painted, text, lang) ??
      cachedTokens(text, lang)?.lines ??
      null
    );
  });

  $effect(() => {
    if (!lang) {
      return;
    }
    let live = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the `live` flag guards against a stale result after the effect re-runs
    void tokenize(text, lang).then((result) => {
      if (live) {
        painted = result;
      }
    });
    return () => {
      live = false;
    };
  });
</script>

<!-- literal: 10px, 12px -->
<div
  data-slot="well"
  class="bg-(color:--code-syntax-background) rounded-sm py-(--pad-y) px-(--pad-x) overflow-x-auto font-(family-name:--font-mono) text-size-label leading-body text-(color:--code-syntax-foreground)"
  style:--pad-y="10px"
  style:--pad-x="12px"
>
  {#if lines}
    <pre class="m-0 whitespace-pre"><code
        >{#each lines as line}<span data-slot="output-block-ln"
          >{#each line as token}<span
            class="text-(color:--token-ink)"
            style:--token-ink={token.color}>{token.content}</span
          >{/each}{"\n"}</span
        >{/each}</code
      ></pre>
  {:else}
    <pre class="m-0 whitespace-pre"><code>{text}</code></pre>
  {/if}
</div>
