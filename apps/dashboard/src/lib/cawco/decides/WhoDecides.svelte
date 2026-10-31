<script lang="ts">
  /**
   * Who decides (build spec §3): every member as a card holding the kinds
   * it decides, read from the hub.
   *
   * A project's page leads with its bar (the fleet, then the project; its
   * Decisions trailing), then the head: the title, the lede counting the
   * kinds the project handed over itself with the way to put them all back,
   * and the legend for the tiles' scope glyphs. A hand-over writes the
   * project's decides.md; a kind handed to the fleet's own choice follows
   * the fleet again.
   *
   * The fleet's page is Configure's section, its cards on the recessed
   * ground under the section's title and purpose: every kind is the fleet's own,
   * so no scope glyph, legend or put-back; a hand-over writes the fleet's
   * table.
   *
   * A read that failed stands in the page with the hub's words and Try
   * again; decides.md that doesn't read is said under the head, every kind
   * his until it does.
   */
  import type { Member } from "@cawco/core/decides";
  import { configureWords } from "@cawco/core/words/configure";
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconFolder, IconGlobe } from "#lib/icons.js";
  import { WhoDecides } from "./decides.svelte";
  import Roster from "./Roster.svelte";

  let { projectId }: { projectId: string | null } = $props();

  const section = sectionOf("decides");

  const who = new WhoDecides(untrack(() => projectId));
  $effect(() => {
    untrack(() => who.load());
  });

  const project = $derived(
    projectId === null
      ? undefined
      : cawco.projects.find((one) => one.id === projectId)
  );
  /** The project's name as the page says it; empty until the hub's list has it, while the page waits. */
  const name = $derived(project?.name ?? "");
  /** Read, and on a project's page its name known. */
  const ready = $derived(
    who.read.state === "read" && (projectId === null || project !== undefined)
  );
  const facts = (member: Member) => who.facts(member, project);
  const projectHref = $derived(
    projectId === null ? "" : `/project/${encodeURIComponent(projectId)}`
  );
</script>

{#snippet roster()}
  {#if who.read.state === "failed"}
    <RowFault again={() => who.load()} reason={who.read.reason} />
  {:else if !ready}
    <div
      class="grid grid-cols-(--roster-cols) gap-space-3"
      style:--roster-cols={"repeat(auto-fill, minmax(max(min(100%, var(--c-roster-card-min)), calc((100% - 3 * var(--space-3)) / 4)), 1fr))"}
    >
      {#each [0, 1, 2, 3] as at (at)}
        <Skeleton height="board" radius="card" />
      {/each}
    </div>
  {:else}
    {#if who.problems.length > 0}
      <p class="type-meta text-status-fail-ink text-pretty" role="alert">
        {decidesWords.fileProblems(who.problems.join(" "))}
      </p>
    {/if}
    <Roster
      asking={who.asking}
      {facts}
      fault={who.fault}
      fleetRoutes={who.fleetRoutes}
      bind:handing={who.handing}
      kinds={who.kinds}
      members={who.members}
      onhand={who.handTo}
      onputback={(kind) => who.useFleet([kind])}
      own={who.own}
      project={projectId === null ? null : name}
      routes={who.routes}
    />
  {/if}
{/snippet}

<svelte:head>
  {#if projectId === null}
    <title>{configureWords.documentTitle(section.label)}</title>
  {:else if project}
    <title>{decidesWords.title(name)} · CawCo</title>
  {/if}
</svelte:head>

<Tooltip.Provider>
  {#if projectId === null}
    <!-- Configure's section, its cards straight on the recessed ground: the
         section template's raised body would hold them card in card. -->
    <div
      class="flex min-h-0 min-w-0 flex-auto flex-col overflow-y-auto bg-surface-recess px-space-5 py-space-2"
    >
      <div
        class="flex max-w-c-config-max-w min-w-0 flex-col gap-space-5 py-space-6"
      >
        <header class="flex min-w-0 flex-col gap-space-1">
          <h1
            class="m-0 type-title tracking-title text-balance text-ink-strong"
          >
            {section.label}
          </h1>
          <p class="m-0 text-pretty">{section.purpose}</p>
        </header>
        {@render roster()}
      </div>
    </div>
  {:else}
    <div
      class="min-w-0 flex-auto overflow-y-auto pt-space-5 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 max-phone:py-space-4"
    >
      <div class="flex flex-col gap-space-5">
        <nav
          aria-label={decidesWords.crumbs}
          class="flex flex-wrap items-baseline justify-between gap-x-space-4 gap-y-space-1 type-label"
        >
          <ol
            class="m-0 flex min-w-0 list-none flex-wrap items-baseline gap-x-space-2 p-0"
          >
            <li class="min-w-0">
              <a
                class="text-ink-muted wrap-anywhere can-hover:hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
                href="/config/decides">{decidesWords.fleet}</a
              >
            </li>
            <li aria-hidden="true" class="text-ink-muted">/</li>
            <li class="min-w-0">
              {#if project}
                <a
                  class="text-ink-strong wrap-anywhere can-hover:hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
                  href={projectHref}>{name}</a
                >
              {:else}
                <Skeleton line="label" radius="text" width="name" />
              {/if}
            </li>
          </ol>
          <a
            class="flex-none text-link-ink underline-offset-2 can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
            href="{projectHref}?view=decisions">{decidesWords.decisions}</a
          >
        </nav>
        <header class="flex min-w-0 flex-col gap-space-2">
          {#if project}
            <h1
              class="m-0 type-title text-balance text-ink-strong wrap-anywhere"
            >
              {decidesWords.title(name)}
            </h1>
          {:else}
            <Skeleton line="title" radius="text" width="title" />
          {/if}
          {#if ready}
            <p class="m-0 type-body text-pretty text-ink-muted">
              {who.own.length === 0
                ? decidesWords.follows(name)
                : decidesWords.except(name, who.own.length)}
              {#if who.own.length > 0}
                <button
                  aria-disabled={who.asking !== null || undefined}
                  class="text-brand-ink underline underline-offset-2 can-hover:hover:not-aria-disabled:text-brand-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs aria-disabled:text-ink-muted"
                  onclick={() => {
                    if (who.asking === null) {
                      who.useFleet(who.own);
                    }
                  }}
                  type="button"
                  >{decidesWords.putAllBack(who.own.length)}</button
                >
              {/if}
            </p>
            <ul
              class="m-0 flex list-none flex-wrap items-center gap-x-space-4 gap-y-space-1 p-0 type-meta text-ink-muted"
            >
              <li class="mark-line flex items-center gap-x-space-1">
                <IconGlobe aria-hidden="true" class="size-icon-sm" />
                <span>{decidesWords.followsFleet}</span>
              </li>
              <li class="mark-line flex min-w-0 items-center gap-x-space-1">
                <IconFolder aria-hidden="true" class="size-icon-sm flex-none" />
                <span class="wrap-anywhere">{decidesWords.own(name)}</span>
              </li>
            </ul>
          {/if}
        </header>
        {@render roster()}
      </div>
    </div>
  {/if}
</Tooltip.Provider>
