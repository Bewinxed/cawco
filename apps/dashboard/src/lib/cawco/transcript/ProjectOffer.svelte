<script lang="ts">
  /**
   * "Make this a project" (Projects §2, "Caw suggests, you escalate"): the
   * one offer a plain session gets when it outgrows itself, standing over the
   * composer with the parked asks. Quiet by design: no needs-you pill, no
   * attention hue, one sentence naming why, and two answers. Either answer is
   * the last word: a session is never offered again.
   */
  import type { ProjectOfferSummary } from "@cawco/core";
  import { toast } from "svelte-sonner";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconFolder } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { answerProjectOffer } from "../client.svelte";
  import { threadHref } from "../thread-tabs";

  let { offer }: { offer: ProjectOfferSummary } = $props();

  let pending = $state<"accept" | "dismiss" | null>(null);
  let refused = $state("");

  async function answer(which: "accept" | "dismiss"): Promise<void> {
    pending = which;
    refused = "";
    try {
      const accepted = await answerProjectOffer(offer.instanceId, which);
      if (accepted?.setupThread) {
        // A new project: Caw sets it up in its Setup thread, with the
        // session's plan already on its board.
        await goto(threadHref(accepted.setupThread.id));
      } else if (accepted) {
        const filed = accepted.tasks.length;
        toast.success(
          `Joined ${accepted.project.name}${
            filed
              ? `, with ${filed} proposed ${filed === 1 ? "task" : "tasks"} from the plan`
              : ""
          }.`
        );
      }
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
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

<section aria-label="Make this session a project" class="offer">
  <p class="line">
    <IconFolder aria-hidden="true" class="glyph" />
    <span>{offer.line}</span>
  </p>
  <div class="actions">
    <Button
      class={btn}
      disabled={pending !== null}
      label="Not now"
      onclick={() => answer("dismiss")}
      pending={pending === "dismiss"}
      variant="ghost"
    />
    <Button
      class={btn}
      disabled={pending !== null}
      failed={!!refused}
      icon={IconFolder}
      label="Create project"
      onclick={() => answer("accept")}
      pending={pending === "accept"}
      pendingLabel="Making project…"
    />
  </div>
  {#if refused}
    <p class="refused" role="status">{refused}</p>
  {/if}
</section>

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
  .refused {
    flex-basis: 100%;
    font-size: var(--text-meta);
    color: var(--status-fail-ink);
  }
</style>
