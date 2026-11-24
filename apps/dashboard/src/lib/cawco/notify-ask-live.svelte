<script lang="ts">
  /**
   * The notifications ask as a browser that was never asked shows it at
   * load (NotifyAsk.stories.ts): the real NotifyAsk, in the toast's place
   * and width, answered by a mock browser. Allow waits `waitMs` for the
   * browser's prompt, then takes the answer the `answer` dial names: allowed
   * ticks a moment and leaves; blocked stands with the refusal's words,
   * naming the setting and where to turn it on. Not now puts it away. The
   * `again` dial asks again from the start.
   */
  import { presenceWords } from "@cawco/core/words/presence";
  import NotifyAsk from "./NotifyAsk.svelte";
  import type { DeskAsk } from "./presence";

  type Asks =
    | "Notifications"
    | "Notifications and presence"
    | "Notifications and the agent";
  type Phase = "asking" | "allowing" | "refused" | "done" | "gone";

  let {
    asks = "Notifications",
    answer = "Allowed",
    phone = false,
    again = 0,
    waitMs = 900,
    start = "asking",
  }: {
    /** What this browser is still to be asked for. */
    asks?: Asks;
    /** What the browser answers Allow with. */
    answer?: "Allowed" | "Blocked";
    /** The dashboard is on a phone: notifications alone. */
    phone?: boolean;
    /** Each press of Ask again starts it over. */
    again?: number;
    /** How long the browser's prompt stands before it is answered, ms. */
    waitMs?: number;
    /** Where it stands as it opens: a state of the reading. */
    start?: Phase;
  } = $props();

  /** The tick stands this long before it leaves, as the product's. */
  const TICK_MS = 2400;

  const ask = $derived<DeskAsk>({
    agent: !phone && asks === "Notifications and the agent" ? "obelisk" : null,
    idle: !phone && asks === "Notifications and presence",
    notify: true,
  });

  /** The phase it opens in, again at each press of Ask again. */
  const opening = (_again: number, from: Phase): Phase => from;
  let phase = $derived(opening(again, start));

  const refusal = $derived(
    phase === "refused"
      ? {
          title: presenceWords.blocked([
            presenceWords.notifications("chromium"),
          ]),
          message: presenceWords.unblock("chromium", false),
        }
      : null
  );

  function allow() {
    phase = "allowing";
    setTimeout(() => {
      if (answer === "Blocked") {
        phase = "refused";
        return;
      }
      phase = "done";
      setTimeout(() => {
        phase = "gone";
      }, TICK_MS);
    }, waitMs);
  }
</script>

<div class="flex min-h-64 items-end justify-end p-space-4">
  {#if phase !== "gone"}
    <div class="w-full max-w-89">
      <NotifyAsk
        {ask}
        done={phase === "done"}
        onallow={allow}
        onskip={() => {
          phase = "gone";
        }}
        pending={phase === "allowing"}
        {phone}
        {refusal}
      />
    </div>
  {/if}
</div>
