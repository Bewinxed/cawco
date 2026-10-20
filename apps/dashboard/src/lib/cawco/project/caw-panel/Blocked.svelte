<script lang="ts">
  /**
   * When Caw can't do what the thread is for (advisor report §2, "Blocking
   * takes the centre"): one block at the thread body's vertical middle, on
   * the panel's own surface with no card of its own. Caw at 56 in the
   * block's lead column, in the pose that says the way on is yours; the
   * words on the text column, never centred: what happened, then what is
   * safe; one row of acts, the way out as the primary, a way round as a
   * quiet button, and Show details, which unfolds the hub's own words under
   * the row in a well with Copy.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import type { Block } from "./fixtures";

  let {
    block,
    open = false,
  }: {
    block: Block;
    /** Show details stands open. */
    open?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let shown = $state(open);
  const copied = $derived(
    block.raw ?? block.rows.map((row) => `${row.name}: ${row.said}`).join("\n")
  );
  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="grid min-inline-0 grid-cols-auto-fluid items-start gap-x-space-3 gap-y-space-3"
  data-blocked
>
  <span class="grid" data-blocked-caw
    ><CawFace size={56} status="needs-you" /></span
  >
  <div class="flex min-inline-0 flex-col gap-space-1 pbs-space-2">
    <h3
      class="m-0 min-inline-0 text-ink-strong text-label wrap-anywhere text-pretty"
      id={titleId}
    >
      {block.title}
    </h3>
    {#if block.line}
      <p
        class="m-0 min-inline-0 text-ink-muted text-body wrap-anywhere text-pretty"
      >
        {block.line}
      </p>
    {/if}
    <div
      class="mbs-space-2 flex min-inline-0 flex-wrap items-center gap-space-2"
    >
      <Button data-blocked-act label={block.act} size="sm" />
      {#if block.second}
        <Button label={block.second} size="sm" variant="ghost" />
      {/if}
      <Button
        aria-expanded={shown}
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
            "motion-safe:transition-transform motion-safe:duration-(--dur-control) motion-safe:ease-in-out",
            shown && "rotate-180",
          ]}
          data-icon="inline-end"
        />
      </Button>
    </div>
  </div>
  {#if shown}
    <div
      class="relative col-span-full min-inline-0 rounded-sm border border-border-well bg-surface-well py-space-2 ps-space-3 pe-space-8"
      data-blocked-raw
      transition:unfold
    >
      {#if block.raw}
        <p
          class="m-0 whitespace-pre-wrap font-mono-meta liga-none text-ink-muted wrap-anywhere"
        >
          {block.raw}
        </p>
      {:else}
        <dl class="m-0 grid grid-cols-auto-fluid gap-x-space-3 gap-y-space-1">
          {#each block.rows as row (row.name)}
            <dt
              class="min-inline-0 font-mono-meta liga-none text-ink-strong wrap-anywhere"
            >
              {row.name}
            </dt>
            <dd class="m-0 min-inline-0 text-ink-muted text-meta wrap-anywhere">
              {row.said}
            </dd>
          {/each}
        </dl>
      {/if}
      <CopyButton
        aria-label="Copy details"
        class="absolute inset-e-space-1 inset-bs-space-1"
        size="icon-xs"
        text={copied}
      />
    </div>
  {/if}
</section>
