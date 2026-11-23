<script lang="ts">
  /**
   * The way on a ChatGPT session stopped on its plan offers (core
   * `StallOffer`): CawCo moves it to no other ChatGPT plan, so the person
   * continues it themselves. Continue on your API key opens Continue
   * prefilled with the OpenAI API-key account signed in on its machine and
   * the session's model on that key, its cost said under it; Continue on
   * another agent or model opens Continue on its picker. Neither moves
   * anything until the form's own Continue is pressed. `align` sets the pair
   * on its surface's axis: centred under a transcript line, on the start
   * edge in the tray's panel.
   */
  import type { StallOffer } from "@cawco/core/protocol";
  import { chatgptPlanWords } from "@cawco/core/words/chatgpt-plan";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    type ContinueSource,
    continueInNewSession,
  } from "../continue.svelte";
  import type { BoardRow } from "../links";
  import { sessionName } from "../session-name";

  let {
    instance,
    offer,
    align = "start",
  }: {
    instance: BoardRow;
    offer: StallOffer;
    align?: "center" | "start";
  } = $props();

  const words = chatgptPlanWords;

  /** The session as Continue's source; null for a row no harness runs. */
  const source = $derived.by((): ContinueSource | null => {
    const { harness } = instance;
    if (harness === null) {
      return null;
    }
    return {
      instanceId: instance.id,
      machineId: instance.machineId,
      cwd: instance.cwd,
      harness,
      model: instance.model ?? undefined,
      title: sessionName(instance.id, {}, instance.cwd).label,
    };
  });

  function onKey(key: NonNullable<StallOffer["key"]>): void {
    if (source) {
      continueInNewSession({
        ...source,
        target: {
          account: key.accountId,
          harness: source.harness,
          model: key.model,
        },
      });
    }
  }
</script>

{#if source}
  <div
    data-slot="chatgpt-offer"
    data-align={align}
    class="group/offer flex flex-wrap items-start gap-space-2 data-[align=center]:justify-center"
  >
    {#if offer.key}
      {@const key = offer.key}
      <span
        class="flex flex-col items-start gap-space-1 group-data-[align=center]/offer:items-center"
      >
        <Button onclick={() => onKey(key)} size="sm" variant="outline"
          >{words.key}</Button
        >
        <span class="type-meta text-tx-2 text-pretty">{words.keyCost}</span>
      </span>
    {/if}
    <Button
      onclick={() => continueInNewSession(source)}
      size="sm"
      variant="outline">{words.other}</Button
    >
  </div>
{/if}
