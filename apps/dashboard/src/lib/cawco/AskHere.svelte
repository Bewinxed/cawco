<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { IconShield } from "#lib/icons.js";
  /**
   * A question standing in the page, under the control that asked it
   * (ask-here.svelte.ts; DESIGN.md, The Open Page Rule). It unfolds where it
   * was asked, takes the keyboard's focus on its Cancel, and holds nothing
   * else: the page scrolls and every other control still answers. Its
   * confirm button runs the work and stays pending until it ends; a refusal
   * stays under the question in the refuser's words, the button the way to
   * try again, and only work that went closes it. Cancel and Escape put it
   * away; once the work is sent, it can't be called back, so Cancel waits.
   *
   * `children`: what the question asks him to choose before he confirms
   * (a kind to move decisions to), drawn under its words.
   *
   * `indent` and `end`: where it starts and stops, to line up with the
   * control above; a host that sets `--ask-indent` and `--ask-end` for every
   * question inside it passes neither.
   */
  import { failureWords } from "#lib/platform/hub-read.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { cn } from "#lib/utils.js";
  import AskItems from "./AskItems.svelte";
  import type { Asker, AskHereRequest } from "./ask-here.svelte";
  import RowFault from "./RowFault.svelte";

  let {
    asker,
    at,
    class: className,
    indent = "var(--ask-indent, 0)",
    end = "var(--ask-end, 0)",
    children,
    ...rest
  }: {
    asker: Asker<AskHereRequest>;
    /** The control this place answers for: the question asked `at` it shows here. */
    at: string;
    class?: string;
    /** Its inline-start inset: a space token or a calc() of tokens. */
    indent?: string;
    /** Its inline-end inset: a space token or a calc() of tokens. */
    end?: string;
    /** A choice the question holds, under its words. */
    children?: Snippet;
    /** Data attributes for the host's styling (`data-compact`). */
    [key: `data-${string}`]: unknown;
  } = $props();

  const id = $props.id();
  const asked = $derived.by(() => {
    const { pending } = asker;
    return pending?.at === at ? pending : null;
  });
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
      bringIntoView(node);
      // Its Cancel takes the focus, ringed only when a key asked (The One
      // Ring Rule: keyboard focus only): asked by a press, the safe choice
      // never wears the ring the destructive one would read as.
      node
        .querySelector<HTMLElement>("[data-ask-cancel]")
        ?.focus({ focusVisible: lastInput.current === "key" });
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
    style:--ask-end-in={end}
    style:--ask-indent-in={indent}
    transition:unfold
    {@attach arrive}
  >
    <div
      data-slot="tile"
      class="grid grid-cols-1 gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
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
      {@render children?.()}
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
          icon={asked.grant ? IconShield : asked.icon}
          label={typeof asked.confirmLabel === "function"
            ? asked.confirmLabel()
            : asked.confirmLabel}
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
