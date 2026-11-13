<script lang="ts">
  import { detach } from "@cawco/core/detach";
  /**
   * The one code surface the console opens into — a tool result's output and a
   * markdown fence share it, on the house code theme (code-theme.ts): a
   * token's colour names a syntax role, design.css maps each role to a house
   * code token that carries both appearances, so a theme switch repaints
   * without tokenizing a line again; a grammar Highlights has no lexer for
   * falls back to a plain mono well.
   */
  import {
    agentCodeLanguage,
    highlightsLoaded,
    loadHighlights,
    tokenize,
  } from "./agent-code";

  let { text, language }: { text: string; language?: string | null } = $props();

  // Plain until Highlights has loaded; after that every block is tokenized on
  // the frame it has its text, so a streaming block never falls back to plain.
  let ready = $state(highlightsLoaded());

  $effect(() => {
    if (language && !ready) {
      detach(
        loadHighlights().then(() => {
          ready = true;
        }),
        "load highlights"
      );
    }
  });

  const lines = $derived.by(() => {
    const lang = ready ? agentCodeLanguage(language) : null;
    return lang ? tokenize(text, lang) : null;
  });
</script>

<div
  data-slot="well"
  class="bg-(color:--code-syntax-background) rounded-sm p-space-3 overflow-x-auto font-(family-name:--font-mono) text-size-label leading-body text-(color:--code-syntax-foreground)"
>
  {#if lines}
    <pre class="m-0 whitespace-pre"><code
        >{#each lines as line}<span data-slot="output-block-ln"
          >{#each line as token}<span style:color={token.color}
            >{token.content}</span
          >{/each}{"\n"}</span
        >{/each}</code
      ></pre>
  {:else}
    <pre class="m-0 whitespace-pre"><code>{text}</code></pre>
  {/if}
</div>
