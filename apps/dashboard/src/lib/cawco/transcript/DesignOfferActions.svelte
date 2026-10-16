<script lang="ts">
  /**
   * Under Caw's note asking whether to build a design system (core
   * ThreadEvent `design-offer`): Build and Not now while it stands, then
   * what was answered, read from the hub as it is now
   * (`/api/projects/:id/design-offer`). Build files the task; nothing is
   * built before it.
   */
  import type { DesignOfferState } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    answerDesignOffer,
    readDesignOffer,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { MessageMetadata } from "../types";

  let { offer }: { offer: NonNullable<MessageMetadata["designOffer"]> } =
    $props();

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

<div class="offer rail-hang" data-design-offer={offer.projectId}>
  {#if now?.answer === "open"}
    <Button
      label="Build"
      onclick={() => act("build")}
      pending={acting === "build"}
      pendingLabel="Filing…"
      size="xs"
      variant="outline"
    />
    <Button
      label="Not now"
      onclick={() => act("dismiss")}
      pending={acting === "dismiss"}
      pendingLabel="Not now…"
      size="xs"
      variant="ghost"
    />
  {:else if now?.answer === "built"}
    <span class="said">Filed</span>
    {#if href}
      <Button {href} label="Open" size="xs" variant="ghost" />
    {/if}
  {:else if now?.answer === "dismissed"}
    <span class="said">Not now</span>
  {/if}
  {#if problem}
    <p class="problem">{problem}</p>
  {/if}
</div>

<style>
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  .said {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .problem {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
  }
</style>
