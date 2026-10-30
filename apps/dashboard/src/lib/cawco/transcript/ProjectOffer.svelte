<script lang="ts">
  import type {
    ProjectOfferAccepted,
    ProjectOfferSummary,
  } from "@cawco/core/frames";
  /**
   * "Make this a project" (Projects §2, "Caw suggests, you escalate"): the
   * one offer a plain session gets when it outgrows itself, standing over the
   * composer with the parked asks. Quiet by design: no needs-you pill, no
   * attention hue, one sentence naming why, and two answers. Either answer is
   * the last word: a session is never offered again.
   */
  import { offerWords } from "@cawco/core/words/offers";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconFolder } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { answerProjectOffer, dismissProjectJoin } from "../client.svelte";
  import { rowHref } from "../links";
  import RowFault from "../RowFault.svelte";

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
      if (accepted?.conversation) {
        // A new project: its conversation sets it up, with the session's
        // plan already on its board.
        await goto(rowHref(accepted.conversation));
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
  <section
    aria-label={offerWords.joinedLabel}
    class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline motion-safe:animate-offer-settle"
    data-offer={instanceId}
    role="status"
  >
    <p
      class="mark-line flex items-center gap-space-2 min-w-0 grow shrink basis-c-offer-line text-size-body font-normal leading-body text-ink-strong"
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
        fit="prompt"
        href="/project/{encodeURIComponent(joined.project.id)}"
        size="sm"
        variant="outline">{offerWords.openProject(joined.project.name)}</Button
      >
      <Button
        aria-label={offerWords.putAway}
        icon={IconClose}
        onclick={() => dismissProjectJoin(instanceId)}
        size="icon-sm"
        variant="ghost"
      />
    </div>
  </section>
{:else if offer}
  <section
    aria-label={offerWords.offerLabel}
    class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline motion-safe:animate-offer-settle"
    data-offer={instanceId}
  >
    <p
      class="mark-line flex items-center gap-space-2 min-w-0 grow shrink basis-c-offer-line text-size-body font-normal leading-body text-ink-strong"
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
        fit="prompt"
        disabled={pending !== null}
        label={offerWords.notNow}
        onclick={() => answer("dismiss")}
        pending={pending === "dismiss"}
        size="sm"
        variant="ghost"
      />
      <Button
        fit="prompt"
        disabled={pending !== null}
        failed={!!refused}
        icon={IconFolder}
        label={offerWords.createProject}
        onclick={() => answer("accept")}
        pending={pending === "accept"}
        pendingLabel={offerWords.makingProject}
        size="sm"
      />
    </div>
    <RowFault data-project-offer-refused class="basis-full" reason={refused} />
  </section>
{/if}
