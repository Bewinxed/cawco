<script lang="ts">
  /**
   * Who decides on its state (WhoDecides): who answers each kind of choice
   * an agent can't make alone, and nothing else. The team stands first as a
   * row of chips, each opening its member's card (its settings and
   * figures), Add an agent last; under it each kind is a card holding its
   * name and the face of who answers it, pressed to change who; Add a kind
   * closes the grid at a kind card's size.
   *
   * A failure stands only while it is true: on a project's page a
   * decides.md that can't be read is said over the cards (every face is
   * then You), with the way to the file; a member that can't run wears the
   * attention dot on its face, why in its card; a page that couldn't be
   * read is the house's page fault. While it reads, the page's own shape
   * stands in skeletons. On a project's page the crumbs lead.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import RegionFault from "#lib/cawco/fault/RegionFault.svelte";
  import { animatedCaw } from "#lib/cawco/home/FaultCaw.svelte";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
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
</script>

<Tooltip.Provider>
  <div class="flex w-full min-w-0 flex-col gap-space-5" data-who-decides>
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
      <RegionFault
        caw={animatedCaw}
        details={who.read.reason}
        onreload={() => location.reload()}
        onretry={() => who.load()}
        room="page"
        what={decidesWords.pageName}
      />
    {:else if !shown}
      <div class="flex flex-wrap gap-space-2" aria-hidden="true">
        {#each [0, 1, 2, 3, 4] as at (at)}
          <Skeleton line="title" radius="chip" width="label" />
        {/each}
      </div>
      <div
        class="grid auto-rows-fr grid-cols-(--kind-cols) gap-space-3"
        style:--kind-cols={"repeat(auto-fill, minmax(min(100%, var(--c-roster-card-min)), 1fr))"}
      >
        {#each [0, 1, 2, 3, 4, 5] as at (at)}
          <Skeleton height="row" radius="card" />
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
      <div
        class="grid auto-rows-fr grid-cols-(--kind-cols) gap-space-3"
        style:--kind-cols={"repeat(auto-fill, minmax(min(100%, var(--c-roster-card-min)), 1fr))"}
      >
        {#each who.kinds as kind (kind.id)}
          <KindCard {facts} {kind} {named} {project} {who} />
        {/each}
        <NewKindCard {who} />
      </div>
    {/if}
  </div>
</Tooltip.Provider>
