<script lang="ts">
  /**
   * Under the note that a folder was made a repository with files left out
   * for their size (core ThreadEvent `repo`'s `lfsOffer`): the offer of Git
   * LFS for them, a row per pattern with its count and size, and Track with
   * LFS and Not now while it stands, then what was answered, read from the
   * hub as it is now (`/api/lfs-offers/:id`). Nothing is tracked before
   * Track.
   */
  import { type LfsOfferState, lfsWords } from "@cawco/core";
  import { untrack } from "svelte";
  import { answerLfsOffer, readLfsOffer } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { MessageMetadata } from "../types";

  let { offer }: { offer: NonNullable<MessageMetadata["lfsOffer"]> } = $props();

  let now = $state<LfsOfferState | null>(null);
  let problem = $state<string | null>(null);
  let acting = $state<"track" | "dismiss" | null>(null);

  $effect(() => {
    const { id } = offer;
    untrack(() => {
      readLfsOffer(id).then(
        (read) => {
          now = read;
        },
        (error: unknown) => {
          problem = failureWords(error);
        }
      );
    });
  });

  const MB = 1024 * 1024;
  const size = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

  async function act(what: "track" | "dismiss") {
    if (acting) {
      return;
    }
    acting = what;
    problem = null;
    try {
      now = await answerLfsOffer(offer.id, what);
    } catch (error) {
      problem = failureWords(error);
    } finally {
      acting = null;
    }
  }
</script>

<div class="offer rail-hang" data-lfs-offer={offer.id}>
  {#if now}
    <ul class="rows">
      {#each now.rows as row (row.pattern)}
        <li class="row" data-lfs-pattern={row.pattern}>
          <code class="pattern">{row.pattern}</code>
          <span class="count num"
            >{lfsWords.row(row.count, size(row.bytes))}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
  <div class="acts">
    {#if now?.answer === "open"}
      <Button
        label={lfsWords.track}
        onclick={() => act("track")}
        pending={acting === "track"}
        pendingLabel={lfsWords.tracking}
        size="xs"
        variant="outline"
        disabled={acting === "dismiss"}
      />
      <Button
        label={lfsWords.notNow}
        onclick={() => act("dismiss")}
        pending={acting === "dismiss"}
        pendingLabel={lfsWords.notNowPending}
        size="xs"
        variant="ghost"
        disabled={acting === "track"}
      />
    {:else if now?.answer === "tracked" && now.commit}
      <span class="said">{lfsWords.tracked(now.commit)}</span>
    {:else if now?.answer === "dismissed"}
      <span class="said">{lfsWords.notNow}</span>
    {/if}
  </div>
  {#if problem}
    <p class="problem">{problem}</p>
  {/if}
</div>

<style>
  .offer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
    min-inline-size: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-2);
    min-inline-size: 0;
  }
  .pattern {
    min-inline-size: 0;
    font-size: var(--text-meta);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .count,
  .said {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .problem {
    margin: 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
  }
</style>
