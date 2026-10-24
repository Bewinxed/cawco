<script lang="ts">
  import { commentWords } from "@cawco/core";
  /**
   * Option B, activity lines in the thread with the rail as the inbox: the
   * Comments rail opens by itself on his return at a first tab, To check,
   * its rows the comments whose elements changed in the check order, each
   * with its activity lines (ActivityLines), then what changed under no
   * comment; a comment's thread card carries the same lines over its reply.
   * The tag stays today's and steps the rail's order.
   */
  import type { Pin } from "@cawco/core/comments";
  import ActivityLines from "../ActivityLines.svelte";
  import ChangesTag from "../ChangesTag.svelte";
  import CommentRail from "../CommentRail.svelte";
  import {
    CAME_BACK_TURNS,
    LINES,
    PIN_1,
    PIN_2,
    PINS,
    RUN_LINES,
    RUN_TURNS,
    UNASKED_LINES,
  } from "./fixture";
  import GuidePanel from "./GuidePanel.svelte";
  import GuideScreen from "./GuideScreen.svelte";
  import GuideThread from "./GuideThread.svelte";
  import GuideTurns from "./GuideTurns.svelte";
  import { type Scene, STEPPED, WASHED } from "./scenes";

  let { scene }: { scene: Scene } = $props();

  const phone = $derived(scene === "phone-session" || scene === "phone-tab");
  const form = $derived(
    scene === "phone-session" || scene === "phone-tab" ? scene : "desk"
  );
  const run = $derived(scene === "rollup");
  const lines = $derived(run ? RUN_LINES : LINES);
  const total = $derived(run ? 7 : 3);

  /** The thread a step opened, or none. */
  const CARDS: Partial<Record<Scene, Pin>> = {
    "stop-1": PIN_1,
    "pin-2": PIN_2,
  };
  const card = $derived(CARDS[scene] ?? null);
  const stepped = $derived(STEPPED[scene]);
  const tagWords = $derived(
    stepped
      ? commentWords.changeOf(stepped.stop, total)
      : commentWords.changedSince(total)
  );
  const washed = $derived(WASHED[scene]);
  const chosen = $derived(stepped?.anchor ?? null);
  const unread = $derived(
    new Set(scene === "came-back" || run || phone ? ["pin-1"] : [])
  );
</script>

{#snippet bar()}
  <div
    class="flex min-w-0 flex-none justify-center pb-space-2"
    data-slot="changes-bar"
  >
    <ChangesTag
      label={tagWords}
      onstep={() => undefined}
      onwords={() => undefined}
      words={tagWords}
    />
  </div>
{/snippet}

{#snippet activity(pin: Pin)}
  <ActivityLines
    inset="rail"
    lines={lines[pin.id] ?? []}
    unanswered={pin.id === "pin-2"}
  />
{/snippet}

{#snippet unasked()}
  <!-- What changed under no comment, last, as one row of its own. -->
  <section
    aria-label="Changed under no comment"
    class="mt-space-row flex flex-col gap-space-1 px-space-2 py-space-2"
    data-slot="unasked"
  >
    <h3 class="m-0 type-label font-medium text-ink-row">
      {run ? `Nobody asked · ${UNASKED_LINES.length} changes` : "Nobody asked"}
    </h3>
    {#if run}
      <ActivityLines lines={UNASKED_LINES} />
    {:else}
      <p class="m-0 text-ink-muted type-meta">Nothing else changed</p>
    {/if}
  </section>
{/snippet}

{#snippet rail(layout: "beside" | "sheet")}
  <CommentRail
    checks={{ count: total, pins: ["pin-1", "pin-2"], activity, unasked }}
    down={null}
    filter="check"
    focused={card?.id ?? null}
    hold="ready"
    {layout}
    live={new Set()}
    onclose={() => undefined}
    onhover={() => undefined}
    onopen={() => undefined}
    onpage={() => undefined}
    onresolve={() => undefined}
    onretry={() => undefined}
    onretrypin={() => undefined}
    open={card?.id ?? null}
    pins={PINS}
    {unread}
  />
{/snippet}

{#snippet cardActivity()}
  <ActivityLines
    lines={LINES[card?.id ?? ""] ?? []}
    unanswered={card?.id === "pin-2"}
  />
{/snippet}

{#snippet over({
  room,
  pills,
}: {
  room: { w: number; h: number };
  pills: Record<number, { x: number; y: number; w: number; h: number }>;
})}
  {#if card}
    <GuideThread
      activity={cardActivity}
      mark={pills[card.number] ?? null}
      pin={card}
      {room}
      sheet={phone}
    />
  {/if}
{/snippet}

{#snippet panel()}
  <GuidePanel
    above={bar}
    openCount={2}
    {over}
    ownTab={scene === "phone-tab"}
    page={{
      washed,
      chosen,
      compact: phone,
      marks: [
        {
          number: 1,
          anchor: "#headline",
          dot: unread.has("pin-1") ? "unread" : null,
          focused: chosen === "#headline",
        },
        { number: 2, anchor: "#shot", focused: chosen === "#shot" },
      ],
    }}
    {rail}
    railAway={!!card}
    railOpen
  />
{/snippet}

{#snippet transcript()}
  <GuideTurns turns={run ? RUN_TURNS : CAME_BACK_TURNS} />
{/snippet}

<GuideScreen {form} {panel} {transcript} />
