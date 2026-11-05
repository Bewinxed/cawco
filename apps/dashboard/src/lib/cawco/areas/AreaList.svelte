<script lang="ts">
  /**
   * Configure › Areas: every area in its order, each a row that opens its
   * page. A row reads down fixed columns: the switch that folds its projects,
   * its tile (its look, and the handle that orders it), its name with the
   * projects in it, one glyph per setting it may carry (set: the
   * setting's glyph; left to the fleet: a dot, the word in its tooltip),
   * and how many projects are in it. The handle drags the row into a new
   * place, or the up and down arrows move it (motion/hand-order); the order
   * is saved as the row lands, and a refusal puts it back with the hub's
   * words above the list.
   *
   * Its projects hang under it as a project's sessions hang under it in the
   * sidebar: on the rail (app.css .kit-nest) that leaves the area's tile,
   * each row the project's mark and name, a link to its page, opening and
   * folding with the sidebar's motion (motion/branch) from a chevron before
   * the tile (the tile is the look's, so the switch stands beside it). Open
   * until folded; the fold is kept as a project's is (folderPrefs). An area
   * with no projects has no switch; its line says so.
   *
   * New area unfolds a name field at the list's foot; the area the hub
   * makes lands there, marked. Delete asks under its row (AskHere), naming
   * the projects that leave it and what falls back to the fleet's, counted
   * from each project's settings in effect; what the hub then said stands
   * above the list until the next change.
   */
  import type { StageColor, StageIcon } from "@cawco/core/views";
  import { areasScreenWords as words } from "@cawco/core/words/areas";
  import { tick, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconChevronRightDuotone as ChevronIcon,
    IconCheck,
    IconFolder,
    IconPlus,
    IconToolFiles,
    IconTrash,
  } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { cawco } from "../client.svelte";
  import SectionFrame from "../config/SectionFrame.svelte";
  import { sectionOf } from "../config/sections";
  import { configStore } from "../config/store.svelte";
  import { folderPrefs } from "../folder-prefs.svelte";
  import { failureWords } from "../hub-read";
  import { markHue } from "../mark";
  import {
    type BranchOptions,
    branch,
    nestFrom,
  } from "../motion/branch.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { HandOrder } from "../motion/hand-order.svelte";
  import { reflow } from "../motion/rows.svelte";
  import StageLookItems from "../project/StageLookItems.svelte";
  import { folderOf } from "../projects";
  import RowFault from "../RowFault.svelte";
  import TreeMark from "../TreeMark.svelte";
  import {
    type AreaView,
    changeArea,
    createArea,
    deleteArea,
    orderAreas,
  } from "./areas";
  import { deleteQuestion } from "./fallback";
  import { areaMark, lookPatch } from "./mark";
  import { areaSettings } from "./summary";

  const store = configStore();
  const section = sectionOf("areas");

  const areas = $derived(store.areas.value ?? []);
  // Each area's folder facts (its Who decides, its delegate types), read
  // once per list the hub hands over.
  $effect(() => {
    for (const area of areas) {
      untrack(() => store.areaFacts.load(area.id));
    }
  });

  /** The line to an area's projects leaves its tile and ends at each project's mark. */
  const TILE = '[data-slot="handle"]';
  const NEST: BranchOptions = { glyph: "[data-tree-mark]", parent: TILE };
  const foldsOpen = (area: AreaView) =>
    area.projects.length > 0 && !folderPrefs.collapsed(area.id);
  const foldId = (area: AreaView) => `area-projects-${area.id}`;

  /** The order the hand has put the rows in, until the hub's list agrees. */
  let handOrder = $state<string[] | null>(null);
  const shown = $derived.by(() => {
    if (!handOrder) {
      return areas;
    }
    const byId = new Map(areas.map((area) => [area.id, area]));
    const ordered = handOrder.flatMap((id) => byId.get(id) ?? []);
    return ordered.length === areas.length ? ordered : areas;
  });
  const order = $derived(shown.map((area) => area.id));
  let list = $state<HTMLElement | null>(null);
  const hand = new HandOrder();
  let orderFault = $state<string | null>(null);
  let orderTried = $state<string[] | null>(null);

  /* ── Look ─────────────────────────────────────────────────────── */

  /** The area whose look is open, by id. */
  let lookOpen = $state<string | null>(null);
  let lookFault = $state<string | null>(null);
  /** What a picked tile asks: a glyph, or a colour (none: undefined). */
  interface LookAsk {
    color?: StageColor;
    icon?: StageIcon;
  }
  let lookTried: { id: string; asked: LookAsk } | null = null;

  async function keepLook(id: string, asked: LookAsk): Promise<void> {
    const patch = lookPatch(asked);
    lookTried = { id, asked };
    lookFault = null;
    try {
      const { said: _said, ...view } = await changeArea(
        id,
        patch,
        "change the area's look"
      );
      store.areas.value = (store.areas.value ?? []).map((one) =>
        one.id === id ? view : one
      );
    } catch (error) {
      lookFault = failureWords(error);
    }
  }

  async function keepOrder(ids: string[]): Promise<void> {
    orderTried = ids;
    orderFault = null;
    try {
      const { areas: saved } = await orderAreas(ids);
      store.areas.value = saved;
      handOrder = null;
    } catch (error) {
      handOrder = null;
      orderFault = failureWords(error);
    }
  }

  /* ── New area ─────────────────────────────────────────────────── */

  let making = $state(false);
  let name = $state("");
  let creating = $state(false);
  let createFault = $state<string | null>(null);
  let field = $state<HTMLInputElement | null>(null);

  async function startNew(): Promise<void> {
    making = true;
    createFault = null;
    await tick();
    field?.focus();
  }

  function stopNew(): void {
    making = false;
    name = "";
    createFault = null;
  }

  async function create(): Promise<void> {
    if (creating) {
      return;
    }
    creating = true;
    createFault = null;
    try {
      const made = await createArea(name);
      store.areas.value = [...areas, made];
      store.mark(made.id);
      said = [];
      stopNew();
    } catch (error) {
      createFault = failureWords(error);
    } finally {
      creating = false;
    }
  }

  /* ── Delete ───────────────────────────────────────────────────── */

  const asker = new Asker<AskHereRequest>();
  /** What the hub said of the last delete, standing above the list. */
  let said = $state<string[]>([]);

  const projectsIn = (area: AreaView) =>
    area.projects.flatMap(
      (id) => cawco.projects.find((one) => one.id === id) ?? []
    );

  function askDelete(area: AreaView): void {
    asker.ask(
      deleteQuestion(area.id, area.name, projectsIn(area), async () => {
        ({ said } = await deleteArea(area.id));
        store.areas.value = areas.filter((one) => one.id !== area.id);
      })
    );
  }

  const settingsOf = (area: AreaView) =>
    areaSettings(area, store.areaFacts.of(area.id));
  const projectNames = (area: AreaView) =>
    projectsIn(area)
      .map((one) => one.name)
      .join(", ");
</script>

<SectionFrame
  problem={store.areas.error}
  ready={store.areas.value !== null}
  {section}
>
  {#snippet actions(down)}
    <Button
      data-new-area
      disabled={down !== null || making}
      onclick={startNew}
      title={down ?? undefined}
    >
      <IconPlus />
      <span>{words.newArea}</span>
    </Button>
  {/snippet}

  {#if said.length > 0}
    <div
      data-slot="said"
      class="flex flex-col gap-space-1 rounded-md bg-surface-recess px-space-3 py-space-2"
      role="status"
      in:unfold
      out:unfold
    >
      {#each said as line (line)}
        <p
          class="mark-line flex items-start gap-space-2 type-meta text-ink-muted"
        >
          <span class="mark-cell"
            ><IconCheck class="size-icon-sm flex-none" /></span
          >
          <span>{line}</span>
        </p>
      {/each}
    </div>
  {/if}

  <RowFault
    again={orderTried ? () => keepOrder(orderTried ?? []) : undefined}
    data-order-fault
    reason={orderFault}
  />
  <RowFault
    again={() =>
      lookTried ? keepLook(lookTried.id, lookTried.asked) : undefined}
    data-look-fault
    reason={lookFault}
  />

  {#if areas.length === 0 && !making}
    <EmptyState
      icon={IconToolFiles}
      line={words.emptyBody}
      title={words.emptyTitle}
    >
      {#snippet action()}
        <Button
          disabled={cawco.hub !== "connected"}
          onclick={startNew}
          variant="outline"
        >
          <IconPlus />
          <span>{words.newArea}</span>
        </Button>
      {/snippet}
    </EmptyState>
  {:else if areas.length > 0}
    <div
      class="-mx-space-2"
      {@attach highlight({
        rows: '[data-slot="row"], [data-slot="sidebar-menu-sub-button"]',
      })}
    >
      <ol
        aria-label={words.listLabel}
        bind:this={list}
        class="m-0 flex list-none flex-col gap-space-row p-0"
        {@attach reflow()}
      >
        {#each shown as area, index (area.id)}
          {@const mark = areaMark(area, section.hue)}
          {@const settings = settingsOf(area)}
          {@const names = projectNames(area)}
          {@const open = foldsOpen(area)}
          <li
            data-slot="item"
            class="relative flex min-w-0 flex-col gap-space-1 rounded-sm data-flash:animate-row-flash data-held:z-2 data-held:bg-surface-lift data-held:shadow-md transform-(--carry)"
            data-area={area.id}
            data-flash={store.flash === area.id || undefined}
            data-flip={hand.held === area.id ? undefined : "box"}
            data-held={hand.held === area.id || undefined}
            style:--carry={hand.carry(area.id)}
          >
            <div
              data-slot="row"
              class="group/row relative grid min-h-c-row-h-two grid-cols-(--area-cols) items-center gap-x-space-3 gap-y-space-row rounded-sm px-space-2 py-space-2 transition-control has-link-active:bg-surface-fill max-phone:grid-cols-(--area-cols-phone)"
              style:--area-cols={"auto var(--c-mark) minmax(0, 1fr) auto var(--c-area-count-w) auto"}
              style:--area-cols-phone="auto var(--c-mark) minmax(0, 1fr) auto"
            >
              <!-- The switch that folds its projects: the sidebar's chevron,
                   turned down while they are out. Its own column, as wide
                   as a finger under one, so its press never lands on the
                   tile's. An area with none keeps the column, empty. -->
              {#if area.projects.length > 0}
                <button
                  aria-controls={open ? foldId(area) : undefined}
                  aria-expanded={open}
                  aria-label={words.fold(area.name, open)}
                  class="relative z-1 inline-grid w-space-5 self-stretch place-items-center rounded-sm text-ink-muted transition-control hover:text-ink-strong touch-hit coarse:w-c-touch-floor focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) max-phone:row-span-2 max-phone:h-c-mark max-phone:self-start"
                  data-slot="fold"
                  onclick={() => folderPrefs.setCollapsed(area.id, open)}
                  title={words.fold(area.name, open)}
                  type="button"
                >
                  <ChevronIcon
                    aria-hidden="true"
                    class="size-icon-sm rotate-(--swap-turn) motion-safe:transition-[--swap-turn] motion-safe:duration-(--dur-toggle) motion-safe:ease-out"
                    style={open ? "--swap-turn: 90deg" : undefined}
                  />
                </button>
              {:else}
                <span
                  aria-hidden="true"
                  class="w-space-5 coarse:w-c-touch-floor max-phone:row-span-2"
                ></span>
              {/if}

              <!-- The area's tile: a press opens its look (its glyph, then
                   its colour, as a draft stage's glyph does); a press that
                   travels lifts the row (HandOrder lifts it past TRAVEL and
                   swallows the click it ends on); focused, the arrows move
                   it and Enter opens the look. The menu's own press and
                   arrow opening give way to those (their handlers run
                   first and cancel), so the look opens on the click. -->
              <DropdownMenu.Root
                bind:open={
                  () => lookOpen === area.id,
                  (next) => {
                    lookOpen = next ? area.id : null;
                  }
                }
              >
                <DropdownMenu.Trigger
                  disabled={cawco.hub !== "connected"}
                  onclick={(event: MouseEvent) => {
                    // A pointer's click (a key's is the menu's own, detail 0).
                    if (event.detail !== 0) {
                      lookOpen = lookOpen === area.id ? null : area.id;
                    }
                  }}
                  onkeydown={(event: KeyboardEvent) =>
                    hand.nudge(
                      event,
                      area.id,
                      order,
                      (ids) => {
                        handOrder = ids;
                      },
                      list,
                      keepOrder
                    )}
                  onpointerdown={(event: PointerEvent) =>
                    hand.grab(
                      event,
                      area.id,
                      order,
                      (ids) => {
                        handOrder = ids;
                      },
                      list,
                      keepOrder
                    )}
                  onpointerup={(event: PointerEvent) => {
                    // A touch's let-go is the click's, never the menu's own toggle.
                    if (event.pointerType === "touch") {
                      event.preventDefault();
                    }
                  }}
                >
                  {#snippet child({ props })}
                    <button
                      {...props}
                      aria-label={words.place(
                        area.name,
                        index + 1,
                        shown.length
                      )}
                      class="relative z-1 inline-flex size-c-mark cursor-grab touch-none items-center justify-center rounded-sm bg-surface-raised text-(--hue) shadow-tile select-none touch-hit pointer-hit in-data-held:cursor-grabbing focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset) max-phone:row-span-2 max-phone:self-start"
                      data-id={area.id}
                      data-slot="handle"
                      style={`--hue: ${mark.hue}`}
                      title={words.lookFor(area.name)}
                      type="button"
                    >
                      <mark.glyph class="size-icon-md flex-none" />
                    </button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start" width="tiles">
                  <StageLookItems
                    bare={section.hue}
                    onlook={(patch) => keepLook(area.id, patch)}
                    stage={{
                      icon: area.icon ?? undefined,
                      color: area.color ?? undefined,
                    }}
                  />
                </DropdownMenu.Content>
              </DropdownMenu.Root>

              <span class="flex min-w-0 flex-col gap-space-row">
                <a
                  class="truncate type-label text-ink-row no-underline outline-off after:absolute after:inset-0 after:rounded-inherit focus-visible:after:outline-solid focus-visible:after:outline-(length:--focus-ring-width) focus-visible:after:outline-focus-ring focus-visible:after:outline-offset-(--focus-ring-inset)"
                  data-link
                  href="/config/areas/{area.id}">{area.name}</a
                >
                <!-- Its projects' names while they are folded away; out,
                     they stand under it and the line has nothing to add. -->
                {#if !open}
                  <span
                    data-slot="meta"
                    class="truncate type-meta text-ink-muted"
                    title={names || undefined}
                    >{names || words.projects(0)}</span
                  >
                {/if}
              </span>

              <!-- What it sets, one cell per setting in one order: the
                   setting's glyph where it sets one, a dot where it leaves
                   it to the fleet. Then how many projects are in it. -->
              <span
                class="contents max-phone:col-start-3 max-phone:row-start-2 max-phone:flex max-phone:items-center max-phone:gap-space-3"
              >
                <ul
                  data-slot="sets"
                  class="relative z-1 m-0 flex list-none items-center gap-space-2 p-0"
                  aria-label={settings.some((one) => one.value)
                    ? undefined
                    : words.setsNothing}
                >
                  {#each settings as setting (setting.key)}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <li
                            {...props}
                            class="inline-flex size-icon-md items-center justify-center text-ink-muted"
                            data-set={setting.value !== null || undefined}
                            aria-label={setting.value
                              ? words.sets(setting.key, setting.value)
                              : words.leaves(setting.key)}
                          >
                            {#if setting.value}
                              <setting.icon class="size-icon-md" />
                            {:else}
                              <span
                                class="size-space-1 rounded-pill bg-border-control"
                              ></span>
                            {/if}
                          </li>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        >{setting.value
                          ? words.sets(setting.key, setting.value)
                          : words.leaves(setting.key)}</Tooltip.Content
                      >
                    </Tooltip.Root>
                  {/each}
                </ul>
                <!-- The Earned Count Rule: no count at 0; its meta line says so. -->
                <span
                  data-slot="count"
                  class="num w-c-area-count-w type-meta whitespace-nowrap text-ink-muted max-phone:w-auto"
                  >{area.projects.length > 0
                    ? words.projects(area.projects.length)
                    : ""}</span
                >
              </span>

              <Button
                aria-label={words.deleteArea(area.name)}
                class="relative z-1 max-phone:col-start-4 max-phone:row-start-1"
                data-delete-area
                data-ghost
                disabled={cawco.hub !== "connected"}
                icon={IconTrash}
                onclick={() => askDelete(area)}
                size="icon-sm"
                title={words.deleteArea(area.name)}
                variant="ghost"
              />
            </div>
            <AskHere
              {asker}
              at={area.id}
              indent="calc(var(--space-2) + var(--c-mark) + var(--space-3))"
            />
            <!-- Its projects, as the sidebar hangs a project's sessions:
                 the rail from the tile, each project's mark on its arm,
                 the whole opening and folding with the sidebar's motion. -->
            {#if open}
              <ul
                aria-label={words.projectsIn(area.name)}
                class="kit-nest m-0 flex min-w-0 list-none flex-col gap-(--tree-gap) pt-0 pe-0 pb-space-1 ps-(--nest-pad)"
                data-flip-anchor
                data-nest
                data-slot="projects"
                id={foldId(area)}
                in:branch={NEST}
                out:branch={NEST}
                {@attach nestFrom(TILE, "[data-tree-mark]")}
              >
                {#each projectsIn(area) as project (project.id)}
                  <Sidebar.MenuSubItem data-flip>
                    <Sidebar.MenuSubButton
                      data-branch-item
                      href="/project/{project.id}"
                      row="compact-touch"
                    >
                      <span
                        data-slot="sidebar-row-lead"
                        class="inline-flex size-space-5 shrink-0 items-center justify-center"
                        data-box
                      >
                        <TreeMark
                          fill="var(--mark-{markHue(folderOf(project))})"
                        >
                          {#snippet face()}
                            <IconFolder
                              aria-hidden="true"
                              class="size-icon-sm"
                            />
                          {/snippet}
                        </TreeMark>
                      </span>
                      <span>{project.name}</span>
                    </Sidebar.MenuSubButton>
                  </Sidebar.MenuSubItem>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if making}
    <form
      data-slot="new-area"
      class="flex flex-col gap-space-2"
      onsubmit={(event) => {
        event.preventDefault();
        create();
      }}
      in:unfold
      out:unfold
    >
      <div class="flex flex-wrap items-center gap-space-2">
        <div class="min-w-0 flex-1 basis-48">
          <Input
            aria-invalid={createFault ? "true" : undefined}
            aria-label={words.nameLabel}
            autocomplete="off"
            bind:ref={field}
            bind:value={name}
            measure="shrink"
            onkeydown={(event) => {
              if (event.key === "Escape") {
                stopNew();
              }
            }}
            placeholder={words.namePlaceholder}
          />
        </div>
        <Button
          disabled={cawco.hub !== "connected"}
          label={words.create}
          pending={creating}
          pendingLabel={words.creating}
          type="submit"
          variant="default"
        />
        <Button label={words.cancel} onclick={stopNew} variant="ghost" />
      </div>
      <RowFault data-create-fault reason={createFault} />
    </form>
  {/if}
</SectionFrame>
