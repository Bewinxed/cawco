<script lang="ts">
  /**
   * A comment's thread as the card draws it (PinCard's face): every fact
   * it shows arrives as a prop, and what it holds of the app (the
   * session's chip, the reply composer, a refusal's line and the card's
   * question) arrives as a snippet, so a canvas draws the real card without
   * the app's stores. PinCard is the card in the app: its data, its copy
   * link, its delete question and its composer, handed in here.
   *
   * Its head's first row: the pin's pill, only while the page's own pill is
   * out of view (`marked` says it stands beside it), the element's nearest
   * parent in meta ("on Routine form"; none for the whole page), and at its
   * end Resolve or Reopen, Delete comment, ⋯ and Close, each the `sm` ghost;
   * under it what it stands on, two lines at most across the card's width
   * (a press scrolls the page to it and lights its element). Then the line
   * saying its element is gone, or that it stands resolved, each with its
   * way back; then, when its delivery reached no one or it stands only on
   * the page, "Not sent: why" with Try again. Then the thread, the one part
   * that scrolls, opened at its newest entry's first line (the owner's pick
   * "At the reply's first line"): the transcript's own turns (turn/: Turn,
   * Well, Who), each speaker line ending in its turn's age at rest, a later
   * entry's age at the end of its words' first line on their baseline; what
   * an entry carries under its words in the transcript's gallery (a picture
   * as the 48px Shot, a text or a file as its DocThumb). At its foot, once
   * the session has it, one quiet status line in meta, "Sent to" the
   * session's chip, "· working on it" with the live dot while the session
   * is on it; never a speaker line, which would read as a reply. Then the
   * reply.
   */
  import type { CommentAttachment, Pin } from "@cawco/core/comments";
  import { artifactWords as words } from "@cawco/core/words/artifacts";
  import { commentWords as said } from "@cawco/core/words/comments";
  import { type Snippet, tick } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconClose, IconReopen, IconSuccess, IconTrash } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import type { RowAction } from "../config/RowMenu.svelte";
  import RowMenu from "../config/RowMenu.svelte";
  import MessageBody from "../MessageBody.svelte";
  import DocThumb from "../transcript/DocThumb.svelte";
  import Shot from "../transcript/Shot.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import PinMark, { markState } from "./PinMark.svelte";
  import { cutOnWords } from "./thread-cut";

  let {
    pin,
    name,
    parent,
    agentName,
    marked = false,
    live = false,
    placing = false,
    retrying = false,
    whyNotSent = null,
    texts = {},
    more,
    onresolve,
    onaskdelete,
    onplace,
    onclose,
    onfind,
    onretry,
    session,
    reply,
  }: {
    pin: Pin;
    /** What it stands on, in words (core pin-name.ts). */
    name: string;
    /** Its element's nearest parent, in words; none for the whole page. */
    parent: string | null;
    /** Who answers in the thread: the session the artifact belongs to, as its transcript names it. */
    agentName: string;
    /** The page's own pill stands in view beside the card: the head doesn't repeat it. */
    marked?: boolean;
    /** The agent is working on this pin. */
    live?: boolean;
    /** Its element gone, the next tap on the page pins it anew. */
    placing?: boolean;
    /** Its Try again is on its way. */
    retrying?: boolean;
    /** Why it hasn't reached the session, in words, when its delivery reached no one or it stands only on the page; null while it is on its way. */
    whyNotSent?: string | null;
    /** A text an entry carries, its words as read, by its ref. */
    texts?: Record<string, string>;
    /** ⋯'s actions. */
    more: RowAction[];
    onresolve: (resolved: boolean) => void;
    /** Delete comment pressed: the card asks (PinCard's question, in `reply`). */
    onaskdelete: () => void;
    /** Pin it somewhere else (true), or Cancel (false). */
    onplace: (placing: boolean) => void;
    onclose: () => void;
    /** Its name pressed: the page scrolls to the pin and lights its element. */
    onfind: () => void;
    /** Try again: it goes to the session once more. */
    onretry: () => void;
    /** The session the comment went to, as its chip; none for a page no session owns. */
    session?: Snippet;
    /** The foot under the status line: the reply, and whatever stands over or under it. */
    reply?: Snippet;
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
    holder.scrollTop = newest ? newest.offsetTop : holder.scrollHeight;
    placed = holder.scrollTop;
    cutOnWords(holder);
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
  // card's cap, a squeeze); scrolled or not, its foot is cut on a line of
  // its words again (thread-cut.ts), which moves nothing it watches.
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
      } else {
        cutOnWords(holder);
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
  /** Where the session has the comment: the status line says so; its delivery's state is the pill's. */
  const sent = $derived(markState(pin) !== "unsent");
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
          focused
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
      <!-- One press asks, in the card itself (DESIGN.md, A thread beside its pin). -->
      <Button
        aria-label={said.deleteComment}
        data-slot="delete"
        icon={IconTrash}
        onclick={onaskdelete}
        size="icon-sm"
        title={said.deleteComment}
        variant="ghost"
      />
      <span class="flex flex-none">
        <RowMenu actions={more} label={`comment ${pin.number}`} />
      </span>
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
     there is more above or below, its foot cut on a line of the words
     (thread-cut.ts), its spacer as tall as the cut so the last words scroll
     clear of it. -->
<div
  class="kit-edge-fade-block relative flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain data-whole:shrink-0 after:h-(--fade-inset-end) after:shrink-0"
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
</div>
<div
  bind:this={foot}
  data-slot="foot"
  class="flex shrink-0 flex-col gap-space-2"
>
  {#if sent && session}
    <!-- Who has the comment, as its status, never as a reply: "Sent to" the
         session's chip, and while the session is on it "· working on it"
         with the live dot (WORDS.md, The comments' words). -->
    <p
      data-slot="sent-to"
      class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-1 gap-y-0 text-ink-muted type-meta"
    >
      <span>{said.sentTo}</span>
      {@render session()}
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
  {@render reply?.()}
</div>
