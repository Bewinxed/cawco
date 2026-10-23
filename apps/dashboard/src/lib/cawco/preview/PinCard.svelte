<script lang="ts">
  import { commentWords as said, artifactWords as words } from "@cawco/core";
  /**
   * A comment's thread, as a card beside its pin (the owner's pick; DESIGN.md,
   * A thread beside its pin), in the app: PinCardFace draws it, and this
   * hands it what it holds of the app. The session's chip in its status
   * line; ⋯'s Copy link (a refusal said over the reply, kept through a
   * reload) and Pin it somewhere else while its element is gone; the words
   * of a text an entry carries, read from the hub once; the Delete question,
   * asked in the card itself; and the chat composer as the reply, with its
   * own Attach and the send glyph "Reply" ("Reply to reopen" once resolved,
   * and its reply reopens it).
   *
   * It closes by its Close or Esc, or a press on another row or pin, never
   * by a press on the page.
   */
  import type { Pin } from "@cawco/core/comments";
  import { untrack } from "svelte";
  import { IconLink, IconPin } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import type { SendExtras } from "../client.svelte";
  import { copyRefused, copyToClipboard } from "../copy";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import SessionReference from "../SessionReference.svelte";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import CommentComposer from "./CommentComposer.svelte";
  import PinCardFace from "./PinCardFace.svelte";

  let {
    pin,
    name,
    parent,
    agentName,
    session: sessionId = null,
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
  }: {
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

  const placeholder = $derived(
    pin.resolvedAt ? said.reopenHint : said.replyHint
  );

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

{#snippet sessionChip()}
  {#if sessionId}
    <SessionReference id={sessionId} />
  {/if}
{/snippet}

<PinCardFace
  {agentName}
  {live}
  {marked}
  more={moreActions}
  {name}
  onaskdelete={askDelete}
  {onclose}
  {onfind}
  {onplace}
  {onresolve}
  {onretry}
  {parent}
  {pin}
  {placing}
  {retrying}
  session={sessionId ? sessionChip : undefined}
  {texts}
  {whyNotSent}
>
  {#snippet reply()}
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
    <!-- The reply takes the keyboard as the thread opens; its caret is its focus (The Caret Rule). -->
    <CommentComposer
      action="Reply"
      {draft}
      focus
      onchange={ondraft}
      onsubmit={onreply}
      {placeholder}
      sendError={problem ?? ""}
      {sending}
    />
    <AskHere asker={asks} at="delete" />
  {/snippet}
</PinCardFace>
