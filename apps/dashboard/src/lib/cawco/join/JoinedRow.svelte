<script lang="ts">
  /**
   * The row both ways in end on: the machine joined, and whether agents can
   * use it yet. One sentence that ends in the verdict and, only when the Mac
   * needs something, one muted line saying what to do there. A state change
   * turns the tint and cross-fades the words in place.
   */
  import { fade } from "svelte/transition";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { dur } from "../motion/curves.svelte";
  import { type Readiness, readinessLine } from "./readiness.svelte";

  let { name, readiness }: { name: string; readiness: Readiness } = $props();

  /** A check shows as a wait only once it outlasts --dur-wait-grace (the Real Wait Rule). */
  let waited = $state(false);
  $effect(() => {
    if (readiness.kind !== "checking") {
      waited = false;
      return;
    }
    const left = readiness.since + dur("--dur-wait-grace") - Date.now();
    waited = left <= 0;
    if (waited) {
      return;
    }
    const timer = setTimeout(() => {
      waited = true;
    }, left);
    return () => clearTimeout(timer);
  });

  const line = $derived(readinessLine(readiness, waited));
  const Glyph = $derived(line.glyph === "spinner" ? null : line.glyph);
  /** What the row says; a fresh read that says the same thing does not fade. */
  const said = $derived(
    `${line.tone}|${line.glyph === "spinner" ? "spinner" : ""}|${line.rest}|${line.instruction ?? ""}`
  );
</script>

<Alert.Root
  aria-live="polite"
  class="transition-[background-color,color] duration-[var(--dur-panel)] ease-[var(--ease-out)]"
  data-readiness={readiness.kind}
  role="status"
  variant={line.tone}
>
  <div class="said">
    {#key said}
      <div class="line" transition:fade={{ duration: dur("--dur-fade") }}>
        <span class="glyph" class:quiet={line.tone === "default"}>
          {#if Glyph}
            <Glyph aria-hidden="true" class="size-4" />
          {:else}
            <Spinner aria-hidden="true" class="size-4" role="presentation" />
          {/if}
        </span>
        <div class="words">
          <p class="sentence">
            <span class="who" title={name}>{name}</span>
            {line.rest}
          </p>
          {#if line.instruction}
            <p class="how">{line.instruction}</p>
          {/if}
        </div>
      </div>
    {/key}
  </div>
</Alert.Root>

<style>
  /* Two copies share one cell while they cross-fade; the dialog tweens to the new height. */
  .said {
    display: grid;
    min-width: 0;
  }
  .line {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 10px;
    min-width: 0;
  }
  .glyph {
    display: flex;
    align-items: center;
    height: calc(var(--text-body) * 1.45);
  }
  .glyph.quiet {
    color: var(--ink-muted);
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sentence {
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  /* The Truncate Inside Rule: a long machine label gives way first, so the
     sentence keeps to two lines on a phone. */
  .who {
    display: inline-block;
    max-width: 55%;
    overflow: hidden;
    vertical-align: top;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .how {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
