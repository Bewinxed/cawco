<script lang="ts">
  /**
   * PROJECT HEAD BENCH (dev only): a project's head as its tab draws it in
   * a split, at every width a split gives it, with no hub. The real
   * ProjectHead in panes of the workspace's own frame (PaneLeaf's
   * `@container/leaf` on the recessed field), fed the client's own state
   * (`__cawcoDebug`): three projects as the hub sends them. Built
   * (`vite build --mode bench`, the preview), it draws the hub's own
   * project of the same name.
   *
   * `?p=` the project: `cawco` (a checkout on obelisk, Linux), `long` (a
   * long name, a checkout on kestrel, macOS) or `none` (no place yet).
   * `?w=` one pane at that width (px); without it, a pane at each width a
   * split gives a project at 1440 (12% of the field the narrowest, its
   * half, a third, and the whole field); `?widths=145,200,286` names them.
   * `?rename` opens each name's field.
   *
   * `?option=one-row` draws the alternative to the two-line head for the
   * decision page `project-head-narrow`: under head-row the head keeps one
   * row, Caw's seat leaves it (folded into More) and the name ends in its
   * ellipsis beside More. Drawn over the real head by the bench pane's
   * classes; the head itself builds the two-line answer.
   */
  import { DAY_MS } from "@cawco/core/time";
  import { onMount, tick } from "svelte";
  import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { page } from "$app/state";

  const now = Date.now();
  const at = new Date(now - DAY_MS).toISOString();

  const MACHINES: Record<string, Machine> = {
    obelisk: {
      machineId: "obelisk",
      hostname: "obelisk",
      os: "linux",
    } as Machine,
    kestrel: {
      machineId: "kestrel",
      hostname: "kestrel",
      os: "darwin",
    } as Machine,
  };

  const place = (projectId: string, machineId: string, path: string) => ({
    createdAt: at,
    id: `${projectId}-place`,
    isPrimary: true,
    kind: "checkout" as const,
    machineId,
    path,
    projectId,
    within: [],
  });

  const row = (
    id: string,
    name: string,
    places: ProjectRow["places"]
  ): ProjectRow =>
    ({
      id,
      name,
      account: null,
      accountAtLimit: "wait",
      cawHarness: "claude",
      cawModel: null,
      conversationInstanceId: null,
      createdAt: at,
      eventsOn: true,
      lands: "main",
      lfsConnection: null,
      lfsUrl: null,
      links: [],
      places,
      primaryPlaceId: places[0]?.id ?? null,
      review: false,
    }) as ProjectRow;

  const PROJECTS: Record<string, { row: ProjectRow; machine: Machine | null }> =
    {
      cawco: {
        row: row("cawco", "Cawco", [
          place("cawco", "obelisk", "/home/bewinxed/cockpit"),
        ]),
        machine: MACHINES.obelisk,
      },
      long: {
        row: row("long", "Personal PR team for job hunts, visas and travel", [
          place("long", "kestrel", "/Users/rand/pr-team"),
        ]),
        machine: MACHINES.kestrel,
      },
      none: {
        row: row("none", "Private office", []),
        machine: null,
      },
    };

  const asked = page.url.searchParams.get("p") ?? "cawco";
  const chosen = PROJECTS[asked] ?? PROJECTS.cawco;
  const one = Number(page.url.searchParams.get("w")) || null;
  /** At 1440 the field beside the 228px rail is 1212px; 12% is a split's floor (PaneGrid `minSize`). */
  const listed = (page.url.searchParams.get("widths") ?? "")
    .split(",")
    .map(Number)
    .filter((width) => width > 0);
  const named = listed.length > 0 ? listed : [145, 200, 286, 404, 606, 1212];
  const WIDTHS = one ? [one] : named;
  const option = page.url.searchParams.get("option");

  // Under `vite dev` the client's state takes the fixture; a built
  // dashboard (`--mode bench`) has no such handle, and the bench draws the
  // hub's own project of that name instead.
  const debug = (
    globalThis as unknown as {
      __cawcoDebug?: { state: { projects: unknown[] } };
    }
  ).__cawcoDebug;
  debug?.state.projects.push(chosen.row);

  const project = $derived(
    cawco.project(chosen.row.id) ??
      cawco.projects.find((held) => held.name === chosen.row.name) ??
      null
  );
  const lead = new CawLead({
    id: () => project?.id ?? chosen.row.id,
    machinesOnline: () => true,
    project: () => project,
    reading: () => false,
    tasks: () => [],
  });
  const none = () => undefined;

  onMount(() => {
    if (page.url.searchParams.has("rename")) {
      tick().then(() => {
        for (const name of document.querySelectorAll<HTMLButtonElement>(
          "button[data-slot='name']"
        )) {
          name.click();
        }
      });
    }
  });
</script>

<div
  class={[
    "flex min-h-dvh flex-col bg-surface-shelf text-ink-strong",
    !one && "gap-space-5 p-space-5",
  ]}
>
  {#each WIDTHS as width (width)}
    <section class="flex flex-col gap-space-2">
      {#if !one}
        <p class="type-meta text-ink-muted">{width}px</p>
      {/if}
      <div
        data-bench-pane={width}
        data-option={option ?? undefined}
        class={[
          "@container/project relative flex min-h-0 min-w-0 flex-none flex-col overflow-hidden rounded-md bg-surface-recess w-(--pane-w) pb-space-8",
          // The one-row alternative: where the head would give the name its
          // own line, Caw's seat folds away and the name keeps the row
          // beside More, ending in its ellipsis.
          option === "one-row" &&
            "**:slot-seat:@max-head-row/head:hidden **:slot-head-row:@max-head-row/head:flex-nowrap **:slot-who:@max-head-row/head:order-none **:slot-who:@max-head-row/head:basis-auto **:slot-title:@max-head-row/head:whitespace-nowrap **:slot-name:@max-head-row/head:whitespace-nowrap",
        ]}
        style:--pane-w="{width}px"
      >
        {#if project}
          <ProjectHead
            {lead}
            machine={chosen.machine}
            newTask={false}
            onaskview={null}
            onfilter={none}
            onnewtask={none}
            {project}
            seated
            setup={null}
          />
        {/if}
      </div>
    </section>
  {/each}
</div>
