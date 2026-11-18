<script lang="ts">
  import { hubRequest } from "@cawco/core/hub-request";
  /**
   * The project's details tray: its Who decides row (build spec §3.1). It
   * says whether the project follows the fleet on every kind of choice, or
   * how many it handed over itself, at the weight of a value, with the way
   * to its Who decides; what else governs who finishes work stands under it
   * (`children`). Read from the hub as the tray opens; a failed read says so
   * with Try again.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { type Snippet, untrack } from "svelte";
  import { hubSeam } from "#lib/cawco/hub-live.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import type { ProjectDecides } from "./decides-client";

  let {
    projectId,
    children,
  }: {
    projectId: string;
    /** What stands under its line in the same row. */
    children?: Snippet;
  } = $props();

  const hub = hubSeam();

  type Read =
    | { state: "reading" }
    | { state: "failed"; reason: string }
    | { state: "read"; own: number; problems: boolean };
  let read = $state<Read>({ state: "reading" });

  async function load(id: string): Promise<void> {
    read = { state: "reading" };
    try {
      const { decides } = await hub.read<ProjectDecides>(
        hubRequest("GET /api/projects/:id/decides", { path: { id } })
      );
      read = {
        state: "read",
        own: Object.values(decides.from).filter((from) => from === "project")
          .length,
        problems: decides.problems.length > 0,
      };
    } catch (error) {
      read = { state: "failed", reason: failureWords(error) };
    }
  }
  $effect(() => {
    const id = projectId;
    untrack(() => load(id));
  });

  const line = $derived.by(() => {
    if (read.state !== "read") {
      return "";
    }
    if (read.problems) {
      return decidesWords.detailsUnread;
    }
    return read.own === 0
      ? decidesWords.detailsFollows
      : decidesWords.detailsExcept(read.own);
  });
</script>

<div
  class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
  data-detail="decides"
  data-slot="row"
>
  <p
    class="type-label pt-space-1 text-ink-muted"
    data-slot="project-details-label"
  >
    {decidesWords.detailsLabel}
  </p>
  <div class="flex min-w-0 flex-col gap-space-2 pt-space-1" data-slot="value">
    {#if read.state === "reading"}
      <Skeleton line="body" radius="text" width="name" />
    {:else if read.state === "failed"}
      <RowFault again={() => load(projectId)} reason={read.reason} />
    {:else}
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <p
          class={[
            "m-0 min-w-0 type-row wrap-anywhere",
            read.problems ? "text-status-fail-ink" : "text-ink-strong",
          ]}
          data-decides-line
        >
          {line}
        </p>
        <Button
          data-decides-open
          href="/project/{encodeURIComponent(projectId)}/decides"
          label={decidesWords.detailsOpen}
          size="xs"
          variant="secondary"
        />
      </div>
    {/if}
    {@render children?.()}
  </div>
</div>
