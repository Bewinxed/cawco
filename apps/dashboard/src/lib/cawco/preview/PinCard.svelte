<script lang="ts" module>
  import type { Component } from "svelte";

  /**
   * The thread's words as the transcript sets them (MessageBody and its
   * markdown), loaded the first time a thread opens (an artifact's own tab
   * never draws one before then) and held for every thread after it, so a
   * thread opened again draws its entries in its first frame.
   */
  let loadedBody: Component<{
    source: string;
    wrap?: "stable" | "pretty";
  }> | null = null;
</script>

<script lang="ts">
  import { artifactWords as words } from "@cawco/core";
  /**
   * A comment's thread, as a card beside its pin (the owner's pick; DESIGN.md,
   * A thread beside its pin). Its head: the pin's pill, what it stands on
   * (a press scrolls the page to it and lights its element), Resolve or
   * Reopen, ⋯ (Copy link; Pin it somewhere else while its element is gone;
   * Delete comment) and Close, each the `sm` ghost. Under it, in meta, the
   * element's nearest parent ("on Routine form"; none for the whole page);
   * then the line saying its element is gone, or that it stands resolved,
   * each with its way back. Then the thread, the one part that scrolls: the
   * transcript's own turns (turn/: Turn, Well, Who), the person's words in
   * the reader's well and the agent's bare under its mark and the session's
   * name, each speaker line ending in its turn's age at rest, a later
   * entry's age at the end of its words' first line on their baseline, the
   * words wrapping as prose does (no word alone on a last line); what an entry
   * carries under its words in the transcript's gallery (a picture as the
   * 48px Shot, a text or a file as its DocThumb); "Working on it…" while
   * the agent works on it. At its foot the chat composer as the reply, with
   * its own Attach and the send glyph "Reply" ("Reply to reopen" once
   * resolved, and its reply reopens it).
   *
   * It closes by its Close or Esc, or a press on another row or pin, never
   * by a press on the page. Delete is asked in the card itself.
   */
  import type { CommentAttachment, Pin } from "@cawco/core/comments";
  import { tick, untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconClose,
    IconLink,
    IconPin,
    IconReopen,
    IconSuccess,
    IconTrash,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import type { SendExtras } from "../client.svelte";
  import RowMenu from "../config/RowMenu.svelte";
  import { copyToClipboard } from "../copy";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import DocThumb from "../transcript/DocThumb.svelte";
  import Shot from "../transcript/Shot.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import CommentComposer from "./CommentComposer.svelte";
  import { commentWords as said } from "./comment-words";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    pin,
    name,
    parent,
    agentName,
    link,
    live = false,
    placing = false,
    problem,
    draft,
    sending = false,
    onreply,
    onresolve,
    ondelete,
    onplace,
    onclose,
    onfind,
    onring,
    ondraft,
  }: {
    pin: Pin;
    /** What it stands on, in words (core pin-name.ts). */
    name: string;
    /** Its element's nearest parent, in words; none for the whole page. */
    parent: string | null;
    /** Who answers in the thread: the session the artifact belongs to, as its transcript names it. */
    agentName: string;
    /** The pin's own address: its artifact's page, opening this thread. */
    link: string;
    /** The agent is working on this pin. */
    live?: boolean;
    /** Its element gone, the next tap on the page pins it anew. */
    placing?: boolean;
    /** What went wrong with the last reply, resolve or delete, in the error formula. */
    problem: string | null;
    /** The reply being written: the pin's, kept by the pane. */
    draft: ComposerDraft;
    /** The reply is on its way: the glyph is the spinner. */
    sending?: boolean;
    onreply: (text: string, extras: SendExtras) => void;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    /** Pin it somewhere else (true), or Cancel (false). */
    onplace: (placing: boolean) => void;
    onclose: () => void;
    /** Its name pressed: the page scrolls to the pin and lights its element. */
    onfind: () => void;
    onring?: (shown: boolean) => void;
    ondraft?: () => void;
  } = $props();

  /** The thread's words' component ({@link loadedBody}): at hand from the second thread on. */
  let Body = $state<typeof loadedBody>(loadedBody);
  $effect(() => {
    if (!Body) {
      import("../MessageBody.svelte").then((loaded) => {
        loadedBody = loaded.default;
        Body = loaded.default;
      });
    }
  });

  let roomEl = $state<HTMLDivElement | null>(null);
  /** The thread is read at its end: a new entry keeps it there. */
  let atEnd = true;
  // The thread opens at its newest entry, beside the field that answers it,
  // and follows a new one while the person reads at its end.
  let shownPin: string | null = null;
  $effect(() => {
    const count = pin.thread.length;
    if (!(roomEl && count > 0)) {
      return;
    }
    const fresh = pin.id !== shownPin;
    shownPin = pin.id;
    if (fresh || atEnd) {
      const holder = roomEl;
      tick().then(() => {
        holder.scrollTop = holder.scrollHeight;
        atEnd = true;
      });
    }
  });
  let head = $state<HTMLElement | null>(null);
  let foot = $state<HTMLDivElement | null>(null);
  /** The head and the foot alone outgrow the card (a phone's keyboard over a short well). */
  let squeezed = $state(false);
  // When the head and the foot alone outgrow the card, the thread keeps its
  // whole height and the card scrolls, the field kept in view while
  // writing: the thread stays readable above the field instead of shrinking
  // to nothing. Measured in the observer's callback and written in the next
  // frame's (a ResizeObserver loop otherwise: the card scrolling, or no
  // longer, takes a scrollbar's width from the parts watched here).
  $effect(() => {
    const top = head;
    const bottom = foot;
    const holder = top?.parentElement;
    if (!(top && bottom && holder)) {
      return;
    }
    let measured = false;
    const measure = () => {
      const style = getComputedStyle(holder);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const edges =
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0);
      measured =
        top.offsetHeight + bottom.offsetHeight + 2 * gap + edges >
        holder.clientHeight + 1;
    };
    const watch = frameObserver(
      () => {
        squeezed = measured;
      },
      { read: measure }
    );
    for (const part of [holder, top, bottom]) {
      watch.observe(part);
    }
    return () => watch.disconnect();
  });
  // Read at its end, the room stays there as its entries take their height
  // (their words are set once they have loaded, after the room stands) and
  // as the room itself takes its height (the card's cap, a squeeze).
  $effect(() => {
    const holder = roomEl;
    const list = holder?.querySelector('[data-slot="thread"]');
    if (!(holder && list)) {
      return;
    }
    // biome-ignore lint/style/noRestrictedGlobals: the room keeps its end by its scroll, which resizes nothing, in the delivery, so no frame paints it short of its newest entry
    const watch = new ResizeObserver(() => {
      if (atEnd) {
        holder.scrollTop = holder.scrollHeight;
      }
    });
    watch.observe(list);
    watch.observe(holder);
    return () => watch.disconnect();
  });
  const readAt = () => {
    if (roomEl) {
      atEnd = roomEl.scrollTop + roomEl.clientHeight >= roomEl.scrollHeight - 1;
    }
  };

  /** A text an entry carries, its words read from the hub once, for the lightbox. */
  let texts = $state<Record<string, string>>({});
  $effect(() => {
    for (const entry of pin.thread) {
      for (const one of entry.attachments ?? []) {
        if (one.kind === "text" && !(one.ref in texts)) {
          texts[one.ref] = "";
          fetch(one.ref)
            .then((response) => (response.ok ? response.text() : ""))
            .then((read) => {
              texts[one.ref] = read;
            })
            .catch(() => undefined);
        }
      }
    }
  });

  /** The card's one question: Delete, asked under its foot. */
  const asks = new Asker<AskHereRequest>();
  /** What a delete takes with it, named before it runs (WORDS.md, destructive confirm). */
  const deleteBody = $derived.by(() => {
    const parts = [
      "its thread",
      pin.ink ? "the ink it stands on" : null,
    ].filter(Boolean);
    return `It goes from the page with ${parts.join(" and ")}. The other comments keep their numbers. This can't be undone.`;
  });
  function askDelete() {
    asks.ask({
      at: "delete",
      title: said.deleteTitle(pin.number),
      body: deleteBody,
      confirmLabel: said.deleteComment,
      destructive: true,
      pendingLabel: said.deleting,
      run: ondelete,
    });
  }
  // Another pin in the same card: a question asked of the last one goes.
  let asked: string | null = null;
  $effect.pre(() => {
    const { id } = pin;
    if (asked !== null && id !== asked) {
      untrack(() => asks.dismiss());
    }
    asked = id;
  });

  const placeholder = $derived(
    pin.resolvedAt ? said.reopenHint : said.replyHint
  );
  const resolvedAge = $derived(
    pin.resolvedAt ? formatAgeShort(Date.parse(pin.resolvedAt)) : ""
  );

  /** What one entry carries, as the transcript's gallery draws it. */
  const pictures = (attachments: CommentAttachment[] | undefined) =>
    (attachments ?? []).filter((one) => one.kind === "image");
  const documents = (attachments: CommentAttachment[] | undefined) =>
    (attachments ?? []).filter((one) => one.kind !== "image");
</script>

{#snippet gallery(attachments: CommentAttachment[] | undefined)}
  {#if attachments?.length}
    <div
      class="flex flex-wrap items-center gap-space-2 mt-space-2"
      data-gallery
      data-slot="chips"
    >
      {#each documents(attachments) as one (one.ref)}
        {#if one.kind === "text" && texts[one.ref]}
          <DocThumb content={texts[one.ref]} name={one.name} />
        {:else}
          <DocThumb href={one.ref} name={one.name} size={one.size} />
        {/if}
      {/each}
      {#each pictures(attachments) as one (one.ref)}
        <Shot
          alt={`${one.name}, attached to comment ${pin.number}`}
          size="thumb"
          src={one.ref}
        />
      {/each}
    </div>
  {/if}
{/snippet}

<header
  bind:this={head}
  data-slot="head"
  class="flex shrink-0 items-center gap-space-2 coarse:gap-space-5 mark-line"
>
  <span class="mark-cell">
    <PinMark
      focused
      gone={!!pin.movedAt}
      number={pin.number}
      state={markState(pin)}
      tail="bottom-start"
    />
  </span>
  <button
    data-slot="name"
    class="flex-1 min-w-0 px-0 border-none bg-transparent text-start text-ink-strong type-label overflow-clip text-ellipsis whitespace-nowrap rounded-xs hover:text-ink-row focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
    onclick={onfind}
    title={name}
    type="button">{name}</button
  >
  {#if pin.resolvedAt}
    <Button
      data-box
      aria-label={said.reopen}
      icon={IconReopen}
      onclick={() => onresolve(false)}
      size="icon-sm"
      title={said.reopen}
      variant="ghost"
    />
  {:else}
    <Button
      data-box
      aria-label={said.resolve}
      icon={IconSuccess}
      onclick={() => onresolve(true)}
      size="icon-sm"
      title={said.resolve}
      variant="ghost"
    />
  {/if}
  <span class="flex flex-none" data-box>
    <RowMenu
      actions={[
        {
          icon: IconLink,
          label: said.copyLink,
          onselect: () => {
            copyToClipboard("Link", link);
          },
        },
        ...(pin.movedAt
          ? [
              {
                icon: IconPin,
                label: said.placeElsewhere,
                onselect: () => onplace(true),
              },
            ]
          : []),
        {
          destructive: true,
          icon: IconTrash,
          label: said.deleteComment,
          onselect: askDelete,
        },
      ]}
      label={`comment ${pin.number}`}
    />
  </span>
  <Button
    data-box
    aria-label={said.close}
    icon={IconClose}
    onclick={onclose}
    size="icon-sm"
    title={said.close}
    variant="ghost"
  />
</header>
{#if parent}
  <p
    data-slot="chain"
    class="m-0 -mt-space-1 shrink-0 truncate text-ink-muted type-meta"
    title={`on ${parent}`}
  >
    on {parent}
  </p>
{/if}
{#if pin.movedAt}
  <!-- Its element is gone: said once, and pinned anew with the next tap on the page. -->
  <div
    data-slot="gone"
    class="flex shrink-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
  >
    <p class="m-0 min-w-0 text-ink-muted" role="status">
      {placing ? said.placeHere : words.pinElementGone}
    </p>
    <Button
      label={placing ? "Cancel" : said.placeElsewhere}
      onclick={() => onplace(!placing)}
      pad="none"
      size="sm"
      variant="link"
    />
  </div>
{:else if pin.resolvedAt}
  <div
    data-slot="resolved"
    class="flex shrink-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
  >
    <p class="m-0 min-w-0 text-ink-muted num" role="status">
      {said.resolvedAgo(resolvedAge)}
    </p>
    <Button
      label={said.reopen}
      onclick={() => onresolve(false)}
      pad="none"
      size="sm"
      variant="link"
    />
  </div>
{/if}
<!-- What the comment holds, the one part that scrolls: the head stands over
     it and the reply under it, never a scroll away; the house edge fade says
     there is more above or below. -->
{#if Body}
  {@const Words = Body}
  <!-- A later entry of one speaker's run: its words, and its age at the end
       of their first line, on its baseline (a row's meta on its words' line,
       The Row Dress Rule), the words wrapping in their own column as prose
       does. -->
  {#snippet later(text: string, at: string, who: string, you: boolean)}
    <div class="flex items-baseline" data-slot="later">
      <div class="min-w-0 flex-1">
        {#if text.trim()}
          <Words source={text} wrap="pretty" />
        {/if}
      </div>
      <Who grouped name={who} shown timestamp={at} {you} />
    </div>
  {/snippet}
  <div
    class="kit-edge-fade-block relative flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain data-whole:shrink-0"
    data-whole={squeezed || undefined}
    data-pin-room
    onscroll={readAt}
    bind:this={roomEl}
  >
    <!-- The transcript's turns: a run of one speaker's entries is one turn
         (its later entries under the first's speaker line), the person's
         run one well. -->
    <ol data-slot="thread" class="m-0 p-0 list-none">
      {#each pin.thread as entry, i (entry.id)}
        {@const grouped = pin.thread[i - 1]?.by === entry.by}
        <li data-slot="entry" class="group/entry" data-by={entry.by}>
          {#if entry.by === "person"}
            {@const runsOn = pin.thread[i + 1]?.by === "person"}
            <Turn class="group-first/entry:mt-0" {grouped} {runsOn} you>
              {#if !grouped}
                <Who name="You" shown timestamp={entry.at} you />
              {/if}
              <Well {grouped} {runsOn}>
                {#if grouped}
                  {@render later(entry.text, entry.at, "You", true)}
                {:else if entry.text.trim()}
                  <Words source={entry.text} wrap="pretty" />
                {/if}
                {@render gallery(entry.attachments)}
              </Well>
            </Turn>
          {:else}
            <Turn class="group-first/entry:mt-0" {grouped}>
              {#if grouped}
                {@render later(entry.text, entry.at, agentName, false)}
              {:else}
                <Who name={agentName} shown timestamp={entry.at} />
                <Words source={entry.text} wrap="pretty" />
              {/if}
              {#if entry.files?.length}
                <p class="flex flex-wrap gap-space-1 mt-space-1 mx-0 mb-0">
                  {#each entry.files as file (file)}
                    <code
                      class="min-w-0 wrap-anywhere px-space-1 py-0 rounded-xs bg-code-bg type-code"
                      >{file}</code
                    >
                  {/each}
                </p>
              {/if}
            </Turn>
          {/if}
        </li>
      {/each}
    </ol>
    {#if live}
      <!-- The agent's turn on this comment runs: its thinking state, swapped for the reply when it lands. -->
      <p
        data-slot="working"
        class="m-0 mt-space-2 text-ink-muted type-meta motion-safe:animate-pulse loops"
        role="status"
      >
        {said.working}
      </p>
    {/if}
  </div>
{/if}
<div
  bind:this={foot}
  data-slot="foot"
  class="flex shrink-0 flex-col gap-space-2"
>
  <!-- The reply takes the keyboard as the thread opens: ringed when a key opened it, quiet after a press (The One Target Rule). -->
  <CommentComposer
    action="Reply"
    {draft}
    focus
    onchange={ondraft}
    {onring}
    onsubmit={onreply}
    {placeholder}
    sendError={problem ?? ""}
    {sending}
  />
  <AskHere asker={asks} at="delete" />
</div>
