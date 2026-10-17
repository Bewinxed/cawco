<script lang="ts">
  /**
   * "Make this a project" (Projects §2, "Caw suggests, you escalate"): the
   * one offer a plain session gets when it outgrows itself, standing over the
   * composer with the parked asks. Quiet by design: no needs-you pill, no
   * attention hue, one sentence naming why, and two answers. Either answer is
   * the last word: a session is never offered again.
   */
  import type { ProjectOfferSummary } from "@cawco/core";
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

  const joinedLine = $derived.by(() => {
    if (!joined) {
      return "";
    }
    const filed = joined.tasks.length;
    return `Joined ${joined.project.name}${
      filed
        ? `, with ${filed} proposed ${filed === 1 ? "task" : "tasks"} from the plan`
        : ""
    }.`;
  });

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
</script>

{#if joined && !offer}
  <!-- The answer, where the question stood: what it joined, the way there,
       and a way to put the card away. -->
  <!-- literal: 8px -->
  <section
    aria-label="Joined a project"
    class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline"
    data-offer={instanceId}
    role="status"
    style:--settle="8px"
  >
    <!-- literal: 1 1 24ch -->
    <p
      class="mark-line flex items-center gap-space-2 min-w-0 flex-(--line-flex) text-size-body font-normal leading-body text-ink-strong"
      style:--line-flex="1 1 24ch"
    >
      <IconFolder
        data-project-offer-glyph
        aria-hidden="true"
        class="size-icon-md flex-none text-ink-muted"
      />
      <span>{joinedLine}</span>
    </p>
    <div data-slot="actions" class="flex gap-space-2 ms-auto">
      <Button
        class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
        style="--btn-gap: var(--space-2); --btn-icon: var(--icon-sm); --btn-h-coarse: 44px"
        href="/project/{encodeURIComponent(joined.project.id)}"
        variant="outline">Open {joined.project.name}</Button
      >
      <Button
        aria-label="Put this away"
        class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
        style="--btn-gap: var(--space-2); --btn-icon: var(--icon-sm); --btn-h-coarse: 44px"
        icon={IconClose}
        onclick={() => dismissProjectJoin(instanceId)}
        variant="ghost"
      />
    </div>
  </section>
{:else if offer}
  <!-- literal: 8px -->
  <section
    aria-label="Make this session a project"
    class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline"
    data-offer={instanceId}
    style:--settle="8px"
  >
    <!-- literal: 1 1 24ch -->
    <p
      class="mark-line flex items-center gap-space-2 min-w-0 flex-(--line-flex) text-size-body font-normal leading-body text-ink-strong"
      style:--line-flex="1 1 24ch"
    >
      <IconFolder
        data-project-offer-glyph
        aria-hidden="true"
        class="size-icon-md flex-none text-ink-muted"
      />
      <span>{offer.line}</span>
    </p>
    <div data-slot="actions" class="flex gap-space-2 ms-auto">
      <Button
        class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
        style="--btn-gap: var(--space-2); --btn-icon: var(--icon-sm); --btn-h-coarse: 44px"
        disabled={pending !== null}
        label="Not now"
        onclick={() => answer("dismiss")}
        pending={pending === "dismiss"}
        variant="ghost"
      />
      <Button
        class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
        style="--btn-gap: var(--space-2); --btn-icon: var(--icon-sm); --btn-h-coarse: 44px"
        disabled={pending !== null}
        failed={!!refused}
        icon={IconFolder}
        label="Create project"
        onclick={() => answer("accept")}
        pending={pending === "accept"}
        pendingLabel="Making project…"
      />
    </div>
    <RowFault data-project-offer-refused class="basis-full" reason={refused} />
  </section>
{/if}

<style>
  /* residual: keyframes */
  @keyframes offer-settle {
    from {
      opacity: 0;
      translate: 0 var(--settle);
    }
  }
  [data-offer] {
    @media (prefers-reduced-motion: no-preference) {
      animation: offer-settle calc(var(--dur-control) * 2) var(--ease-out)
        backwards;
    }
  }
</style>
