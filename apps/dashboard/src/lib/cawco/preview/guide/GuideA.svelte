<script lang="ts">
  /**
   * Option A, the review strip on the tag bar: the Changed since you looked
   * tag counts what answers him and what went unanswered, and stepping it
   * opens the review strip under it (ReviewStrip) for each stop; the thread
   * card no longer opens by itself at a stop. Everything else is today's.
   */
  import ChangesTag from "../ChangesTag.svelte";
  import ReviewStrip from "../ReviewStrip.svelte";
  import {
    CAME_BACK_TURNS,
    CHANGES,
    type ChangeKind,
    type GuideChange,
    PIN_1,
    PIN_2,
    REPLY,
    RUN,
    RUN_TURNS,
  } from "./fixture";
  import GuidePanel from "./GuidePanel.svelte";
  import GuideScreen from "./GuideScreen.svelte";
  import GuideTurns from "./GuideTurns.svelte";
  import { type Scene, WASHED } from "./scenes";

  let { scene }: { scene: Scene } = $props();

  const phone = $derived(scene === "phone-session" || scene === "phone-tab");
  const form = $derived(
    scene === "phone-session" || scene === "phone-tab" ? scene : "desk"
  );

  /** The stop the strip shows, or none while the tag is not pressed. */
  const stop = $derived.by(
    (): { change: GuideChange; of: number; at: number } | null => {
      switch (scene) {
        case "came-back":
          return null;
        case "pin-2":
          return { change: CHANGES[2], at: 3, of: 3 };
        case "rollup":
          return { change: RUN[0], at: 1, of: RUN.length };
        case "stop-1":
        case "phone-session":
        case "phone-tab":
          return { change: CHANGES[0], at: 1, of: 3 };
      }
    }
  );

  /** What a stop is, after its count. */
  const STOP_WORDS: Record<ChangeKind, (pin: number | null) => string> = {
    answers: (pin) => `answers pin ${pin}`,
    unanswered: (pin) => `pin ${pin} not answered`,
    unasked: () => "nobody asked",
  };
  const tagWords = $derived.by(() => {
    if (!stop) {
      return "3 changed · 2 answer you · 1 unanswered";
    }
    const { change, at, of } = stop;
    return `${at} of ${of} · ${STOP_WORDS[change.kind](change.pin)}`;
  });

  const washed = $derived(WASHED[scene]);
  const chosen = $derived(stop?.change.anchor ?? null);
  /** His comment's words, by its pin. */
  const COMMENTS: Record<number, string | undefined> = {
    1: PIN_1.thread[0]?.text,
    2: PIN_2.thread[0]?.text,
  };
  const comment = $derived(
    stop?.change.pin ? (COMMENTS[stop.change.pin] ?? null) : null
  );
</script>

{#snippet bar()}
  <div
    class="flex flex-none flex-col items-center gap-space-2 pb-space-2"
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
    {#if stop}
      <div class="w-full" data-slot="review-room">
        <ReviewStrip
          change={stop.change}
          {comment}
          compact={phone}
          files={stop.change.kind === "answers" ? ["src/lib/Hero.svelte"] : []}
          reply={stop.change.kind === "answers" ? REPLY : null}
        />
      </div>
    {/if}
  </div>
{/snippet}

{#snippet panel()}
  <GuidePanel
    above={bar}
    ownTab={scene === "phone-tab"}
    page={{
      washed,
      chosen,
      compact: phone,
      marks: [
        {
          number: 1,
          anchor: "#headline",
          dot: scene === "came-back" ? "unread" : null,
          focused: chosen === "#headline",
        },
        { number: 2, anchor: "#shot", focused: chosen === "#shot" },
      ],
    }}
  />
{/snippet}

{#snippet transcript()}
  <GuideTurns turns={scene === "rollup" ? RUN_TURNS : CAME_BACK_TURNS} />
{/snippet}

<GuideScreen {form} {panel} {transcript} />
