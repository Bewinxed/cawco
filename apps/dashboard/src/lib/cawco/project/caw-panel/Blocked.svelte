<script lang="ts">
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  /**
   * When Caw can't do what you asked, the panel's centre says so (pins 4, 5,
   * 7, 8, 27): Caw in the pose that says the way on is yours, what happened
   * and why in one plain sentence (WORDS.md, the error formula, with what
   * is safe), the way out as the primary button, and Show details holding
   * the hub's own words. It stands on the thread's own surface, with no card
   * of its own (pin 27), as the house's empty state does (ui/empty).
   *
   * Where Caw stands is the open choice (pin 26), `layout`:
   * - `stack`: Caw over the words, every line centred, the buttons centred
   *   under them (Oura's "Can't load chat", Charma's error page).
   * - `edge`: Caw centred over the block, the words and buttons on one start
   *   edge under him, the block at the panel's middle.
   * - `beside`: Caw on the block's start edge, the words beside him on one
   *   edge, as a character beside his line (Rive's error page).
   *
   * Show details unfolds under the buttons (motion/fold `unfold`), the
   * hub's words in the figure face in a well, with Copy (Microsoft Loop's
   * "Technical details").
   */
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import type { DetailRow } from "./fixtures";

  let {
    layout,
    title,
    line,
    act,
    second = null,
    raw = null,
    rows = [],
    open = false,
  }: {
    layout: "stack" | "edge" | "beside";
    title: string;
    line: string;
    /** The way out, the primary. */
    act: string;
    /** A second way on. */
    second?: string | null;
    /** The hub's own words, behind Show details. */
    raw?: string | null;
    /** Or what the reason is about, a row each. */
    rows?: DetailRow[];
    /** Show details stands open. */
    open?: boolean;
  } = $props();

  let shown = $derived(open);
  const copied = $derived(
    raw ?? rows.map((row) => `${row.name}: ${row.said}`).join("\n")
  );
  const centred = $derived(layout === "stack");
  const titleId = $props.id();
</script>

<!-- mark-line: Caw stands over the words, or at the head of the block beside them -->
<section
  aria-labelledby={titleId}
  class={[
    "mx-auto grid w-full min-w-0 max-w-[60ch] gap-y-(--space-2)",
    layout === "beside"
      ? "grid-cols-[auto_minmax(0,1fr)] gap-x-(--space-4)"
      : "grid-cols-[minmax(0,1fr)]",
    centred
      ? "justify-items-center text-center"
      : "justify-items-start text-start",
  ]}
  data-blocked={layout}
>
  <span
    class={[
      "grid",
      layout === "beside"
        ? "row-span-5 self-start"
        : "mb-(--space-3) justify-self-center",
    ]}
    data-box
    data-blocked-caw><CawFace size={80} status="needs-you" /></span
  >
  <h3
    class="m-0 min-w-0 text-(--ink-strong) text-title [overflow-wrap:anywhere] [text-wrap:balance]"
    id={titleId}
  >
    {title}
  </h3>
  <p
    class="m-0 min-w-0 text-(--ink-muted) text-body [overflow-wrap:anywhere] [text-wrap:pretty]"
  >
    {line}
  </p>
  <div
    class={[
      "mt-(--space-2) flex min-w-0 flex-wrap items-center gap-(--space-2)",
      centred && "justify-center",
    ]}
  >
    <Button data-blocked-act label={act} />
    {#if second}
      <Button label={second} variant="outline" />
    {/if}
  </div>
  {#if raw || rows.length > 0}
    <div
      class={[
        "flex min-w-0 flex-col gap-(--space-2) self-stretch",
        centred ? "items-center" : "items-start",
      ]}
    >
      <Button
        aria-expanded={shown}
        class="-ms-(--space-2)"
        data-blocked-details
        onclick={() => {
          shown = !shown;
        }}
        size="sm"
        variant="ghost"
      >
        <span>{shown ? "Hide details" : "Show details"}</span>
        <IconChevronDown
          aria-hidden="true"
          class={[
            "transition-transform duration-(--dur-control) ease-(--ease-in-out)",
            shown && "rotate-180",
          ]}
          data-icon="inline-end"
        />
      </Button>
      {#if shown}
        <div
          class="relative w-full min-w-0 rounded-sm border border-(--border-well) bg-(--surface-well) py-(--space-2) ps-(--space-3) pe-(--space-8) text-start"
          data-blocked-raw
          transition:unfold
        >
          {#if raw}
            <p
              class="m-0 whitespace-pre-wrap font-mono text-(--ink-muted) text-meta [font-variant-ligatures:none] [overflow-wrap:anywhere]"
            >
              {raw}
            </p>
          {:else}
            <dl
              class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-(--space-3) gap-y-(--space-1)"
            >
              {#each rows as row (row.name)}
                <dt
                  class="min-w-0 font-mono text-(--ink-strong) text-meta [font-variant-ligatures:none] [overflow-wrap:anywhere]"
                >
                  {row.name}
                </dt>
                <dd
                  class="m-0 min-w-0 text-(--ink-muted) text-meta [overflow-wrap:anywhere]"
                >
                  {row.said}
                </dd>
              {/each}
            </dl>
          {/if}
          <CopyButton
            aria-label="Copy details"
            class="absolute end-(--space-1) top-(--space-1)"
            size="icon-xs"
            text={copied}
          />
        </div>
      {/if}
    </div>
  {/if}
</section>
