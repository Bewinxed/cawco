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

  Its pill stands in its host's flow (`flush`), as tall as it lays out,
  the card's width (`--c-composer-w`). Its caret is its focus (The Caret
  Rule): no ring is drawn round it, so the page's target keeps its line.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronDown, IconLayers } from "#lib/icons.js";
  import type { SendExtras } from "../client.svelte";
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

  /** ↑ in an empty field walks the target out a step (comment design §3). */
  function outward(event: KeyboardEvent) {
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

{#snippet lead()}
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
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{one}</span
            >
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions: the keys are the composer's field's, heard as they pass -->
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
