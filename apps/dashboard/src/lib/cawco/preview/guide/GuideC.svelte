<script lang="ts">
  import { commentWords } from "@cawco/core";
  /**
   * Option C, the update card on the agent's turn plus a Review toast: the
   * turn that made a revision carries what it changed (UpdateCard), Review
   * opening the panel at the first stop; with the panel closed a toast says
   * an update landed (ReviewToast). The panel, the tag, the washes and the
   * thread card stay today's; on the phone's artifact tab, which has no
   * conversation, one line under the tag says the counts.
   */
  import ReviewToast from "../../transcript/ReviewToast.svelte";
  import UpdateCard from "../../transcript/UpdateCard.svelte";
  import ChangesTag from "../ChangesTag.svelte";
  import {
    CAME_BACK_TURNS,
    CHANGES,
    PAGE,
    PIN_1,
    RUN,
    RUN_TURNS,
    TURNS,
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
  /** The panel stands open: at the desk, back or stepping, and on the artifact tab. */
  const panelOpen = $derived(!(run || scene === "phone-session"));

  const stepped = $derived(STEPPED[scene]);
  const tagWords = $derived(
    stepped
      ? commentWords.changeOf(stepped.stop, 3)
      : commentWords.changedSince(3)
  );
  const washed = $derived(WASHED[scene]);
  const chosen = $derived(stepped?.anchor ?? null);
  /** Revision 7's rows in a run: one stop per element since he looked. */
  const runRows = RUN.slice(0, 3);
</script>

{#snippet under(id: string)}
  {#if id === "t-rev-7"}
    <UpdateCard
      changes={run ? runRows : CHANGES}
      page={PAGE.name}
      revision={7}
      since={run ? "7 changes across 4 updates" : null}
    />
  {:else if id.startsWith("t-rev-")}
    {@const turn = TURNS.find((one) => `t-rev-${one.revision}` === id)}
    {#if turn}
      <UpdateCard
        changes={[]}
        count={turn.changes}
        folded
        page={PAGE.name}
        revision={turn.revision}
      />
    {/if}
  {/if}
{/snippet}

{#snippet bar()}
  <div
    class="flex min-w-0 flex-none flex-col items-center gap-space-1 pb-space-2"
    data-slot="changes-bar"
  >
    <div class="flex w-full min-w-0 justify-center">
      <ChangesTag
        label={tagWords}
        onstep={() => undefined}
        onwords={() => undefined}
        words={tagWords}
      />
    </div>
    {#if scene === "phone-tab"}
      <!-- No conversation here: the card's counts, as one line under the tag. -->
      <p class="m-0 text-center text-ink-muted type-meta" data-slot="counts">
        2 answer you · 1 not answered
      </p>
    {/if}
  </div>
{/snippet}

{#snippet over({
  room,
  pills,
}: {
  room: { w: number; h: number };
  pills: Record<number, { x: number; y: number; w: number; h: number }>;
})}
  {#if scene === "stop-1"}
    <!-- Today's step onto a stop with an answer: its thread opens. -->
    <GuideThread mark={pills[1] ?? null} pin={PIN_1} {room} sheet={phone} />
  {/if}
{/snippet}

{#snippet panel()}
  <GuidePanel
    above={bar}
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
          dot: scene === "stop-1" ? null : "unread",
          focused: chosen === "#headline",
        },
        { number: 2, anchor: "#shot", focused: chosen === "#shot" },
      ],
    }}
  />
{/snippet}

{#snippet transcript()}
  <GuideTurns {under} turns={run ? RUN_TURNS : CAME_BACK_TURNS} />
{/snippet}

{#snippet toast()}
  <ReviewToast page={PAGE.name} updates={run ? 4 : 1} />
{/snippet}

<GuideScreen
  {form}
  panel={panelOpen ? panel : undefined}
  toast={panelOpen ? undefined : toast}
  {transcript}
/>
