<script lang="ts">
  /**
   * Under Caw's note asking whether to build a design system (core
   * ThreadEvent `design-offer`): Build and Not now while it stands, then
   * what was answered, read from the hub as it is now
   * (`/api/projects/:id/design-offer`). Build files the task; nothing is
   * built before it.
   */
  import { type DesignOfferState, offerWords } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    answerDesignOffer,
    readDesignOffer,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { MessageMetadata } from "../types";
  import OfferActs from "./OfferActs.svelte";

  let { offer }: { offer: NonNullable<MessageMetadata["designOffer"]> } =
    $props();

  /** What was answered, once it was. */
  const SAID = { built: offerWords.filed, dismissed: offerWords.notNow };

  let now = $state<DesignOfferState | null>(null);
  let problem = $state<string | null>(null);
  let acting = $state<"build" | "dismiss" | null>(null);

  $effect(() => {
    const id = offer.projectId;
    untrack(() => {
      readDesignOffer(id).then(
        (read) => {
          now = read;
        },
        (error: unknown) => {
          problem = failureWords(error);
        }
      );
    });
  });

  /** The task Build filed, open beside the board. */
  const href = $derived(
    now?.builtTaskId
      ? `/project/${encodeURIComponent(offer.projectId)}?task=${encodeURIComponent(now.builtTaskId)}`
      : null
  );

  async function act(what: "build" | "dismiss") {
    if (acting) {
      return;
    }
    acting = what;
    problem = null;
    try {
      now = await answerDesignOffer(offer.projectId, what);
    } catch (error) {
      problem = failureWords(error);
    } finally {
      acting = null;
    }
  }
</script>

<OfferActs
  class="rail-hang"
  data-answer={now?.answer}
  data-design-offer={offer.projectId}
  {problem}
  said={now && now.answer !== "open" ? SAID[now.answer] : null}
>
  {#if now?.answer === "open"}
    <Button
      label={offerWords.build}
      onclick={() => act("build")}
      pending={acting === "build"}
      pendingLabel={offerWords.filing}
      size="xs"
      variant="outline"
    />
    <Button
      label={offerWords.notNow}
      onclick={() => act("dismiss")}
      pending={acting === "dismiss"}
      pendingLabel={offerWords.notNowPending}
      size="xs"
      variant="ghost"
    />
  {:else if now?.answer === "built" && href}
    <Button {href} label={offerWords.open} size="xs" variant="ghost" />
  {/if}
</OfferActs>
