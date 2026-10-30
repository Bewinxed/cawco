<script lang="ts">
  import type { Pin, ThreadEntry } from "@cawco/core/comments";
  /**
   * PIN WORKING BENCH — a comment's thread (the real PinCard in the real
   * PinFloat, as the artifact panel stands it beside its pill) while the
   * agent works on it: its speaker line where its reply will stand, its mark
   * wearing the live dot (DESIGN.md, A thread beside its pin). No fleet: the
   * pin is a fixture, and `window.__pinWorking` (or the head's buttons) puts
   * the agent to work, lands its reply, or sets it at rest, so the pin-working
   * probe reads where the mark stands, where the reply lands, and the dot's
   * one breath. `?at=foot` stands the pill near the well's foot, and `hide`
   * and `show` close and open the card again, so the probe reads it grow
   * out of its pill and rise to stand whole.
   */
  import { accountsWords } from "@cawco/core/words/accounts";
  import { MediaQuery } from "svelte/reactivity";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import PinCard from "#lib/cawco/preview/PinCard.svelte";
  import PinFloat from "#lib/cawco/preview/PinFloat.svelte";
  import PinMark, {
    markFace,
    markState,
  } from "#lib/cawco/preview/PinMark.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";

  const AT = "2026-10-23T09:00:00.000Z";
  const entry = (
    id: string,
    by: ThreadEntry["by"],
    text: string,
    minutes: number
  ): ThreadEntry => {
    const at = new Date(Date.parse(AT) + minutes * 60_000).toISOString();
    return { id, by, text, at, ...(by === "person" ? { sentAt: at } : {}) };
  };
  const FIRST: ThreadEntry[] = [
    entry("e1", "person", "Make the headline bolder, it gets lost.", 0),
    entry("e2", "agent", "Made it bolder in `src/Hero.svelte`.", 2),
    entry(
      "e3",
      "person",
      "Better. Now give the second paragraph the same weight, and keep its line length.",
      4
    ),
  ];
  const REPLY = entry(
    "e4",
    "agent",
    "Done: the second paragraph is 500 now, at the same measure.",
    6
  );

  let thread = $state<ThreadEntry[]>([...FIRST]);
  let live = $state(true);
  const pin = $derived({
    anchor: {} as Pin["anchor"],
    at: AT,
    by: "person",
    elements: [],
    id: "pin-bench",
    kind: "comment",
    number: 12,
    sentAt: thread.findLast((one) => one.by === "person")?.sentAt,
    seenAt: "9999",
    thread,
  } satisfies Pin);

  /** The card stands open. */
  let open = $state(true);
  /** The card is on the page: open, or going back into its pill. */
  let shown = $state(true);
  const bench = {
    /** The card closed, as its Close leaves it. */
    hide() {
      open = false;
    },
    /** The card opened again from its pill. */
    show() {
      open = true;
      shown = true;
    },
    /** The agent at work on the pin, the thread as it was sent. */
    work() {
      thread = [...FIRST];
      live = true;
    },
    /** The reply lands where the working mark stood. */
    land() {
      thread = [...FIRST, REPLY];
      live = false;
    },
    /** Nothing at work and nothing new. */
    rest() {
      thread = [...FIRST];
      live = false;
    },
  };
  Object.assign(globalThis, { __pinWorking: bench });

  const draft = new ComposerDraft();
  const phone = new MediaQuery("(width < 640px)");
  const coarse = new MediaQuery("(pointer: coarse)");
  let roomW = $state(0);
  let roomH = $state(0);
  const measureRoom = frameSize<HTMLElement>((node) => {
    roomW = node.clientWidth;
    roomH = node.clientHeight;
  });
  /**
   * Where the pill stands: near the well's foot (`?at=foot`), on a page
   * that scrolls under the card (`?at=scroll`: the pill moves with it, as
   * the overlay reports a scrolled pin), else near its top.
   */
  const at = new URLSearchParams(globalThis.location?.search ?? "").get("at");
  /** How far the bench's page is scrolled, px (`?at=scroll`). */
  let scrolled = $state(0);
  /** The pill's box in the well, as the page reports a pin's mark. */
  const MARK = $derived.by(() => {
    if (at === "foot") {
      return { x: 24, y: Math.max(72, roomH - 64), w: 20, h: 20 };
    }
    if (at === "scroll") {
      return { x: 24, y: 360 - scrolled, w: 20, h: 20 };
    }
    return { x: 24, y: 72, w: 20, h: 20 };
  });
</script>

<svelte:head><title>Pin working bench · CawCo</title></svelte:head>

<main class="flex h-dvh flex-col bg-surface-recess">
  <header class="flex flex-none flex-wrap gap-space-2 p-space-2">
    <button data-bench="work" onclick={bench.work} type="button">Work</button>
    <button data-bench="land" onclick={bench.land} type="button">Land</button>
    <button data-bench="rest" onclick={bench.rest} type="button">Rest</button>
  </header>
  <div
    class="@container relative min-h-0 flex-auto bg-surface-raised"
    data-slot="pin-room"
    {@attach measureRoom}
  >
    {#if at === "scroll"}
      <div
        class="absolute inset-0 overflow-y-auto"
        data-slot="bench-page"
        onscroll={(event) => {
          scrolled = event.currentTarget.scrollTop;
        }}
      >
        <!-- A page four screens tall, to scroll under the card. -->
        {#each [1, 2, 3, 4] as screen (screen)}
          <div class="h-dvh"></div>
        {/each}
      </div>
    {/if}
    <span
      class="absolute start-(--mark-x) top-(--mark-y)"
      style:--mark-x="{MARK.x}px"
      style:--mark-y="{MARK.y}px"
    >
      <PinMark
        dot={live ? "live" : null}
        number={pin.number}
        state={markState(pin)}
        tail="bottom-start"
      />
    </span>
    {#if shown}
      <PinFloat
        face={markFace(markState(pin))}
        label="Comment {pin.number}"
        mark={MARK}
        onclosed={() => {
          shown = false;
        }}
        {open}
        pin={pin.number}
        room={{ w: roomW, h: roomH }}
        sheet={phone.current || coarse.current}
        slot="pin-card"
      >
        <PinCard
          agentName={accountsWords.harnesses.claude}
          {draft}
          link="/artifact/bench#pin-12"
          {live}
          name="Hero headline"
          onclose={() => undefined}
          ondelete={async () => undefined}
          onfind={() => undefined}
          onplace={() => undefined}
          onreply={() => undefined}
          onresolve={() => undefined}
          onretry={() => undefined}
          parent="Hero"
          {pin}
          problem={null}
          session="bench-session"
        />
      </PinFloat>
    {/if}
  </div>
</main>
