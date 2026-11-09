<!--
  A comment's composer and a thread's reply: the dashboard's chat composer
  (transcript/Composer.svelte), unchanged, mounted where the words go
  (commenting addendum §2, §3). At the element it leads with what the
  comment is about, the kit's setting chip (`chain`'s chosen one, its menu
  the element's chain out to the whole page, ↑ in an empty field a step
  outward); the reply has none, its thread's head naming its target. Its
  send glyph is the action, labelled "Comment" or "Reply" (`action`), on
  as soon as the draft holds words or an attachment (`hasContent`), so a
  picture alone sends. Attach is the `sm` ghost paperclip; paste and drop
  attach as in chat, every attachment uploaded by reference as it is
  attached. No `/` and no `@`.

  Where the words may be held (`onhold`), Hold stands before the send glyph,
  in words, and ⌥↩ (Alt+Enter) holds as ↩ sends: the comment waits, hollow
  and marked Unsent, until the rail's Send all sends everything held at once
  (the owner, 2026-11-05; GitHub's Add single comment beside Start a review).

  Its pill stands in its host's flow (`flush`), as tall as it lays out,
  the card's width (`--c-composer-w`). Its caret is its focus (The Caret
  Rule): no ring is drawn round it, so the page's target keeps its line.
-->
<script lang="ts">
  import { commentWords } from "@cawco/core/words/comments";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronDown, IconLayers } from "#lib/icons.js";
  import type { SendExtras } from "../send-store";
  import Composer from "../transcript/Composer.svelte";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";

  let {
    draft,
    action,
    placeholder,
    chain = [],
    chosen = 0,
    onchoose,
    sending = false,
    sendError = "",
    focus = false,
    onsubmit,
    onhold,
    onchange,
  }: {
    draft: ComposerDraft;
    /** What the send glyph does here, as its label and tooltip. */
    action: "Comment" | "Reply";
    /** The field's hint: its full words and the part that fits any field. */
    placeholder: { full: string; short: string };
    /** What the comment may stand on, innermost first, out to the whole page; none for a reply. */
    chain?: string[];
    /** Which of `chain` it stands on. */
    chosen?: number;
    onchoose?: (index: number) => void;
    /** The words are on their way to the page and the hub: the glyph is the spinner. */
    sending?: boolean;
    /** Why the last Comment or Reply didn't go, over the pill. */
    sendError?: string;
    /** Its field takes the focus as it opens, as after the press or key that opened it. */
    focus?: boolean;
    /** The words and what they carry: the draft's files, each by the hub's reference. */
    onsubmit: (text: string, extras: SendExtras) => void;
    /** The words held to send with the others, not sent at once: Hold, or ⌥↩. */
    onhold?: (text: string) => void;
    /** The draft's words or chips moved: the pane keeps them. */
    onchange?: () => void;
  } = $props();

  // The field is asked for once, as the composer opens.
  $effect(() => {
    if (focus) {
      untrack(() => {
        draft.focusWanted = true;
      });
    }
  });

  // What the person writes is the pane's to keep across a reload.
  $effect(() => {
    JSON.stringify(draft.keep);
    untrack(() => onchange?.());
  });

  /** Whether the draft can go now: words or a file, every file uploaded (the send glyph's own rule). */
  const ready = $derived(draft.hasContent && !draft.unready && !sending);

  /** ⌥↩ holds the words, as ↩ sends them. */
  function holdKey(event: KeyboardEvent) {
    if (
      onhold &&
      event.key === "Enter" &&
      event.altKey &&
      !(event.shiftKey || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (ready) {
        onhold(draft.text);
      }
    }
  }

  /** ↑ in an empty field walks the target out a step (comment design §3). */
  function outward(event: KeyboardEvent) {
    holdKey(event);
    if (event.defaultPrevented) {
      return;
    }
    if (
      event.key === "ArrowUp" &&
      !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) &&
      onchoose &&
      chain.length > 0 &&
      !draft.text.trim() &&
      chosen < chain.length - 1
    ) {
      event.preventDefault();
      event.stopPropagation();
      onchoose(chosen + 1);
    }
  }
</script>

{#snippet hold()}
  <Button
    aria-keyshortcuts="Alt+Enter"
    data-slot="hold"
    disabled={!ready}
    onclick={() => onhold?.(draft.text)}
    size="sm"
    title={commentWords.holdTitle}
    variant="ghost">{commentWords.hold}</Button
  >
{/snippet}

{#snippet lead()}
  {#if chain.length === 1}
    <!-- One target and nowhere to walk it out to (the whole page): its chip
         says what the comment is about, with no menu of one item. -->
    <span
      class={[chipVariants({ variant: "setting" }), "max-w-full"]}
      data-slot="target-chip"
      ><IconLayers /><span
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        data-slot="chip-label">{chain[0]}</span
      ></span
    >
  {:else}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            aria-label={`On ${chain[chosen]}: change what this comment is about`}
            class={[chipVariants({ variant: "setting" }), "max-w-full"]}
            data-slot="target-chip"
            type="button"
            ><IconLayers /><span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              data-slot="chip-label">{chain[chosen]}</span
            ><IconChevronDown data-slot="chevron" /></button
          >
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" side="bottom">
        <DropdownMenu.RadioGroup
          onValueChange={(next) => onchoose?.(Number(next))}
          value={String(chosen)}
        >
          {#each chain as one, at (at)}
            <DropdownMenu.RadioItem value={String(at)}>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{one}</span
              >
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
{/snippet}

<div
  class="relative w-full"
  data-slot="comment-composer"
  data-action={action}
  onkeydowncapture={outward}
>
  <Composer
    {action}
    attach
    commands={[]}
    also={onhold ? hold : undefined}
    {draft}
    flush
    lead={chain.length > 0 ? lead : undefined}
    mentionsFrom={null}
    onstop={() => undefined}
    onsubmit={(text, extras) => onsubmit(text, extras)}
    paneVisible={false}
    {placeholder}
    {sendError}
    {sending}
  />
</div>
