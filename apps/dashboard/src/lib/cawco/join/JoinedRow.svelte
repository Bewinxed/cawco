<script lang="ts">
  /**
   * The row both ways in end on: the machine joined, and whether agents can
   * use it yet. One sentence that ends in the verdict and, only when the Mac
   * needs something, one muted line saying what to do there. The row is the
   * Alert recipe's quietest form, the recess with no edge, every state alike;
   * only the glyph carries a hue. A state change cross-fades the words in place.
   */
  import type { Attachment } from "svelte/attachments";
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
    `${line.hue}|${line.glyph === "spinner" ? "spinner" : ""}|${line.rest}|${line.instruction ?? ""}`
  );

  /**
   * The Truncate Inside Rule: a long machine label gives way first, so the
   * sentence keeps to two lines on a phone. The label is cut to the longest
   * prefix that fits its share of the line with its ellipsis, so the ellipsis
   * sits against the next word with one plain space.
   */
  const LABEL_SHARE = 0.55;
  let label = $state("");
  const fitLabel: Attachment<HTMLElement> = (sentence) => {
    const full = name;
    const pen = document.createElement("canvas").getContext("2d");
    if (!pen) {
      return;
    }
    const fit = () => {
      const style = getComputedStyle(sentence);
      pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = sentence.clientWidth * LABEL_SHARE;
      if (pen.measureText(full).width <= room) {
        label = full;
        return;
      }
      let low = 1;
      let high = full.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (pen.measureText(`${full.slice(0, mid)}…`).width <= room) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      label = `${full.slice(0, low)}…`;
    };
    fit();
    // biome-ignore lint/complexity/noVoid: refit once the UI face has loaded; the first fit used whatever face was drawn
    void document.fonts.ready.then(fit);
    const watch = new ResizeObserver(fit);
    watch.observe(sentence);
    return () => watch.disconnect();
  };
</script>

<Alert.Root
  aria-live="polite"
  data-readiness={readiness.kind}
  role="status"
  variant="default"
>
  <div class="said">
    {#key said}
      <div class="line" transition:fade={{ duration: dur("--dur-fade") }}>
        <span
          class="glyph"
          class:attn={line.hue === "attn"}
          class:done={line.hue === "done"}
        >
          {#if Glyph}
            <Glyph aria-hidden="true" class="duo size-4" />
          {:else}
            <Spinner aria-hidden="true" class="size-4" role="presentation" />
          {/if}
        </span>
        <div class="words">
          <p class="sentence" {@attach fitLabel}>
            {#if label === name}
              <span class="who">{name}</span>
            {:else}
              <span class="sr-only">{name}</span>
              <span aria-hidden="true" class="who" title={name}>{label}</span>
            {/if}
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
  /* Two copies share one cell while they cross-fade; the surface tweens to the new height. */
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
  /* The glyph is the row's status signal, so both its tones hold 3:1 on the
     recess in both themes: ink-strong when no hue, and the duotone's second
     layer at the status-glyph opacity (the spinner keeps its own track). */
  .glyph {
    display: flex;
    align-items: center;
    height: calc(var(--text-body) * 1.45);
    color: var(--ink-strong);
  }
  .glyph :global(svg.duo [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }
  .glyph.done {
    color: var(--status-done-glyph);
  }
  .glyph.attn {
    color: var(--status-attn-glyph);
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
  .who {
    white-space: nowrap;
  }
  .how {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
