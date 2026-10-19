<script lang="ts">
  /**
   * Browsers: the fleet's stream relay, the TURN server a browser's take-over
   * reaches a screen through on any network (hub stream-relay.ts), brought
   * up by its guided journey (hub relay-journey.ts). Before anyone set it
   * up, the lead and Set up; then the journey's card, every step ticking by
   * itself; once the relay has gone live, its summary (machine, name, state,
   * each port's answer, the certificate's end, who proved it from outside),
   * with Check the stream relay again, Add a name while none stands, and
   * Stop and Remove the stream relay asked in place. The card is the one
   * Caw's Needs you draws, from the same journey, live (client.svelte.ts
   * `relayJourney`).
   */
  import type { RelayJourneyView } from "@cawco/core/stream-relay";
  import { onMount } from "svelte";
  import { cawco, readRelayJourney } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import RelayJourney from "#lib/cawco/relay/RelayJourney.svelte";
  import {
    actOnRelayCard,
    proveOnStart,
    stepsHere,
  } from "#lib/cawco/relay/relay.svelte.js";

  const section = sectionOf("browsers");
  /** A hub sentence that already tells the person to try again. */
  const SAYS_TRY_AGAIN = /\btry again\b/i;

  let problem = $state<string | null>(null);
  onMount(() => {
    readRelayJourney().catch((error: unknown) => {
      // The error formula's fix is said once: the hub's sentence carries it
      // when it already tells the person to try again (the unreachable
      // hub's "…then try again."); otherwise ours does.
      const why = failureWords(error);
      problem = SAYS_TRY_AGAIN.test(why)
        ? `The stream relay couldn't be read. ${why} Nothing was changed.`
        : `The stream relay couldn't be read. ${why} Nothing was changed. Reload the page to try again.`;
    });
  });

  const journey = $derived(cawco.relayJourney);
  // The start's tick proves the relay from this screen, once.
  $effect(() => proveOnStart(journey));

  /**
   * Which face Settings draws: the summary once the relay has gone live and
   * its start stands (or the person stopped it); the journey while a step
   * before the start stands again (a name added, a start that failed); Set
   * up before anyone set it up.
   */
  const faceOf = (view: RelayJourneyView): "start" | "journey" | "summary" => {
    const start = view.steps.find((step) => step.step === "start");
    if (
      view.summary &&
      (!view.open ||
        start?.state === "done" ||
        view.summary.state === "stopped")
    ) {
      return "summary";
    }
    return view.open ? "journey" : "start";
  };
</script>

<SectionFrame
  problem={journey === undefined ? problem : null}
  purpose={section.purpose}
  ready={journey !== undefined}
  title={section.label}
>
  <div class="flex min-w-0 flex-col" data-stream-relay>
    {#if journey}
      <RelayJourney
        candidates={journey.candidates}
        domain={cawco.relayDomain}
        machine={journey.machine}
        onact={actOnRelayCard}
        steps={stepsHere(journey.steps)}
        summary={journey.summary}
        view={faceOf(journey)}
      />
    {/if}
  </div>
</SectionFrame>
