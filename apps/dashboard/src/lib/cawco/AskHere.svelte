<script lang="ts">
  /**
   * A question standing in the page, under the control that asked it
   * (ask-here.svelte.ts; DESIGN.md, The Open Page Rule). It unfolds where it
   * was asked, takes the keyboard's focus on its Cancel, and holds nothing
   * else: the page scrolls and every other control still answers. Its
   * confirm button runs the work and stays pending until it ends; a refusal
   * stays under the question in the refuser's words, the button the way to
   * try again, and only work that went closes it. Cancel and Escape put it
   * away; once the work is sent, it can't be called back, so Cancel waits.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconShield } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import AskItems from "./AskItems.svelte";
  import type { Asker, AskHereRequest } from "./ask-here.svelte";
  import { unfold } from "./motion/fold.svelte";
  import RowFault from "./RowFault.svelte";

  let {
    asker,
    at,
    class: className,
    ...rest
  }: {
    asker: Asker<AskHereRequest>;
    /** The control this place answers for: the question asked `at` it shows here. */
    at: string;
    class?: string;
    /** Data attributes for the host's styling (`data-compact`). */
    [key: `data-${string}`]: unknown;
  } = $props();

  const id = $props.id();
  const asked = $derived(
    asker.pending?.at === at ? (asker.pending as AskHereRequest) : null
  );
  const paragraphs = $derived(
    typeof asked?.body === "string" ? [asked.body] : (asked?.body ?? [])
  );
  const items = $derived(asked?.items?.() ?? []);
  const variant = $derived.by(() => {
    if (asked?.grant) {
      return "grant";
    }
    return asked?.destructive ? "destructive" : "default";
  });
  let running = $state(false);
  /** Why the last run was refused (the question stays), or null. */
  let failure = $state<string | null>(null);

  // A new question starts clean.
  $effect.pre(() => {
    if (asked) {
      failure = null;
    }
  });

  async function accept() {
    running = true;
    failure = null;
    try {
      await asker.accept();
    } catch (caught) {
      failure = failureWords(caught);
    } finally {
      running = false;
    }
  }

  /**
   * In view and in hand as it opens: a menu that asked hands focus back to
   * its trigger as it closes, so the focus moves here a frame later. Escape
   * inside it puts it away, and goes no further (a popover it stands in
   * stays open).
   */
  function arrive(node: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest" });
      node.querySelector<HTMLElement>("[data-ask-cancel]")?.focus();
    });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) {
        event.stopPropagation();
        asker.dismiss();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", onEscape);
    };
  }
</script>

{#if asked}
  <section
    {...rest}
    aria-labelledby="{id}-title"
    class={cn(
      "min-w-0 py-space-1 ps-(--ask-indent-in) pe-(--ask-end-in)",
      className
    )}
    data-ask={at}
    style:--ask-end-in="var(--ask-end, 0)"
    style:--ask-indent-in="var(--ask-indent, 0)"
    transition:unfold
    {@attach arrive}
  >
    <!-- literal: minmax(0, 1fr) -->
    <div
      data-slot="tile"
      class="grid grid-cols-(--tile-cols) gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
      style:--tile-cols="minmax(0, 1fr)"
    >
      <p
        data-slot="title"
        class="m-0 type-label text-balance wrap-anywhere text-ink-strong"
        id="{id}-title"
      >
        {asked.title}
      </p>
      {#each paragraphs as paragraph, index (index)}
        <p
          data-slot="body"
          class="m-0 type-meta text-pretty wrap-anywhere text-ink-muted"
        >
          {paragraph}
        </p>
      {/each}
      {#if items.length > 0}
        <AskItems {items} label="What this reaches" />
      {/if}
      <RowFault reason={failure} />
      <div data-slot="actions" class="flex flex-wrap justify-end gap-space-2">
        <Button
          data-ask-cancel
          disabled={running}
          label={asked.cancelLabel ?? "Cancel"}
          onclick={() => asker.dismiss()}
          size="sm"
          variant="ghost"
        />
        <Button
          failed={failure !== null}
          icon={asked.grant ? IconShield : undefined}
          label={asked.confirmLabel}
          onclick={accept}
          pending={running}
          pendingLabel={asked.pendingLabel}
          size="sm"
          {variant}
        />
      </div>
    </div>
  </section>
{/if}
