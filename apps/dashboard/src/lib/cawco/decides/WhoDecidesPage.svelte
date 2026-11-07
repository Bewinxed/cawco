<script lang="ts">
  /**
   * Who decides on its state (WhoDecides): who answers each kind of choice
   * an agent can't make alone. The team stands first as a row of chips,
   * each opening its member's card; under it each kind is a card, its face
   * trailing (who answers it, pressed to hand it over) and the latest
   * questions agents asked of it under its name. Add a kind closes the
   * grid. No figure stands here: a member's figures are in its card.
   *
   * On a project's page the crumbs lead (the fleet, then the project, its
   * Decisions trailing), and a kind the project set itself carries the
   * folder; a decides.md that doesn't read is said over the cards, every
   * kind his until it does. A read that failed stands with the hub's words
   * and Try again; while it reads, the page's own shape stands in skeletons.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import type { WhoDecides } from "./decides.svelte";
  import KindCard from "./KindCard.svelte";
  import NewKindCard from "./NewKindCard.svelte";
  import TeamRow from "./TeamRow.svelte";

  let {
    who,
    project,
    named = (ids) => ids,
    facts = () => null,
    ready,
  }: {
    who: WhoDecides;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The projects' names, by their ids. */
    named?: (ids: string[]) => string[];
    /** Why a member can't be reached now; null when it can. */
    facts?: (id: string) => string | null;
    /** Read, and on a project's page its name known; read alone when unsaid. */
    ready?: boolean;
  } = $props();

  const shown = $derived(ready ?? who.read.state === "read");
  const projectHref = $derived(
    who.projectId === null
      ? ""
      : `/project/${encodeURIComponent(who.projectId)}`
  );
  const waitingHref = (projectId: string | null) =>
    projectId === null
      ? "/session"
      : `/project/${encodeURIComponent(projectId)}?view=decisions`;
</script>

<Tooltip.Provider>
  <div
    class="flex w-full max-w-c-config-max-w min-w-0 flex-col gap-space-5"
    data-who-decides
  >
    {#if who.projectId !== null}
      <nav
        aria-label={decidesWords.crumbs}
        class="flex flex-wrap items-baseline justify-between gap-x-space-4 gap-y-space-1 type-label"
      >
        <ol
          class="m-0 flex min-w-0 list-none flex-wrap items-baseline gap-x-space-2 p-0"
        >
          <li class="min-w-0">
            <a
              class="rounded-xs text-ink-muted wrap-anywhere can-hover:hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
              href="/config/decides">{decidesWords.fleet}</a
            >
          </li>
          <li aria-hidden="true" class="text-ink-muted">/</li>
          <li class="min-w-0">
            {#if project}
              <a
                class="rounded-xs text-ink-strong wrap-anywhere can-hover:hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
                href={projectHref}>{project}</a
              >
            {:else}
              <Skeleton line="label" radius="text" width="name" />
            {/if}
          </li>
        </ol>
        <a
          class="flex-none rounded-xs text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
          href="{projectHref}?view=decisions">{decidesWords.decisions}</a
        >
      </nav>
    {/if}

    {#if who.read.state === "failed"}
      <RowFault again={() => who.load()} reason={who.read.reason} />
    {:else if !shown}
      <div class="flex flex-wrap gap-space-2" aria-hidden="true">
        {#each [0, 1, 2, 3, 4] as at (at)}
          <Skeleton line="title" radius="chip" width="label" />
        {/each}
      </div>
      <div
        class="grid grid-cols-(--kind-cols) gap-space-3"
        style:--kind-cols={"repeat(auto-fill, minmax(min(100%, var(--c-roster-card-min)), 1fr))"}
      >
        {#each [0, 1, 2, 3, 4, 5] as at (at)}
          <Skeleton height="board" radius="card" />
        {/each}
      </div>
    {:else}
      <TeamRow {facts} {project} {who} />
      {#if who.problems.length > 0 && who.projectId !== null}
        <div
          class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-meta"
          role="alert"
        >
          <p class="min-w-0 text-status-attn-ink text-pretty">
            {decidesWords.fileProblems(who.problems.join(" "))}
          </p>
          <a
            class="rounded-xs text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
            href={folderFileHref(who.projectId, "decides.md")}
            >{decidesWords.openFile}</a
          >
        </div>
      {/if}
      {#if who.recent.state === "failed"}
        <RowFault again={() => who.loadRecent()} reason={who.recent.reason} />
      {/if}
      <div
        class="grid grid-cols-(--kind-cols) gap-space-3"
        style:--kind-cols={"repeat(auto-fill, minmax(min(100%, var(--c-roster-card-min)), 1fr))"}
      >
        {#each who.kinds as kind (kind.id)}
          <KindCard {facts} {kind} {named} {project} {waitingHref} {who} />
        {/each}
        <NewKindCard {who} />
      </div>
    {/if}
  </div>
</Tooltip.Provider>
