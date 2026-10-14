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
      failure = caught instanceof Error ? caught.message : String(caught);
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
    class={cn("ask-here", className)}
    data-ask={at}
    transition:unfold
    {@attach arrive}
  >
    <div class="tile">
      <p class="title" id="{id}-title">{asked.title}</p>
      {#each paragraphs as paragraph, index (index)}
        <p class="body">{paragraph}</p>
      {/each}
      {#if items.length > 0}
        <AskItems {items} label="What this reaches" />
      {/if}
      <RowFault reason={failure} />
      <div class="actions">
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

<style>
  /* Under its control, in the page's flow: the recess the frame is made of,
     holding the question as a raised tile, as the rows around it are. */
  .ask-here {
    min-inline-size: 0;
    padding-block: var(--space-1);
    padding-inline: var(--ask-indent, 0) var(--ask-end, 0);
  }
  .tile {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-raised);
  }
  .title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .body {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
