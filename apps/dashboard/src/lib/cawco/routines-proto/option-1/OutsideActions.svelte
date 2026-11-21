<script lang="ts">
  /**
   * What the routines' runs asked to do outside CawCo, across every
   * routine: those waiting on the person first (Decide goes where CawCo
   * collects what needs them), then the failed ones (what the service
   * answered, Mark as looked at), then the rest by when. Each says what it
   * does in its proposer's words, the service and account, and which
   * routine asked.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconError, IconNeedsYou, IconSuccessLinear } from "#lib/icons.js";
  import type { OutsideAction } from "./harbor";

  let {
    actions,
    ondecide,
    onlooked,
  }: {
    actions: OutsideAction[];
    /** Decide: to where CawCo collects what needs the person. */
    ondecide: (id: string) => void;
    /** The person has looked at a failed one. */
    onlooked: (id: string) => void;
  } = $props();

  const ORDER = { waits: 0, failed: 1, ran: 2 } as const;
  const sorted = $derived(
    [...actions].sort((a, b) => ORDER[a.standing] - ORDER[b.standing])
  );
  const WORDS = {
    waits: "Waits on you",
    failed: "Failed",
    ran: "Ran",
  } as const;
</script>

<section aria-labelledby="routines-outside" class="flex flex-col gap-space-1">
  <h3
    id="routines-outside"
    class="flex items-center gap-space-2 m-0 ps-space-2 type-label text-ink-muted scroll-mt-space-4"
  >
    <span>Asked to do outside</span>
    <Badge size="tally" variant="secondary"><span>{actions.length}</span></Badge
    >
  </h3>
  <ul class="flex flex-col m-0 p-0 list-none">
    {#each sorted as action (action.id)}
      <li class="flex items-start gap-space-3 py-space-3 ps-space-2 pe-space-1">
        <span class="flex h-lh items-center type-label">
          <span class="sr-only">{WORDS[action.standing]}</span>
          {#if action.standing === "waits"}
            <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
          {:else if action.standing === "failed"}
            <IconError class="size-icon-md text-status-fail-glyph" />
          {:else}
            <IconSuccessLinear class="size-icon-md text-status-done-glyph" />
          {/if}
        </span>
        <div class="flex min-w-0 flex-auto flex-col gap-space-1">
          <span class="type-label text-ink-strong wrap-anywhere"
            >{action.what}</span
          >
          <span class="type-meta num text-ink-muted"
            >{WORDS[action.standing]} · {action.at}</span
          >
          {#if action.said}
            <span class="type-body text-status-fail-ink wrap-anywhere"
              >{action.service.split(" · ")[0]} answered: {action.said}</span
            >
          {/if}
          <span class="type-meta text-ink-muted"
            >{action.service} · from {action.from}</span
          >
          {#if action.standing === "waits"}
            <span class="pt-space-1"
              ><Button
                label="Decide"
                onclick={() => ondecide(action.id)}
                size="xs"
                variant="outline"
              /></span
            >
          {:else if action.standing === "failed"}
            <span class="pt-space-1"
              ><Button
                label="Mark as looked at"
                onclick={() => onlooked(action.id)}
                size="xs"
                variant="ghost"
              /></span
            >
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>
