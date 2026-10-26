<script lang="ts">
  /**
   * Project details › Who decides (core decides.ts; the who-decides page's
   * card 2): the project's table in one line, kinds grouped by route, and
   * Change, which opens the table in place (DESIGN.md, The Open Page Rule).
   * A row whose route is the fleet's says "Fleet default". Under the table,
   * Yours: the paths whose change needs a decision you made, each with
   * Remove, and Add; then Edit decides.md, as Merge checks has Edit gate.md.
   *
   * Every change writes decides.md in the project's folder (`PUT
   * /api/projects/:id/folder/file`), its notes after the block kept, and the
   * row then shows the table the hub reads from it (`GET
   * /api/projects/:id/decides`). A kind set back to the fleet's route leaves
   * the file, so the project follows the fleet for it again. A decides.md
   * that does not read is the person's everywhere (hub decides-file.ts): its
   * problems stand in the row and only the file can be edited.
   */
  import {
    DECISION_KIND_WORDS,
    DEFAULT_ADVISOR,
    type DecidesRoute,
    type DecidesTable,
    type DecisionKind,
    decidesSummary,
    type FleetDecides,
    fleetRoutes,
    ROUTE_WORDS,
  } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { folderFileHref } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconPlus } from "#lib/icons.js";
  import {
    ownOf,
    readFleetDecides,
    readProjectDecides,
    saveProjectDecides,
  } from "./decides-client.js";
  import WhoDecidesTable from "./WhoDecidesTable.svelte";

  let {
    narrow = "short",
    projectId,
  }: {
    projectId: string;
    /** Where the four don't fit their row (WhoDecidesTable). */
    narrow?: "short" | "menu" | "scroll";
  } = $props();

  const uid = $props.id();

  type Read =
    | { state: "reading" }
    | { state: "failed"; reason: string }
    | {
        state: "read";
        table: DecidesTable;
        file: string;
        fleet: FleetDecides;
      };

  let read = $state<Read>({ state: "reading" });
  let asked = 0;

  async function load(id: string): Promise<void> {
    asked += 1;
    const mine = asked;
    read = { state: "reading" };
    try {
      const [project, fleet] = await Promise.all([
        readProjectDecides(id),
        readFleetDecides(),
      ]);
      if (mine === asked) {
        read = {
          state: "read",
          table: project.decides,
          file: project.file,
          fleet,
        };
      }
    } catch (error) {
      if (mine === asked) {
        read = { state: "failed", reason: failureWords(error) };
      }
    }
  }

  $effect(() => {
    load(projectId);
  });

  let open = $state(false);
  let pending = $state<{ kind: DecisionKind; route: DecidesRoute } | null>(
    null
  );
  let fault = $state<{
    kind: DecisionKind;
    route: DecidesRoute;
    reason: string;
  } | null>(null);

  const fleet = $derived(
    read.state === "read" ? fleetRoutes(read.fleet) : null
  );

  /** Writes decides.md from the table read, changed by `change`, and shows what the hub reads back. */
  async function write(
    change: (own: ReturnType<typeof ownOf>) => void,
    message: string
  ): Promise<void> {
    if (read.state !== "read") {
      return;
    }
    const own = ownOf(read.table, read.fleet.advisor ?? DEFAULT_ADVISOR);
    change(own);
    const table = await saveProjectDecides(projectId, read.file, own, message);
    read = { ...read, table };
  }

  async function route(kind: DecisionKind, next: DecidesRoute): Promise<void> {
    if (pending || !fleet) {
      return;
    }
    pending = { kind, route: next };
    fault = null;
    try {
      await write((own) => {
        if (next === fleet[kind]) {
          delete own.routes[kind];
        } else {
          own.routes[kind] = next;
        }
      }, `Who decides: ${DECISION_KIND_WORDS[kind].name} goes to ${ROUTE_WORDS[next].line}`);
    } catch (error) {
      fault = { kind, route: next, reason: failureWords(error) };
    } finally {
      pending = null;
    }
  }

  /* ── Yours ─────────────────────────────────────────────────────── */

  let adding = $state(false);
  let addPath = $state("");
  /** The path being added or removed. */
  let yoursPending = $state<string | null>(null);
  let yoursFault = $state<{ again: () => void; reason: string } | null>(null);

  async function changeYours(
    path: string,
    next: (paths: string[]) => string[],
    message: string
  ): Promise<boolean> {
    if (yoursPending) {
      return false;
    }
    yoursPending = path;
    yoursFault = null;
    try {
      await write((own) => {
        own.yours = next(own.yours);
      }, message);
      return true;
    } catch (error) {
      yoursFault = {
        again: () => changeYours(path, next, message),
        reason: failureWords(error),
      };
      return false;
    } finally {
      yoursPending = null;
    }
  }

  async function add(): Promise<void> {
    const path = addPath.trim();
    if (!path) {
      return;
    }
    const done = await changeYours(
      path,
      (paths) => (paths.includes(path) ? paths : [...paths, path]),
      `Who decides: ${path} is yours`
    );
    if (done) {
      addPath = "";
      adding = false;
    }
  }

  const remove = (path: string) =>
    changeYours(
      path,
      (paths) => paths.filter((each) => each !== path),
      `Who decides: ${path} is no longer yours alone`
    );
</script>

<div
  data-slot="row"
  class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
  data-detail="decides"
>
  <p
    data-slot="project-details-label"
    class="type-label pt-space-1 text-ink-muted"
    id="{uid}-label"
  >
    Who decides
  </p>
  <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
    {#if read.state === "reading"}
      <p
        data-slot="note"
        class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
      >
        <LiveDot /><span>Reading decides.md…</span>
      </p>
    {:else if read.state === "failed"}
      <RowFault again={() => load(projectId)} reason={read.reason} />
    {:else if read.table.problems.length > 0}
      {#each read.table.problems as problem, at (at)}
        <RowFault reason={problem} />
      {/each}
      <p data-slot="note" class="type-meta text-ink-muted">
        Until decides.md reads, every kind is yours.
      </p>
    {:else}
      {@const table = read.table}
      <div class="flex min-w-0 items-start justify-between gap-space-2">
        {#if open}
          <p class="type-meta text-ink-muted">
            Who settles each kind of question an agent can't answer alone.
          </p>
        {:else}
          <p
            class="min-w-0 type-label text-pretty text-ink-strong"
            data-decides-summary
          >
            {decidesSummary(table.routes)}
          </p>
        {/if}
        <Button
          aria-controls="{uid}-table"
          aria-expanded={open}
          data-decides-change
          label={open ? "Done" : "Change"}
          onclick={() => {
            open = !open;
          }}
          size="xs"
          variant="ghost"
        />
      </div>
      {#if open}
        <div
          class="flex min-w-0 flex-col gap-space-3"
          id="{uid}-table"
          transition:unfold
        >
          <WhoDecidesTable
            {narrow}
            {fault}
            {fleet}
            label="Who decides on this project"
            onchange={route}
            {pending}
            routes={table.routes}
          />
          <div
            class="flex min-w-0 flex-col gap-space-1 border-t border-border-hairline pt-space-3"
            data-decides-yours
          >
            <div class="flex items-center justify-between gap-space-2">
              <span class="type-label text-ink-strong" id="{uid}-yours"
                >Yours</span
              >
              {#if !adding}
                <Button
                  data-yours-add
                  icon={IconPlus}
                  label="Add"
                  onclick={() => {
                    adding = true;
                  }}
                  size="xs"
                  variant="ghost"
                />
              {/if}
            </div>
            <p class="type-meta text-pretty text-ink-muted">
              Work that changes these files waits for a decision you made.
            </p>
            {#if table.yours.length > 0}
              <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops list semantics when list styles are removed; an explicit role="list" keeps them -->
              <ul
                aria-labelledby="{uid}-yours"
                class="m-0 flex list-none flex-col p-0"
                role="list"
              >
                <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
                {#each table.yours as path (path)}
                  <li
                    class="flex min-w-0 items-center justify-between gap-space-2"
                    data-yours-path={path}
                  >
                    <code
                      class="min-w-0 type-meta font-mono wrap-anywhere text-ink-strong"
                      >{path}</code
                    >
                    <Button
                      disabled={yoursPending !== null && yoursPending !== path}
                      label="Remove"
                      onclick={() => remove(path)}
                      pending={yoursPending === path}
                      pendingLabel="Removing…"
                      size="xs"
                      variant="ghost"
                    />
                  </li>
                {/each}
              </ul>
            {/if}
            {#if adding}
              <form
                class="flex min-w-0 flex-wrap items-center gap-space-2 pt-space-1"
                data-yours-form
                onsubmit={(event) => {
                  event.preventDefault();
                  add();
                }}
                transition:unfold
              >
                <Input
                  aria-label="A path from the repository's root"
                  autocomplete="off"
                  class="min-w-0 flex-auto basis-c-project-details-select-w"
                  placeholder="DESIGN.md"
                  spellcheck="false"
                  text="label"
                  bind:value={addPath}
                />
                <div class="flex gap-space-2">
                  <Button
                    label="Cancel"
                    onclick={() => {
                      adding = false;
                      addPath = "";
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  />
                  <Button
                    disabled={!addPath.trim()}
                    label="Add"
                    pending={yoursPending === addPath.trim()}
                    pendingLabel="Adding…"
                    size="sm"
                    type="submit"
                  />
                </div>
              </form>
            {/if}
            <RowFault again={yoursFault?.again} reason={yoursFault?.reason} />
          </div>
        </div>
      {/if}
    {/if}
    <Button
      class="self-start"
      pad="none"
      data-decides-edit
      href={folderFileHref(
        projectId,
        read.state === "read" ? read.file : "decides.md"
      )}
      label="Edit decides.md"
      size="xs"
      variant="link"
    />
  </div>
</div>
