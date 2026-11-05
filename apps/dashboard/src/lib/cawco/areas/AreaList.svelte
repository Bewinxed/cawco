<script lang="ts">
  /**
   * Configure › Areas: every area in its order, each a row that opens its
   * page. A row reads down fixed columns: its order handle, its name with
   * the projects in it, one glyph per setting it may carry (set: the
   * setting's glyph; left to the fleet: a dot, the word in its tooltip),
   * and how many projects are in it. The handle drags the row into a new
   * place, or the up and down arrows move it (motion/hand-order); the order
   * is saved as the row lands, and a refusal puts it back with the hub's
   * words above the list.
   *
   * New area unfolds a name field at the list's foot; the area the hub
   * makes lands there, marked. Delete asks under its row (AskHere), naming
   * the projects that leave it and what falls back to the fleet's, counted
   * from each project's settings in effect; what the hub then said stands
   * above the list until the next change.
   */
  import { areasScreenWords as words } from "@cawco/core/words/areas";
  import { tick, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconCheck, IconPlus, IconToolFiles, IconTrash } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { cawco } from "../client.svelte";
  import SectionFrame from "../config/SectionFrame.svelte";
  import { sectionOf } from "../config/sections";
  import { configStore } from "../config/store.svelte";
  import { failureWords } from "../hub-read";
  import { unfold } from "../motion/fold.svelte";
  import { HandOrder } from "../motion/hand-order.svelte";
  import { reflow } from "../motion/rows.svelte";
  import RowFault from "../RowFault.svelte";
  import { type AreaView, createArea, deleteArea, orderAreas } from "./areas";
  import { deleteQuestion } from "./fallback";
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
  let orderTried: string[] | null = null;

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
    <div class="-mx-space-2" {@attach highlight({ rows: '[data-slot="row"]' })}>
      <ol
        aria-label={words.listLabel}
        bind:this={list}
        class="m-0 flex list-none flex-col gap-space-row p-0"
        {@attach reflow()}
      >
        {#each shown as area, index (area.id)}
          {@const settings = settingsOf(area)}
          {@const names = projectNames(area)}
          <li
            data-slot="item"
            class="relative flex min-w-0 flex-col gap-space-1 rounded-sm data-flash:animate-row-flash data-held:z-2 data-held:bg-surface-lift data-held:shadow-md transform-(--carry)"
            data-area={area.id}
            data-flash={store.flash === area.id || undefined}
            data-flip={hand.held === area.id ? undefined : ""}
            data-held={hand.held === area.id || undefined}
            style:--carry={hand.carry(area.id)}
          >
            <div
              data-slot="row"
              class="group/row relative grid min-h-c-row-h-two grid-cols-(--area-cols) items-center gap-x-space-3 gap-y-space-row rounded-sm px-space-2 py-space-2 transition-control has-link-active:bg-surface-fill max-phone:grid-cols-(--area-cols-phone)"
              style:--area-cols={"var(--c-mark) minmax(0, 1fr) auto var(--c-area-count-w) auto"}
              style:--area-cols-phone="var(--c-mark) minmax(0, 1fr) auto"
            >
              <!-- The order handle: the area's tile, grabbed to drag it, or
                   focused and moved with the arrows. -->
              <button
                data-slot="handle"
                aria-label={words.place(area.name, index + 1, shown.length)}
                aria-roledescription={words.draggable}
                class="relative z-1 inline-flex size-c-mark cursor-grab touch-none items-center justify-center rounded-sm bg-surface-raised text-(--hue) shadow-tile select-none touch-hit pointer-hit in-data-held:cursor-grabbing focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset) max-phone:row-span-2 max-phone:self-start"
                data-id={area.id}
                onkeydown={(event) =>
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
                onpointerdown={(event) =>
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
                style:--hue={section.hue}
                type="button"
              >
                <IconToolFiles class="size-icon-md flex-none" />
              </button>

              <span class="flex min-w-0 flex-col gap-space-row">
                <a
                  class="truncate type-label text-ink-row no-underline outline-off after:absolute after:inset-0 after:rounded-inherit focus-visible:after:outline-solid focus-visible:after:outline-(length:--focus-ring-width) focus-visible:after:outline-focus-ring focus-visible:after:outline-offset-(--focus-ring-inset)"
                  data-link
                  href="/config/areas/{area.id}">{area.name}</a
                >
                <span
                  data-slot="meta"
                  class="truncate type-meta text-ink-muted"
                  title={names || undefined}>{names || words.projects(0)}</span
                >
              </span>

              <!-- What it sets, one cell per setting in one order: the
                   setting's glyph where it sets one, a dot where it leaves
                   it to the fleet. Then how many projects are in it. -->
              <span
                class="contents max-phone:col-start-2 max-phone:row-start-2 max-phone:flex max-phone:items-center max-phone:gap-space-3"
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
                            class="inline-flex size-icon-md items-center justify-center text-ink-strong"
                            data-set={setting.value !== null || undefined}
                            aria-label={setting.value
                              ? words.sets(setting.key, setting.value)
                              : words.leaves(setting.key)}
                          >
                            {#if setting.value}
                              <setting.icon class="size-icon-md" />
                            {:else}
                              <span
                                class="size-space-1 rounded-pill bg-border-control-strong"
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
                <span
                  data-slot="count"
                  class="num w-c-area-count-w type-meta text-ink-muted max-phone:w-auto"
                  >{words.projects(area.projects.length)}</span
                >
              </span>

              <Button
                aria-label={words.deleteArea(area.name)}
                class="relative z-1 max-phone:col-start-3 max-phone:row-start-1"
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
