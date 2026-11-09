<script lang="ts">
  /**
   * A comment's thread, as a card beside its pin (the owner's pick; the artifact panel's surface brief,
   * A thread beside its pin). It has no head band (The Title Bars Follow
   * Liquid Glass Rule): its bar is one row of floating groups, Back leading
   * where it opened from the Comments list, and trailing Resolve or Reopen,
   * Delete comment and Copy link (More instead, while Pin it somewhere else
   * joins it) as one glass group, and Close in a group of its own. Under the
   * bar its title, the card's whole width and standing put while the thread
   * scrolls (the owner's pick: "Its title and the reply box stay put while
   * a long reply scrolls between them"): the pin's pill, only while the
   * page's own pill is out of view (`marked` says it stands beside it),
   * what it stands on, two lines at most (a press scrolls the page to it
   * and lights its element), and the element's nearest parent in meta ("on
   * Routine form") where it names something the name doesn't. Delete's
   * question unfolds under it, where Delete was pressed.
   * Then the line saying its element is gone, or that it stands resolved,
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
   * by a press on the page. Delete is asked in the card itself, under its bar.
   *
   * As a pin's peek (`peek`: a mouse resting on its pill), the same card
   * holds what it stands on, his words and only the latest reply: no
   * actions, no status lines, no change lines and no reply, since a press
   * anywhere on it opens the whole thread (PinFloat `onpress`).
   */
  import type { CommentAttachment, Pin } from "@cawco/core/comments/model";
  import { referenceHref } from "@cawco/core/references";
  import { artifactWords as words } from "@cawco/core/words/artifacts";
  import { commentWords as said } from "@cawco/core/words/comments";
  import { commonWords } from "@cawco/core/words/common";
  import { type Snippet, tick, untrack } from "svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconChevronLeft,
    IconClose,
    IconLink,
    IconLinkLinear,
    IconMoreLinear,
    IconPin,
    IconPinLinear,
    IconReopenLinear,
    IconSuccessLinear,
    IconTrashLinear,
  } from "#lib/icons.js";
  import { copyRefused, copyToClipboard } from "#lib/platform/copy.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { markdownFleetHere, plainReferenceOf } from "../markdown-fleet";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import { keysChecked } from "../repeated-keys";
  import type { SendExtras } from "../stores/commands.svelte";
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
    onhold,
    onretry,
    onresolve,
    ondelete,
    onplace,
    onclose,
    back,
    sheet = false,
    onfind,
    ondraft,
    changes,
    fromChip = false,
    peek = false,
  }: {
    /** A pin's peek: what it stands on, his words and the latest reply alone, taking no press of its own. */
    peek?: boolean;
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
    /** The reply held to send with the others (core `ThreadEntry.held`). */
    onhold?: (text: string) => void;
    /** Try again: it goes to the session once more. */
    onretry: () => void;
    onresolve: (resolved: boolean) => void;
    /** Deletes the pin once the person confirmed; rejects with the refusal's sentence. */
    ondelete: () => Promise<void>;
    /** Pin it somewhere else (true), or Cancel (false). */
    onplace: (placing: boolean) => void;
    onclose: () => void;
    /**
     * Opened from the Comments list in the same sheet (a phone's, a narrow
     * pane's): Back leads, going to `to` (the list's name).
     */
    back?: { to: string; onback: () => void };
    /**
     * It stands in a phone's sheet (ThreadSheet): Close leads its bar, as it
     * leads every view of a sheet (the owner's pick on title-bars-close:
     * Close at the sheet's leading edge), with Back beside it in the same
     * glass where the thread was opened from the list; on a desk the card's
     * Close trails, as a card's does.
     */
    sheet?: boolean;
    /** Its name pressed: the page scrolls to the pin and lights its element. */
    onfind: () => void;
    ondraft?: () => void;
  } = $props();

  /**
   * The thread's entries as the pin holds them, once their ids were checked:
   * an id held twice is reported with both entries (repeated-keys.ts)
   * before the keyed each throws on it.
   */
  const thread = $derived.by(() => {
    const all = keysChecked(
      `comment ${pin.number}'s thread`,
      pin.thread,
      (entry) => entry.id,
      (entry) => `${entry.by}'s entry at ${entry.at}`
    );
    // The peek: his words, and the latest reply after them.
    return peek && all.length > 2 ? [all[0], ...all.slice(-1)] : all;
  });
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
    if ((fromChip && pin.thread.length <= 2) || peek || pin.thread.length < 2) {
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
    if (!(fresh || atPlace)) {
      return;
    }
    // Settled after the entries are drawn, unless the card has gone by
    // then: its holder takes the pin away as it closes (a thread's sheet
    // going back to its list), and a gone card's `pin` reads nothing.
    const holder = roomEl;
    let gone = false;
    tick().then(() => {
      if (!gone) {
        settle(holder);
        atPlace = true;
      }
    });
    return () => {
      gone = true;
    };
  });
  let head = $state<HTMLElement | null>(null);
  let foot = $state<HTMLDivElement | null>(null);
  /** The thread's start (its pill, name and place) and the foot alone outgrow the card (a phone's keyboard over a short well). */
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
    const holder = bottom?.parentElement;
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
        top.offsetHeight + bottom.offsetHeight + gap + edges >
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

  /**
   * The status line's session, drawn as the thread's references are
   * (markdown-fleet.ts): its chip where a host hands in the fleet, its name
   * on the stage, where the card loads no store.
   */
  const fleet = markdownFleetHere();
  const sentTo = $derived(
    session
      ? (fleet()?.referenceOf ?? plainReferenceOf)(
          referenceHref("session", session)
        )
      : null
  );

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

  /** ⋯'s actions: Copy link, and Pin it somewhere else while its element is gone; each with its glyph as a row (duotone) and as a bar's symbol (linear), where one stands alone in the bar. */
  const moreActions = $derived([
    {
      icon: IconLink,
      barIcon: IconLinkLinear,
      label: said.copyLink,
      onselect: copyLink,
    },
    ...(pin.movedAt
      ? [
          {
            icon: IconPin,
            barIcon: IconPinLinear,
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

<!-- The title: what the comment stands on, two lines at most, the bar's
     own title control (a press scrolls the page to it and lights its
     element), its whole name in its tooltip. Leading its row (`flush`), its
     words stand on the card's text column, its hover reaching out into the
     card's inset. -->
{#snippet title(flush: boolean)}
  <div class={["flex min-w-0 flex-1", flush && "-ms-space-3"]} data-slot="head">
    <BarGlass form="title">
      <BarItem
        data-slot="name"
        form="title"
        label={name}
        lines="two"
        onclick={onfind}
        tip={name}
        ><!-- A box of its own (`data-box`), not the bar item's trimmed and
             padded words: a clamp's padding would show the top of a third
             line, and a trim round it would cut its first and last. --><span
          class="line-clamp-2 text-pretty wrap-anywhere text-start text-ink-strong type-body font-medium"
          data-box>{name}</span
        ></BarItem
      >
    </BarGlass>
  </div>
{/snippet}

<!-- The pin's pill, while the page's own is out of view (or under the sheet holding the thread). -->
{#snippet headPill()}
  <span class="mark-cell" data-slot="head-pill">
    <PinMark
      gone={!!pin.movedAt}
      number={pin.number}
      state={markState(pin)}
      tail="bottom-start"
    />
  </span>
{/snippet}
<!-- A later entry of one speaker's run: its words, and its age at the end
     of their first line, on its baseline (a row's meta on its words' line,
     The Row Dress Rule). -->
{#snippet later(text: string, at: string, who: string, you: boolean)}
  <!-- Its age where the transcript puts a later entry's: floated at the end
       of its words' first line (Who `grouped`), so the words take the
       thread's whole width under it, as his first words do; its clock on
       their first line's baseline, at the prose's leading (Who `--who-lead`). -->
  <div
    class="flow-root"
    data-slot="later"
    style:--who-lead="var(--leading-prose-sm)"
  >
    <Who grouped name={who} shown timestamp={at} {you} />
    {#if text.trim()}
      <MessageBody source={text} wrap="pretty" />
    {/if}
  </div>
{/snippet}
<!-- No head band (the artifact panel's surface brief, A thread beside its
     pin; The Title Bars Follow Liquid Glass Rule): the bar is one row of
     floating groups with no ground. In a phone's sheet Close leads it, Back
     beside it in one glass where the thread was opened from the list (the
     sheet's navigation, HIG Toolbars: "Group navigation controls and
     critical actions like Done, Close, or Save in dedicated … sections");
     then the pin's pill while the page's own is out of view, and the title,
     the bar's own title control in its leading room, a press finding it on
     the page; trailing, Resolve or Reopen, Delete comment and Copy link (or
     More) as one glass, and on a desk Close in its own. Under the bar the
     element's parent where it says more, Delete's question where Delete was
     pressed, then the thread, the one part that scrolls. The peek takes no
     press, so it has none. -->
<div
  bind:this={head}
  class="flex shrink-0 flex-col gap-space-2"
  data-slot="pin-top"
>
  {#if !peek}
    <div
      class="flex min-h-c-top-bar-h items-center gap-space-2"
      data-slot="bar"
    >
      {#if sheet}
        <BarGlass form="group">
          <BarItem
            data-slot="close"
            icon={IconClose}
            label={said.close}
            onclick={onclose}
          />
          {#if back}
            <BarItem
              data-slot="back"
              icon={IconChevronLeft}
              label={commonWords.backTo(back.to)}
              onclick={back.onback}
            />
          {/if}
        </BarGlass>
      {:else if back}
        <BarGlass form="group">
          <BarItem
            data-slot="back"
            icon={IconChevronLeft}
            label={commonWords.backTo(back.to)}
            onclick={back.onback}
          />
        </BarGlass>
      {/if}
      {#if !marked}
        <!-- The pin's pill, what the card is, while the page's own is out of view. -->
        {@render headPill()}
      {/if}
      {#if !sheet}
        <!-- On a desk the title takes the bar's leading room. -->
        {@render title(!back && marked)}
      {:else}
        <span class="flex-1"></span>
      {/if}
      <div class="flex flex-none items-center gap-space-2">
        <BarGlass form="group">
          {#if pin.resolvedAt}
            <BarItem
              icon={IconReopenLinear}
              label={said.reopen}
              onclick={() => onresolve(false)}
            />
          {:else}
            <BarItem
              icon={IconSuccessLinear}
              label={said.resolve}
              onclick={() => onresolve(true)}
            />
          {/if}
          {#if !fromChip}
            <!-- One press asks, under the bar where it was pressed (AskHere). -->
            <!-- Its question standing under the bar, it stands pressed, as a
                 control whose card is open does. -->
            <BarItem
              data-slot="delete"
              expanded={asks.pending?.at === "delete"}
              icon={IconTrashLinear}
              label={said.deleteComment}
              onclick={askDelete}
              open={asks.pending?.at === "delete"}
            />
            {#if moreActions.length === 1 && moreActions[0]}
              {@const only = moreActions[0]}
              <!-- One thing is a button of its own, never a More holding it. -->
              <BarItem
                icon={only.barIcon}
                label={only.label}
                onclick={only.onselect}
              />
            {:else}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <BarItem
                      icon={IconMoreLinear}
                      label={commonWords.moreFor(`comment ${pin.number}`)}
                      {props}
                    />
                  {/snippet}
                </DropdownMenu.Trigger>
                <!-- Hung from the group's glass as one shape with it (BarMenu). -->
                <BarMenu label={commonWords.moreFor(`comment ${pin.number}`)}>
                  {#each moreActions as action (action.label)}
                    <DropdownMenu.Item onSelect={action.onselect}>
                      <action.icon /><span>{action.label}</span>
                    </DropdownMenu.Item>
                  {/each}
                </BarMenu>
              </DropdownMenu.Root>
            {/if}
          {/if}
        </BarGlass>
        {#if !sheet}
          <BarGlass form="group">
            <BarItem icon={IconClose} label={said.close} onclick={onclose} />
          </BarGlass>
        {/if}
      </div>
    </div>
  {/if}
  <!-- Its title, standing put while the thread scrolls under it (the
         owner's pick on comment-card-sizing: "Its title and the reply box
         stay put while a long reply scrolls between them"): the pill while
         the page's is out of view, what it stands on (two lines at most; a
         press scrolls the page to it and lights its element), and its
         element's nearest parent in meta where it says more than the name.
         It has the card's whole width under the bar, as a large title stands
         under its bar (HIG, Navigation bars), never squeezed beside the
         groups. -->
  {#if sheet && !peek}
    <!-- In a phone's sheet the bar holds its controls, and the title stands
         under it at the sheet's whole width, as a sheet's large title does. -->
    {@render title(true)}
  {/if}
  {#if peek || (parent && parent !== name)}
    <div data-slot="head" class="flex shrink-0 items-start gap-space-2">
      {#if peek && !marked}
        {@render headPill()}
      {/if}
      <div class="flex min-w-0 flex-1 flex-col gap-space-row">
        {#if peek}
          <!-- Two lines at most, clamped in an inner span (The Truncate Inside Rule). -->
          <p
            data-slot="name"
            class="m-0 min-w-0 text-start text-ink-strong type-label"
            title={name}
          >
            <span class="line-clamp-2 text-pretty wrap-anywhere">{name}</span>
          </p>
        {/if}
        {#if parent && parent !== name}
          <p
            data-slot="chain"
            class="m-0 min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted type-meta"
            title={`on ${parent}`}
          >
            on {parent}
          </p>
        {/if}
      </div>
    </div>
  {/if}
  {#if !peek}
    <!-- Delete, asked here, under the bar where it was pressed: a question
         of its own (AskHere), never a line of the foot's. -->
    <AskHere asker={asks} at="delete" />
  {/if}
</div>
<!-- What the comment holds, the one part that scrolls, between the title
     and the reply; the house edge fade says there is more past either edge.
     It stands a space out past the card's text edges and pads back in
     (Journey's recipe), and keeps a scrollbar's gutter, so an age at a
     line's end is never cut by its edge. -->
<div
  class="kit-edge-fade-block relative -mx-space-1 flex flex-auto flex-col gap-space-2 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-space-1 scrollbar-gutter-stable data-whole:shrink-0"
  data-whole={squeezed || undefined}
  data-pin-room
  onscroll={readAt}
  bind:this={roomEl}
>
  {#if !peek && pin.movedAt}
    <!-- Its element is gone: said once, and pinned anew with the next tap on the page. Its action a small outline button, never the link's coral beside Reply's (one coral per view). -->
    <div
      data-slot="gone"
      class="flex shrink-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
    >
      <p class="m-0 min-w-0 text-ink-row" role="status">
        {placing ? said.placeHere : words.pinElementGone}
      </p>
      <Button
        label={placing ? "Cancel" : said.placeElsewhere}
        onclick={() => onplace(!placing)}
        size="sm"
        variant="outline"
      />
    </div>
  {:else if !peek && pin.resolvedAt}
    <!-- Resolved, and when: Reopen is the floating group's, said once. -->
    <p
      data-slot="resolved"
      class="m-0 shrink-0 min-w-0 text-ink-muted type-meta num"
      role="status"
    >
      {said.resolvedAgo(resolvedAge)}
    </p>
  {/if}
  {#if !peek && whyNotSent}
    <!-- Its delivery reached no one, it stands only on the page, or the hub refused a write of it: why, with Try again (the pane's `notSentWhy` says when). -->
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
        pending={retrying}
        size="sm"
        variant="outline"
      />
    </div>
  {/if}
  <!-- The transcript's turns: a run of one speaker's entries is one turn
         (its later entries under the first's speaker line), the person's
         run one well. -->
  <ol data-slot="thread" class="m-0 p-0 list-none">
    {#each thread as entry, i (entry.id)}
      {@const grouped = thread[i - 1]?.by === entry.by}
      <li data-slot="entry" class="group/entry" data-by={entry.by}>
        {#if entry.by === "person"}
          {@const runsOn = thread[i + 1]?.by === "person"}
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
  {#if changes && !peek}
    <div data-slot="pin-changes">{@render changes(pin)}</div>
  {/if}
</div>
{#if !peek}
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
        {#if sentTo?.draw === "element"}
          <sentTo.element id={sentTo.id} kind={sentTo.kind} label={agentName} />
        {:else}
          <span>{agentName}</span>
        {/if}
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
      {onhold}
      onsubmit={onreply}
      {placeholder}
      sendError={problem ?? ""}
      {sending}
    />
  </div>
{/if}
