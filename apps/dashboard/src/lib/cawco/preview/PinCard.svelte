<script lang="ts">
  import { commentWords as said, artifactWords as words } from "@cawco/core";
  /**
   * A comment's thread, as a card beside its pin (the owner's pick; DESIGN.md,
   * A thread beside its pin). Its head's first row: the pin's pill, only
   * while the page's own pill is out of view (`marked` says it stands
   * beside it), the element's nearest parent in meta ("on Routine form";
   * none for the whole page), and at its end Resolve or Reopen, Delete
   * comment, ⋯ (Copy link; Pin it somewhere else while its element is gone)
   * and Close, each the `sm` ghost; under it what it stands on, two lines at
   * most across the card's width (a press scrolls the page to it and lights
   * its element). Then the line saying its element is gone, or that it stands resolved,
   * each with its way back; then, when its delivery reached no one or it
   * stands only on the page, "Not sent: why" with Try again (a comment goes
   * to the session by itself once written). Then the thread, the one part
   * that scrolls, opened at its newest entry's first line (the owner's pick
   * "At the reply's first line"): the
   * transcript's own turns (turn/: Turn, Well, Who), the person's words in
   * the reader's well and the agent's bare under its mark and the session's
   * name, each speaker line ending in its turn's age at rest, a later
   * entry's age at the end of its words' first line on their baseline, the
   * words wrapping as prose does (no word alone on a last line); what an entry
   * carries under its words in the transcript's gallery (a picture as the
   * 48px Shot, a text or a file as its DocThumb). At its foot, once the
   * session has it, one quiet status line in meta, "Sent to" the session's
   * chip, "· working on it" with the live dot while the session is on it;
   * never a speaker line, which would read as a reply. Then the chat
   * composer as the reply, with
   * its own Attach and the send glyph "Reply" ("Reply to reopen" once
   * resolved, and its reply reopens it), which takes the keyboard only when
   * he reaches for it, never as the thread opens.
   *
   * It closes by its Close or Esc, or a press on another row or pin, never
   * by a press on the page. Delete is asked in the card itself.
   */
  import type { CommentAttachment, Pin } from "@cawco/core/comments";
  import { type Snippet, tick, untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
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
  import { copyRefused, copyToClipboard } from "../copy";
  import MessageBody from "../MessageBody.svelte";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import SessionReference from "../SessionReference.svelte";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import DocThumb from "../transcript/DocThumb.svelte";
  import Shot from "../transcript/Shot.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import CommentComposer from "./CommentComposer.svelte";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    pin,
    name,
    parent,
    agentName,
    session = null,
    marked = false,
    link,
    live = false,
    placing = false,
    problem,
    draft,
    sending = false,
    retrying = false,
    whyNotSent = null,
    onreply,
    onretry,
    onresolve,
    ondelete,
    onplace,
    onclose,
    onfind,
    ondraft,
    changes,
    fromChip = false,
  }: {
    /**
     * Opened from its chip in a conversation (the transcript's popover): its
     * head keeps Resolve or Reopen and Close, without Delete comment and ⋯,
     * and a thread of his comment and one reply opens at his comment.
     */
    fromChip?: boolean;
    /** What changed on the page for this comment, as its change lines under the reply (ChangeLines). */
    changes?: Snippet<[Pin]>;
    pin: Pin;
    /** What it stands on, in words (core pin-name.ts). */
    name: string;
    /** Its element's nearest parent, in words; none for the whole page. */
    parent: string | null;
    /** Who answers in the thread: the session the artifact belongs to, as its transcript names it. */
    agentName: string;
    /** The session the comment goes to, by its id, named in the status line by its chip; none for a page no session owns. */
    session?: string | null;
    /** The page's own pill stands in view beside the card: the head doesn't repeat it. */
    marked?: boolean;
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
    /** Its Try again is on its way. */
    retrying?: boolean;
    /** Why it hasn't reached the session, in words, when its delivery reached no one or it stands only on the page; null while it is on its way. */
    whyNotSent?: string | null;
    onreply: (text: string, extras: SendExtras) => void;
    /** Try again: it goes to the session once more. */
    onretry: () => void;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    /** Pin it somewhere else (true), or Cancel (false). */
    onplace: (placing: boolean) => void;
    onclose: () => void;
    /** Its name pressed: the page scrolls to the pin and lights its element. */
    onfind: () => void;
    ondraft?: () => void;
  } = $props();

  let roomEl = $state<HTMLDivElement | null>(null);
  /** The thread stands where it opened and the person hasn't scrolled it: a new entry keeps it there. */
  let atPlace = true;
  /** The scroll the card last set, so its own scroll is told from the person's. */
  let placed = -1;
  /** The room at its newest entry's first line, or as near it as the room scrolls (its end, for a short one). */
  const settle = (holder: HTMLDivElement) => {
    const newest = holder.querySelector<HTMLElement>(
      '[data-slot="thread"] > li:last-child'
    );
    if (fromChip && pin.thread.length <= 2) {
      holder.scrollTop = 0;
    } else {
      holder.scrollTop = newest ? newest.offsetTop : holder.scrollHeight;
    }
    placed = holder.scrollTop;
  };
  // The thread opens at its newest entry's first line, so a long reply reads
  // from its start (the owner's pick "At the reply's first line"), and
  // follows a new one there while the person hasn't scrolled it.
  let shownPin: string | null = null;
  $effect(() => {
    const count = pin.thread.length;
    if (!(roomEl && count > 0)) {
      return;
    }
    const fresh = pin.id !== shownPin;
    shownPin = pin.id;
    if (fresh || atPlace) {
      const holder = roomEl;
      tick().then(() => {
        settle(holder);
        atPlace = true;
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
  // Unscrolled, the room stays at its newest entry's first line as its
  // entries take their height (their words are set once they have loaded,
  // after the room stands) and as the room itself takes its height (the
  // card's cap, a squeeze).
  $effect(() => {
    const holder = roomEl;
    const list = holder?.querySelector('[data-slot="thread"]');
    if (!(holder && list)) {
      return;
    }
    // biome-ignore lint/style/noRestrictedGlobals: the room keeps its place by its scroll, which resizes nothing, in the delivery, so no frame paints it short of its newest entry
    const watch = new ResizeObserver(() => {
      if (atPlace) {
        settle(holder);
      }
    });
    watch.observe(list);
    watch.observe(holder);
    return () => watch.disconnect();
  });
  const readAt = () => {
    if (roomEl) {
      atPlace = Math.abs(roomEl.scrollTop - placed) <= 1;
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
  /** What a delete takes with it, named before it runs (DESIGN.md, Voice). */
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

  /** ⋯'s actions: Copy link, and Pin it somewhere else while its element is gone. */
  const moreActions = $derived([
    { icon: IconLink, label: said.copyLink, onselect: copyLink },
    ...(pin.movedAt
      ? [
          {
            icon: IconPin,
            label: said.placeElsewhere,
            onselect: () => onplace(true),
          },
        ]
      : []),
  ]);
  /** Where the session has the comment: the status line says so; its delivery's state is the pill's. */
  const sent = $derived(markState(pin) !== "unsent");

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

  /** The browser refused the last Copy link: said over the reply, kept through a reload. */
  const linkKey = $derived(`copy:pin:${link}`);
  const linkRefused = $derived(refusals.get(linkKey) !== undefined);
  async function copyLink(): Promise<void> {
    const key = linkKey;
    if (await copyToClipboard("Link", link)) {
      refusals.delete(key);
    } else {
      refusals.set(key, { reason: copyRefused("Link") });
    }
  }
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

<!-- Its first row: the pill while the page's is out of view, the
     element's nearest parent in meta ("on Routine form"; none for the whole
     page), and the actions at its end. Under it what it stands on, two
     lines at most, across the card's whole width. -->
<header
  bind:this={head}
  data-slot="head"
  class="flex shrink-0 flex-col gap-space-1"
>
  <div
    class="flex min-w-0 items-center gap-space-2 coarse:gap-space-5 mark-line"
    data-slot="head-row"
  >
    {#if !marked}
      <span class="mark-cell" data-slot="head-pill">
        <PinMark
          gone={!!pin.movedAt}
          number={pin.number}
          state={markState(pin)}
          tail="bottom-start"
        />
      </span>
    {/if}
    {#if parent}
      <p
        data-slot="chain"
        class="m-0 min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted type-meta"
        title={`on ${parent}`}
      >
        on {parent}
      </p>
    {/if}
    <span
      class="ms-auto flex flex-none items-center gap-space-2 coarse:gap-space-5"
      data-box
    >
      {#if pin.resolvedAt}
        <Button
          aria-label={said.reopen}
          icon={IconReopen}
          onclick={() => onresolve(false)}
          size="icon-sm"
          title={said.reopen}
          variant="ghost"
        />
      {:else}
        <Button
          aria-label={said.resolve}
          icon={IconSuccess}
          onclick={() => onresolve(true)}
          size="icon-sm"
          title={said.resolve}
          variant="ghost"
        />
      {/if}
      {#if !fromChip}
        <!-- One press asks, in the card itself (DESIGN.md, A thread beside its pin). -->
        <Button
          aria-label={said.deleteComment}
          data-slot="delete"
          icon={IconTrash}
          onclick={askDelete}
          size="icon-sm"
          title={said.deleteComment}
          variant="ghost"
        />
        <span class="flex flex-none">
          <RowMenu actions={moreActions} label={`comment ${pin.number}`} />
        </span>
      {/if}
      <Button
        aria-label={said.close}
        icon={IconClose}
        onclick={onclose}
        size="icon-sm"
        title={said.close}
        variant="ghost"
      />
    </span>
  </div>
  <!-- Two lines at most, clamped in an inner span (The Truncate Inside Rule): WebKit clamps no button. -->
  <button
    data-slot="name"
    class="min-w-0 px-0 border-none bg-transparent text-start text-ink-strong type-label rounded-xs hover:text-ink-row focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
    onclick={onfind}
    title={name}
    type="button"
    ><span class="line-clamp-2 text-pretty wrap-anywhere">{name}</span></button
  >
</header>
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
{#if whyNotSent && markState(pin) === "unsent"}
  <!-- Its delivery reached no one, or it stands only on the page: why, with Try again. -->
  <div
    data-slot="not-sent"
    data-not-sent=""
    class="flex shrink-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
  >
    <p
      class="m-0 min-w-0 text-pretty wrap-anywhere text-status-fail-ink"
      role="status"
    >
      {said.notSent(whyNotSent)}
    </p>
    <Button
      aria-label={said.retryComment(pin.number)}
      data-slot="pin-retry"
      label={said.tryAgain}
      onclick={onretry}
      pad="none"
      pending={retrying}
      size="sm"
      variant="link"
    />
  </div>
{/if}
<!-- A later entry of one speaker's run: its words, and its age at the end
     of their first line, on its baseline (a row's meta on its words' line,
     The Row Dress Rule), the words wrapping in their own column as prose
     does. -->
{#snippet later(text: string, at: string, who: string, you: boolean)}
  <div class="flex items-baseline" data-slot="later">
    <div class="min-w-0 flex-1">
      {#if text.trim()}
        <MessageBody source={text} wrap="pretty" />
      {/if}
    </div>
    <Who grouped name={who} shown timestamp={at} {you} />
  </div>
{/snippet}
<!-- What the comment holds, the one part that scrolls: the head stands over
     it and the reply under it, never a scroll away; the house edge fade says
     there is more above or below. -->
<div
  class="kit-edge-fade-block relative flex flex-auto flex-col min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain data-whole:shrink-0"
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
                <MessageBody source={entry.text} wrap="pretty" />
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
              <MessageBody source={entry.text} wrap="pretty" />
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
  {#if changes}
    <div class="mt-space-2" data-slot="pin-changes">{@render changes(pin)}</div>
  {/if}
</div>
<div
  bind:this={foot}
  data-slot="foot"
  class="flex shrink-0 flex-col gap-space-2"
>
  {#if sent && session}
    <!-- Who has the comment, as its status, never as a reply: "Sent to" the
         session's chip, and while the session is on it "· working on it"
         with the live dot (core `words/comments.ts`). -->
    <p
      data-slot="sent-to"
      class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-1 gap-y-0 text-ink-muted type-meta"
    >
      <span>{said.sentTo}</span>
      <SessionReference id={session} />
      {#if live}
        <span
          class="inline-flex items-center gap-space-1 mark-line"
          data-slot="working"
          ><span aria-hidden="true">·</span><span
            class="grid place-items-center"
            data-box><LiveDot /></span
          ><span>{said.workingOnIt}</span></span
        >
      {/if}
    </p>
  {/if}
  <!-- A Copy link the browser refused, over the reply, with Try again and
       the link under Show details: the menu that asked has closed. -->
  <RowFault
    again={copyLink}
    data-copy-refused
    details={link}
    end="var(--space-3)"
    indent="var(--space-3)"
    reason={linkRefused ? copyRefused("Link") : null}
  />
  <!-- The reply takes the keyboard only when he reaches for it (a tap or a
       click in the field, Tab): a thread opens to be read, and a phone's
       keyboard rising with it covered most of what it says. Its caret is its
       focus (The Caret Rule). -->
  <CommentComposer
    action="Reply"
    {draft}
    onchange={ondraft}
    onsubmit={onreply}
    {placeholder}
    sendError={problem ?? ""}
    {sending}
  />
  <AskHere asker={asks} at="delete" />
</div>
