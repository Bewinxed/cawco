<script lang="ts">
  /**
   * "Make this a project" (Projects §2, "Caw suggests, you escalate"): the
   * one offer a plain session gets when it outgrows itself, standing over the
   * composer with the parked asks. Quiet by design: no needs-you pill, no
   * attention hue, one sentence naming why, and two answers. Either answer is
   * the last word: a session is never offered again.
   */
  import { offerWords, type ProjectOfferSummary } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconFolder } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import {
    answerProjectOffer,
    dismissProjectJoin,
    type ProjectOfferAccepted,
  } from "../client.svelte";
  import RowFault from "../RowFault.svelte";
  import { threadHref } from "../thread-tabs";

  let {
    instanceId,
    offer,
    joined,
  }: {
    instanceId: string;
    /** The offer standing; gone once it is answered. */
    offer: ProjectOfferSummary | undefined;
    /** What answering it joined: the card says so where the offer stood. */
    joined: ProjectOfferAccepted | undefined;
  } = $props();

  let pending = $state<"accept" | "dismiss" | null>(null);
  let refused = $state("");

  const joinedLine = $derived(
    joined ? offerWords.joined(joined.project.name, joined.tasks.length) : ""
  );

  async function answer(which: "accept" | "dismiss"): Promise<void> {
    pending = which;
    refused = "";
    try {
      const accepted = await answerProjectOffer(instanceId, which);
      if (accepted?.setupThread) {
        // A new project: Caw sets it up in its Setup thread, with the
        // session's plan already on its board.
        await goto(threadHref(accepted.setupThread.id));
      }
    } catch (error) {
      refused = failureWords(error);
    } finally {
      pending = null;
    }
  }

  /* The Prompt card's control dress (DESIGN.md tokens): 32px fine, 44 coarse. */
  const btn =
    "h-[var(--space-8)] pointer-coarse:h-11 gap-(--btn-gap) " +
    "[--btn-gap:var(--space-2)] [--btn-icon:12px] " +
    "rounded-[var(--radius-sm)] px-[var(--space-3)] text-label font-medium";
</script>

{#if joined && !offer}
  <!-- The answer, where the question stood: what it joined, the way there,
       and a way to put the card away. -->
  <section
    aria-label={offerWords.joinedLabel}
    class="offer"
    data-offer={instanceId}
    role="status"
  >
    <p class="line mark-line">
      <IconFolder data-project-offer-glyph aria-hidden="true" class="glyph" />
      <span>{joinedLine}</span>
    </p>
    <div data-slot="actions" class="actions">
      <Button
        class={btn}
        href="/project/{encodeURIComponent(joined.project.id)}"
        variant="outline">{offerWords.openProject(joined.project.name)}</Button
      >
      <Button
        aria-label={offerWords.putAway}
        class={btn}
        icon={IconClose}
        onclick={() => dismissProjectJoin(instanceId)}
        variant="ghost"
      />
    </div>
  </section>
{:else if offer}
  <section
    aria-label={offerWords.offerLabel}
    class="offer"
    data-offer={instanceId}
  >
    <p class="line mark-line">
      <IconFolder data-project-offer-glyph aria-hidden="true" class="glyph" />
      <span>{offer.line}</span>
    </p>
    <div data-slot="actions" class="actions">
      <Button
        class={btn}
        disabled={pending !== null}
        label={offerWords.notNow}
        onclick={() => answer("dismiss")}
        pending={pending === "dismiss"}
        variant="ghost"
      />
      <Button
        class={btn}
        disabled={pending !== null}
        failed={!!refused}
        icon={IconFolder}
        label={offerWords.createProject}
        onclick={() => answer("accept")}
        pending={pending === "accept"}
        pendingLabel={offerWords.makingProject}
      />
    </div>
    <RowFault data-project-offer-refused class="refused" reason={refused} />
  </section>
{/if}

<style>
  @keyframes offer-settle {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    padding: var(--space-3);
    box-shadow: var(--shadow-hairline, var(--shadow-tile));

    @media (prefers-reduced-motion: no-preference) {
      animation: offer-settle calc(var(--dur-control) * 2) var(--ease-out)
        backwards;
    }
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    flex: 1 1 24ch;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
  }
  .line :global(.glyph) {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
    color: var(--ink-muted);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    margin-inline-start: auto;
  }
  .offer > :global(.refused) {
    flex-basis: 100%;
  }
</style>
