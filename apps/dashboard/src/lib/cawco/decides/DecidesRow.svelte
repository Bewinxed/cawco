<script lang="ts">
  /**
   * The project's details tray: its Who decides row (build spec §3.1). It
   * says whether the project follows the fleet on every kind of choice, or
   * how many it handed over itself, and is the link to its Who decides.
   * Read from the hub as the tray opens; a failed read says so with Try
   * again.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { readProject } from "./decides-client";

  let { projectId }: { projectId: string } = $props();

  type Read =
    | { state: "reading" }
    | { state: "failed"; reason: string }
    | { state: "read"; own: number; problems: boolean };
  let read = $state<Read>({ state: "reading" });

  async function load(id: string): Promise<void> {
    read = { state: "reading" };
    try {
      const { decides } = await readProject(id);
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
  <div class="flex min-w-0 flex-col gap-space-1 pt-space-1" data-slot="value">
    {#if read.state === "reading"}
      <Skeleton line="label" radius="text" width="name" />
    {:else if read.state === "failed"}
      <RowFault again={() => load(projectId)} reason={read.reason} />
    {:else}
      <a
        class={[
          "self-start rounded-xs type-label underline-offset-2 wrap-anywhere can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
          read.problems ? "text-status-fail-ink" : "text-link-ink",
        ]}
        href="/project/{encodeURIComponent(projectId)}/decides">{line}</a
      >
    {/if}
  </div>
</div>
