<script lang="ts">
  import { newAnswer, type Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  /**
   * A comment pin's chip, wherever the dashboard draws one, and the one way
   * its thread opens: an agent's `[label](cawco:pin/<artifact>/<number>)` in
   * written words (core references.ts, the registry's `pin` element), and
   * the comment a `comment_reply` or `comment_resolve` call answered, under
   * the call's line (ToolGroup, `answer`). Both are the inline chip (ui/chip
   * `inline`) with the pin's pill as its mark, in its state. In written
   * words its label is what the pin stands on (core pin-name.ts), read as
   * the chip is first drawn, else the written label, and kept from then on;
   * its name says its state ("Pin 12 on When", "· resolved", "· its element
   * is gone", ", New answer"), and the pill wears the needs-you dot while an
   * answer there is unread (core `newAnswer`). Under a call it reads "Your
   * comment on <page>" and its state ("· answered", "· resolved"), like any
   * tool call's chip (the owner, 10-26: "just like any tool call I can click
   * the chip to view the comment thread and reply").
   *
   * Pressing it, or resting a mouse on it for `--dur-peek`, opens the
   * thread: on a desk and a tablet the house hover panel (HoverPanel) under
   * the chip, over it where the room under it is short; on a phone the
   * thread's bottom sheet (ThreadSheet). It holds the page's name with Open
   * where it is, which brings the page to the front of the panel at the pin
   * (reference-open), then the pin's thread card (PinCard `fromChip`: his
   * comment, every reply, Resolve or Reopen, Close, the reply). The card
   * joins the page's doc while it is open, as a preview's pane does: replies
   * arrive in it live, and his reply and his resolve are written there. The
   * reply takes the keyboard only when he reaches for it.
   *
   * Opened from the keys, the focus goes to Open where it is; a press
   * outside it and the chip, Escape, the chip scrolling out of view or the
   * page navigating puts it away (ChipPanel's rules, HoverPanel's own).
   */
  import { pinReference } from "@cawco/core/references";
  import { commentWords } from "@cawco/core/words/comments";
  import { Portal } from "bits-ui";
  import { tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconArrowUpRight } from "#lib/icons.js";
  import { ARTIFACT_GLYPH } from "./artifact-glyph";
  import { artifactNamed, pinNamed } from "./artifact-names.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { dur } from "./motion/curves.svelte";
  import { pressOutside } from "./press-outside";
  import {
    type ArtifactDoc,
    type ArtifactView,
    type DocSync,
    joinArtifact,
  } from "./preview/artifact-doc";
  import { commentAttachments } from "./preview/comment-rows";
  import PinCard from "./preview/PinCard.svelte";
  import PinMark, { markState } from "./preview/PinMark.svelte";
  import ThreadSheet from "./preview/ThreadSheet.svelte";
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";
  import { sessionHere } from "./session-here";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import { floor } from "./visible-viewport.svelte";

  let {
    id,
    label = "",
    answer = false,
  }: {
    id: string;
    label?: string;
    /** The comment a call answered, under its line: "Your comment on <page>" and its state. */
    answer?: boolean;
  } = $props();
  const here = sessionHere();
  const panelId = $props.id();

  const named = $derived(pinReference(id));
  const page = $derived(named ? artifactNamed(named.artifact) : null);

  /** The page's doc while the thread is open, and what it says. */
  let doc = $state<ArtifactDoc | null>(null);
  let view = $state.raw<ArtifactView | null>(null);
  /** Whether the page's doc is held yet, or why it couldn't be. */
  let sync = $state<DocSync>({ state: "reading" });
  /** The pin: as the open doc holds it, else as the chips' store read it. */
  const pin = $derived<Pin | null>(
    view?.pins.find((one) => one.number === named?.number) ?? pinNamed(id)
  );
  const stateWord = $derived(pin?.resolvedAt ? "resolved" : "answered");
  /*
   * In written words, what the pin stands on as its first paint draws it,
   * kept (DESIGN.md, a pin's chip: "its label what it stands on"): opening
   * its thread and the doc loading never rewrite it, so the chip keeps its
   * words and its width. Its state stays live; none of it moves its width.
   */
  const standsOn = untrack(() => {
    const first = pinNamed(id);
    return first ? pinName(first) : label;
  });
  const words = $derived.by(() => {
    if (!answer) {
      return standsOn;
    }
    return page ? `Your comment on ${page.name}` : label || "Your comment";
  });
  const unread = $derived(!answer && !!pin && newAnswer(pin));
  /** Its name, its state in words. */
  const title = $derived.by(() => {
    if (answer) {
      return `${words}, ${stateWord}`;
    }
    const number = named?.number ?? 0;
    let said = `Pin ${number} on ${words}`;
    if (pin?.resolvedAt) {
      said = `Pin ${number} · resolved`;
    } else if (pin?.movedAt) {
      said = `Pin ${number} · its element is gone`;
    }
    return unread ? `${said}, ${commentWords.newAnswer}` : said;
  });
  const Glyph = $derived(ARTIFACT_GLYPH[page?.kind ?? "page"]);

  /** A phone: under 640px, the product's phone line; its thread is the bottom sheet. */
  const phone = new MediaQuery("(width < 640px)");
  /** A mouse: resting on the chip opens it too. */
  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");

  let chip = $state<HTMLButtonElement>();
  let open = $state(false);
  /** Where the panel stands in the viewport: under the chip, or over it where the room under it is short. */
  let place = $state<{
    x: number;
    y: string;
    room: string;
    span: number;
    /** The panel's edge nearest the chip: `top` under it, `bottom` over it. */
    edge: "top" | "bottom";
  }>({ x: 0, y: "0px", room: "0px", span: 0, edge: "top" });
  const draft = new ComposerDraft({ byReference: true });
  let problem = $state<string | null>(null);

  /** A token's length in px, as the root computes it. */
  const px = (name: string): number =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(name)
    );

  function stand(): void {
    if (!chip) {
      return;
    }
    const box = chip.getBoundingClientRect();
    const inset = px("--hover-panel-inset");
    const gap = px("--space-1");
    const span = innerWidth - 2 * inset;
    const widest = Math.min(px("--hover-panel-max"), span);
    const x = Math.round(
      Math.max(inset, Math.min(box.left, innerWidth - widest - inset))
    );
    const under = innerHeight - box.bottom - gap - inset;
    const over = box.top - gap - inset;
    // Under the chip; over it only where the room under it is short and the
    // room over it is more. Over it, the panel stands its own height (the
    // 100%, which the panel's translate reads) above the chip.
    if (under >= px("--c-hover-panel-room") || under >= over) {
      place = {
        x,
        y: `${Math.round(box.bottom + gap)}px`,
        room: `${Math.round(under)}px`,
        span,
        edge: "top",
      };
    } else {
      place = {
        x,
        y: `calc(${Math.round(box.top - gap)}px - 100%)`,
        room: `${Math.round(over)}px`,
        span,
        edge: "bottom",
      };
    }
  }

  /**
   * What the open thread joins: the page's session and its id, as one string,
   * so only a change of either joins again (the chips' store answers the
   * page anew as panes hold and let go of it).
   */
  const joining = $derived(
    open && named && page ? `${page.instanceId} ${named.artifact}` : null
  );
  /** The page's doc, joined while the thread is open: its replies live, his written there. */
  $effect(() => {
    const at = joining;
    if (!at) {
      return;
    }
    const [session = "", artifactId = ""] = at.split(" ");
    const joined = untrack(() =>
      joinArtifact(
        session,
        artifactId,
        (next) => {
          view = next;
        },
        (next) => {
          sync = next;
        },
        (why) => {
          problem = why;
        }
      )
    );
    doc = joined;
    return () => {
      joined.destroy();
      doc = null;
      view = null;
      sync = { state: "reading" };
    };
  });
  // The open thread is looked at: what the agent answered there is seen.
  $effect(() => {
    const shown = view?.pins.find((one) => one.number === named?.number);
    if (open && doc && shown) {
      untrack(() => doc?.see(shown.id));
    }
  });

  // While it stands open: a press outside it and the chip, or Escape, puts it
  // away; scrolling keeps it at its chip, and a chip scrolled out of view puts
  // it away. The sheet goes by its own Close, Escape or a drag down.
  $effect(() => {
    if (!open || phone.current) {
      return;
    }
    const panel = document.getElementById(panelId);
    const stop = panel
      ? pressOutside(panel, (event) => {
          if (!(event.target instanceof Node && chip?.contains(event.target))) {
            open = false;
          }
        })
      : () => undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close(true);
      }
    };
    let frame = 0;
    const follow = (event: Event) => {
      if (
        frame ||
        (event.target instanceof Node && panel?.contains(event.target))
      ) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = chip?.getBoundingClientRect();
        if (
          !(box && chip?.isConnected) ||
          box.bottom <= 0 ||
          box.top >= innerHeight
        ) {
          open = false;
          return;
        }
        stand();
      });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      stop();
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
    };
  });

  function close(refocus: boolean): void {
    open = false;
    if (refocus) {
      chip?.focus();
    }
  }

  async function press(event: MouseEvent): Promise<void> {
    clearTimeout(restTimer);
    if (open) {
      open = false;
      return;
    }
    stand();
    problem = null;
    open = true;
    // Opened from the keys (a click with no pointer), the focus goes in to its first act.
    if (event.detail === 0) {
      await tick();
      document
        .querySelector<HTMLElement>(
          `[data-comment-chip-panel="${panelId}"] [data-open-where]`
        )
        ?.focus();
    }
  }

  /* Resting a mouse on the chip opens it after --dur-peek; a finger presses. */
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  function rest(): void {
    clearTimeout(restTimer);
    if (!fine.current || open || !pin) {
      return;
    }
    restTimer = setTimeout(() => {
      stand();
      problem = null;
      open = true;
    }, dur("--dur-peek"));
  }
  $effect(() => () => clearTimeout(restTimer));

  /** Where Open where it is's last press was refused: said beside the chip, kept through a reload. */
  const refKey = $derived(`ref:${id}:pin`);
  async function openWhere(): Promise<void> {
    if (!named) {
      return;
    }
    const key = refKey;
    open = false;
    const refused = await openReference(
      named.artifact,
      { pin: named.number },
      here?.()
    );
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }

  /** His reply, in the thread on the page's doc; a resolved thread it reopens. */
  function reply(text: string): void {
    const shown = pin;
    if (!(doc && shown && view)) {
      problem =
        sync.state === "failed" || sync.state === "lost"
          ? `The reply wasn't kept: ${sync.why}`
          : "The page's comments are still loading, so the reply wasn't kept. Send it again in a moment.";
      if (draft.unsent) {
        draft.fill(draft.unsent);
        draft.settle();
      }
      return;
    }
    problem = doc.reply(shown.id, {
      text,
      attachments: commentAttachments(draft.unsent?.files ?? []),
    });
    if (problem === null && shown.resolvedAt) {
      problem = doc.resolve(shown.id, false);
    }
    if (problem === null) {
      draft.settle();
    } else if (draft.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
  }
  function resolve(resolved: boolean): void {
    const shown = pin;
    if (!(doc && shown && view)) {
      return;
    }
    problem = doc.resolve(shown.id, resolved);
  }

  /** The keyboard covers the screen's foot: the sheet stands on it. */
  const lift = $derived(
    floor.bottom > 0 ? Math.max(0, Math.round(innerHeight - floor.bottom)) : 0
  );
</script>

{#snippet thread(shown: Pin)}
  <!-- What the thread is on, and the way to it there. -->
  <div
    class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
    data-doc={sync.state}
    data-slot="thread-where"
  >
    <span class="mark-line flex min-w-0 flex-1 items-center gap-space-1">
      <Glyph aria-hidden="true" class="size-icon-sm flex-none" data-box />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{page?.name ?? ""}</span
      >
    </span>
    <Button
      data-open-where
      icon={IconArrowUpRight}
      label="Open where it is"
      onclick={openWhere}
      pad="none"
      size="sm"
      variant="link"
    />
  </div>
  <PinCard
    agentName={page ? sessionName(page.instanceId) : "The session"}
    {draft}
    fromChip
    link={`${location.origin}/artifact/${encodeURIComponent(named?.artifact ?? "")}?pin=${shown.number}`}
    marked={false}
    name={pinName(shown)}
    onclose={() => close(true)}
    ondelete={() => Promise.resolve()}
    onfind={openWhere}
    onplace={() => undefined}
    onreply={reply}
    onresolve={resolve}
    onretry={() => undefined}
    parent={null}
    pin={shown}
    {problem}
  />
{/snippet}

<!-- The chip stands in a line of text as a word does (ui/chip `inline`). -->
<button
  aria-controls={panelId}
  aria-expanded={open}
  aria-haspopup="dialog"
  aria-label={title}
  class={chipVariants({ variant: "inline" })}
  data-comment-chip={id}
  data-pin-chip={answer ? undefined : id}
  data-state={pin ? markState(pin) : undefined}
  data-unread={unread || undefined}
  onclick={press}
  onpointerenter={rest}
  onpointerleave={() => clearTimeout(restTimer)}
  type="button"
  bind:this={chip}
>
  <span data-slot="mark" class="inline-flex flex-none" data-box>
    <PinMark
      dot={unread ? "unread" : null}
      gone={!!pin?.movedAt}
      number={named?.number ?? null}
      size="inline"
      state={pin ? markState(pin) : "sent"}
    />
  </span>
  <span data-slot="label">{words}</span>
  {#if answer}
    <span class="flex-none text-ink-muted" data-slot="state">· {stateWord}</span
    >
  {/if}
</button><RowFault
  again={openWhere}
  class="inline-block max-w-full align-baseline"
  data-reference-refused
  reason={refusals.reason(refKey)}
/><Portal>
  {#if pin && phone.current}
    <!-- A phone: the thread's bottom sheet, over the conversation, standing on a keyboard. -->
    <div
      class="pointer-events-none fixed inset-0 z-(--layer-float)"
      data-comment-chip-panel={panelId}
      id={panelId}
      style:--keyboard-lift="{lift}px"
    >
      {#if open}
        <ThreadSheet label={words} onclose={() => close(false)} open>
          {@render thread(pin)}
        </ThreadSheet>
      {/if}
    </div>
  {:else if pin}
    <HoverPanel
      aria-label={words}
      data-comment-chip-panel={panelId}
      edge={place.edge}
      id={panelId}
      key={open ? id : null}
      onclose={() => close(false)}
      role="dialog"
      side="right"
      style="--x: {place.x}px; --y: {place.y}; --origin: 0px; --room: {place.room}; --span: {place.span}px"
    >
      {#snippet children()}
        <div
          class="flex min-h-0 min-w-0 w-(--thread-w) max-h-(--thread-h) flex-col gap-space-2"
          data-slot="thread-panel"
          style:--thread-h="calc(var(--room) - 2 * var(--space-3) - 2px)"
          style:--thread-w="calc(min(var(--hover-panel-max), {place.span}px) - 2
          * var(--space-3) - 2px)"
        >
          {@render thread(pin)}
        </div>
      {/snippet}
    </HoverPanel>
  {/if}
</Portal>
