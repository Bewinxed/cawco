<script lang="ts">
  /**
   * Under the note that a folder was made a repository with files left out
   * for their size (core ThreadEvent `repo`'s `lfsOffer`): the offer of Git
   * LFS for them, a row per pattern with its count and size, and Track with
   * LFS and Not now while it stands, then what was answered, read from the
   * hub as it is now (`/api/lfs-offers/:id`). Nothing is tracked before
   * Track.
   */
  import type { LfsOfferState } from "@cawco/core/threads";
  import { lfsWords } from "@cawco/core/words/lfs";
  import { untrack } from "svelte";
  import { answerLfsOffer, readLfsOffer } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { MessageMetadata } from "../types";
  import OfferActs from "./OfferActs.svelte";

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

  /** What was answered, once it was: the commit Track made, or Not now. */
  const said = $derived.by(() => {
    if (now?.answer === "tracked" && now.commit) {
      return lfsWords.tracked(now.commit);
    }
    return now?.answer === "dismissed" ? lfsWords.notNow : null;
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

<div
  data-slot="lfs-offer"
  class="rail-hang min-w-0 mt-space-2"
  data-answer={now?.answer}
  data-lfs-offer={offer.id}
>
  {#if now}
    <!-- biome-ignore lint/a11y/noRedundantRoles: with list-style none, WebKit drops a list's semantics; its own answer is an explicit role="list" (https://www.scottohara.me/blog/2019/01/12/lists-and-safari.html) -->
    <ul class="flex flex-col gap-space-1" role="list">
      {#each now.rows as row (row.pattern)}
        <li
          class="flex flex-wrap items-baseline gap-x-space-2 min-w-0"
          data-lfs-pattern={row.pattern}
        >
          <code class="min-w-0 text-size-meta text-ink-strong wrap-anywhere"
            >{row.pattern}</code
          >
          <span class="num text-size-meta font-normal text-ink-muted"
            >{lfsWords.row(row.count, size(row.bytes))}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
  <OfferActs {problem} {said}>
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
    {/if}
  </OfferActs>
</div>
