<script lang="ts">
  /**
   * One area's page (core areas.ts): its name, typed where its title reads;
   * the settings it carries, grouped as a project's are (Sessions, Spend,
   * Agents), each changed on its own row and written at once; what is
   * scoped to it in Rules, Memory files and Connections, each a link to its
   * editor; and, beside them on a desk (under them on a phone), the
   * projects in it, each saying which settings it sets itself.
   *
   * A setting the area leaves to the fleet shows the fleet's value as its
   * select's first choice ("The fleet's: Pause dispatch"), so every row
   * says where its value comes from. A write shows what was asked while the
   * hub answers, then the hub's value; a refusal puts the row back with the
   * hub's words under it and Try again (RowFault). What moved with a change
   * (a project's conversation onto the account it now starts on) stands
   * under the row.
   *
   * Delete asks at the page's foot (AskHere), naming the projects that
   * leave it and what falls back; once it goes, the list says what the hub
   * said.
   */
  import type { ProjectAtLimit } from "@cawco/core/accounts";
  import { type OfferedMode, SESSION_CHOSEN_MODES } from "@cawco/core/harness";
  import type { CapPeriod, OnCap } from "@cawco/core/project-conversation";
  import {
    AREA_SETTING_LABELS,
    areasScreenWords as words,
  } from "@cawco/core/words/areas";
  import { configureWords } from "@cawco/core/words/configure";
  import { projectAccountWords } from "@cawco/core/words/project-account";
  import { spawnWords } from "@cawco/core/words/spawn";
  import { SPEND_ON_CAP } from "@cawco/core/words/spend";
  import { onMount, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import {
    IconBook,
    IconConnection,
    IconFolder,
    IconRules,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import AskHere from "../AskHere.svelte";
  import AccountPick from "../accounts/AccountPick.svelte";
  import AtLimitPick from "../accounts/AtLimitPick.svelte";
  import { accountNamed, signedOutEverywhere } from "../accounts/model.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import {
    cawco,
    type ProjectRow,
    readConnections,
    spendSettings,
  } from "../client.svelte";
  import { sectionOf } from "../config/sections";
  import { configStore } from "../config/store.svelte";
  import TitleInput from "../config/TitleInput.svelte";
  import { failureWords } from "../hub-read";
  import { markHue } from "../mark";
  import { land } from "../motion/share.svelte";
  import { folderOf } from "../projects";
  import RowFault from "../RowFault.svelte";
  import { money } from "../usage";
  import AreaTypes from "./AreaTypes.svelte";
  import { type AreaChange, changeArea, deleteArea } from "./areas";
  import { ownKinds } from "./facts.svelte";
  import { deleteQuestion } from "./fallback";

  let { id }: { id: string } = $props();

  const store = configStore();
  const section = sectionOf("areas");
  const uid = $props.id();

  const area = $derived(store.areas.value?.find((one) => one.id === id));
  const facts = $derived(store.areaFacts.of(id));
  $effect(() => {
    const at = id;
    untrack(() => store.areaFacts.load(at));
  });

  const projects = $derived(
    (area?.projects ?? []).flatMap(
      (pid) => cawco.projects.find((one) => one.id === pid) ?? []
    )
  );

  /* ── Writes ─────────────────────────────────────────────────────── */

  type Field = "name" | "account" | "atLimit" | "cawMode" | "cap" | "onCap";
  /** The value asked while the hub answers, by field. */
  let asked = $state<Partial<Record<Field, AreaChange>>>({});
  let faults = $state<Partial<Record<Field, string>>>({});
  /** What moved with the last change of a field, in the hub's sentences. */
  let said = $state<Partial<Record<Field, string[]>>>({});
  const tried: Partial<Record<Field, AreaChange>> = {};

  /**
   * Writes one field. A field already being written is left to that write,
   * and the change just refused is not sent again by a blur or a second
   * Enter; Try again (`retry`) sends it on purpose.
   */
  async function write(
    field: Field,
    change: AreaChange,
    attempt: string,
    retry = false
  ): Promise<void> {
    if (asked[field] !== undefined) {
      return;
    }
    if (
      !retry &&
      faults[field] !== undefined &&
      JSON.stringify(tried[field]) === JSON.stringify(change)
    ) {
      return;
    }
    tried[field] = change;
    asked[field] = change;
    delete faults[field];
    try {
      const { said: moved, ...view } = await changeArea(id, change, attempt);
      store.areas.value = (store.areas.value ?? []).map((one) =>
        one.id === id ? view : one
      );
      said[field] = moved;
    } catch (error) {
      faults[field] = failureWords(error);
    } finally {
      delete asked[field];
    }
  }

  const again = (field: Field, attempt: string) => () => {
    const change = tried[field];
    return change ? write(field, change, attempt, true) : undefined;
  };

  /* ── Name ───────────────────────────────────────────────────────── */

  let draftName = $state("");
  $effect(() => {
    const name = area?.name;
    if (name !== undefined && asked.name === undefined) {
      untrack(() => {
        draftName = name;
      });
    }
  });
  function rename(): void {
    const next = draftName.trim();
    if (area && next !== area.name) {
      write("name", { name: next }, "rename the area");
    }
  }

  /* ── Account ────────────────────────────────────────────────────── */

  const accountNow = $derived(
    asked.account ? (asked.account.account ?? null) : (area?.account ?? null)
  );
  const accountName = $derived(
    area?.account ? accountNamed(area.account) : null
  );
  const atLimit = $derived<ProjectAtLimit>(
    asked.atLimit?.accountAtLimit ?? area?.accountAtLimit ?? "wait"
  );

  /* ── Caw's mode ─────────────────────────────────────────────────── */

  /** The fleet's mode, as a project that takes it reads it; null while none does or the fleet sets none. */
  const fleetMode = $derived(
    cawco.projects.find((one) => one.inEffect.cawMode.from === "fleet")
      ?.inEffect.cawMode.value ?? null
  );
  const modeNow = $derived(
    asked.cawMode ? (asked.cawMode.cawMode ?? null) : (area?.cawMode ?? null)
  );
  const modes = $derived<OfferedMode[]>(
    modeNow === "fullSend"
      ? [...SESSION_CHOSEN_MODES, "fullSend"]
      : [...SESSION_CHOSEN_MODES]
  );

  /* ── Budget ─────────────────────────────────────────────────────── */

  let fleetOnCap = $state<OnCap | null>(null);
  onMount(() => {
    spendSettings().then(
      (read) => {
        fleetOnCap = read.onCap;
      },
      () => {
        // The first choice then reads "The fleet's" without its value.
      }
    );
  });
  const onCapLabel = (value: OnCap | null) =>
    SPEND_ON_CAP.find((each) => each.value === value)?.label ?? null;
  const onCapNow = $derived(
    asked.onCap ? (asked.onCap.onCap ?? null) : (area?.onCap ?? null)
  );
  const onCapMeans = $derived(
    SPEND_ON_CAP.find((each) => each.value === (onCapNow ?? fleetOnCap))?.means
  );

  /** The amount typed: a number input binds a number, or "" while empty. */
  let amount = $state<number | string>("");
  let period = $state<CapPeriod>("month");
  $effect(() => {
    const usd = area?.capUsd ?? null;
    const per = area?.capPeriod ?? null;
    if (asked.cap === undefined) {
      untrack(() => {
        amount = usd === null ? "" : String(usd);
        if (per) {
          period = per;
        }
      });
    }
  });
  function keepBudget(): void {
    const typed = String(amount).trim();
    if (typed === "") {
      return;
    }
    const usd = Number(typed);
    if (
      area &&
      (usd !== area.capUsd || period !== area.capPeriod || area.capUsd === null)
    ) {
      write("cap", { cap: { usd, period } }, "set the area's budget");
    }
  }

  /* ── Scoped to it ───────────────────────────────────────────────── */

  const rules = $derived(
    (store.rules.value ?? []).filter((rule) => rule.scope.areaId === id)
  );
  const docs = $derived(
    (store.fleet.value?.memoryDocs ?? []).filter((doc) =>
      doc.scope?.areaIds?.includes(id)
    )
  );
  let connections = $state<{ id: string; name: string }[] | null>(null);
  /** The area's row as last read: the connections are read again when it changes. */
  const stamp = $derived(area ? `${area.id}:${area.name}` : null);
  $effect(() => {
    const at = id;
    if (stamp === null) {
      return;
    }
    readConnections().then(
      (all) => {
        connections = all
          .filter((one) => one.areas.includes(at))
          .map((one) => ({ id: one.id, name: one.name }));
      },
      () => {
        connections = [];
      }
    );
  });

  /* ── Projects ───────────────────────────────────────────────────── */

  const ownOf = (project: ProjectRow): string[] =>
    (["account", "cap", "onCap", "cawMode"] as const)
      .filter((field) => project.inEffect[field].from === "project")
      .map((field) => words.projectSettingNames[field]);

  /* ── Delete ─────────────────────────────────────────────────────── */

  const asker = new Asker<AskHereRequest>();
  function askDelete(): void {
    if (!area) {
      return;
    }
    asker.ask(
      deleteQuestion("delete", area.name, projects, async () => {
        await deleteArea(id);
        store.areas.value = (store.areas.value ?? []).filter(
          (one) => one.id !== id
        );
        await goto("/config/areas");
      })
    );
  }

  const kinds = $derived(ownKinds(facts?.decides ?? null).length);
</script>

<svelte:head
  ><title>{configureWords.documentTitle(area?.name ?? section.label)}</title
  ></svelte:head
>

{#snippet said_(field: Field)}
  {#each said[field] ?? [] as line (line)}
    <p data-slot="note" class="type-meta text-ink-muted" role="status">
      {line}
    </p>
  {/each}
{/snippet}

<div
  class="flex min-h-0 min-w-0 flex-auto flex-col overflow-y-auto bg-surface-recess px-space-5 py-space-2"
>
  <div
    data-slot="body"
    class="flex max-w-c-config-max-w min-w-0 shrink-0 grow basis-auto flex-col gap-space-6 rounded-lg bg-surface-raised px-space-7 py-space-6 max-phone:px-space-5"
    data-area-page={id}
  >
    {#if store.areas.value !== null && !area}
      <div class="flex flex-col gap-space-2">
        <h1 class="type-title tracking-title text-ink-strong">{words.gone}</h1>
        <p class="text-pretty text-ink-muted">{configureWords.goneLine}</p>
        <Button href="/config/areas" label={words.backTo} variant="outline" />
      </div>
    {:else}
      <header data-slot="head" class="flex items-start gap-space-3">
        <span
          data-slot="tile"
          class="mt-space-row inline-flex size-c-mark flex-none items-center justify-center rounded-sm bg-surface-raised text-(--hue) shadow-tile *:size-icon-md"
          data-share="icon:/config/areas/{id}"
          style:--hue={section.hue}
          {@attach land(() => `icon:/config/areas/${id}`)}
        >
          <section.icon />
        </span>
        <div class="flex min-w-0 flex-auto flex-col gap-space-2">
          <form
            onsubmit={(event) => {
              event.preventDefault();
              rename();
            }}
          >
            <TitleInput
              disabled={area === undefined}
              invalid={faults.name !== undefined}
              label={words.renameLabel}
              onblur={rename}
              placeholder={words.namePlaceholder}
              bind:value={draftName}
            />
          </form>
          <RowFault
            again={again("name", "rename the area")}
            data-name-fault
            reason={faults.name ?? null}
          />
          <p class="text-pretty text-ink-muted">
            {words.takers(projects.length)}
          </p>
        </div>
      </header>

      <div
        class="grid min-w-0 grid-cols-(--page-cols) items-start gap-x-space-8 gap-y-space-6 max-desk:grid-cols-1"
        style:--page-cols="minmax(0, 1fr) var(--c-area-page-side-w)"
      >
        <div data-slot="settings" class="flex min-w-0 flex-col gap-space-7">
          <!-- Sessions: where its projects' sessions start, and in what mode. -->
          <section
            aria-labelledby="{uid}-sessions"
            class="flex flex-col gap-space-5"
          >
            <h2 class="type-label text-ink-strong" id="{uid}-sessions">
              {words.groups.sessions}
            </h2>
            <div class="flex flex-col gap-space-2" data-setting="account">
              <label class="type-meta text-ink-muted" for="{uid}-account"
                >{projectAccountWords.label}</label
              >
              <AccountPick
                disabled={asked.account !== undefined || area === undefined}
                id="{uid}-account"
                onpick={(next) =>
                  write(
                    "account",
                    { account: next },
                    "change the area's account"
                  )}
                routing={words.routing}
                value={accountNow}
              />
              <p data-slot="note" class="type-meta text-pretty text-ink-muted">
                {accountName
                  ? words.accountSet(accountName)
                  : words.accountRouted}
              </p>
              {#if area?.account && accountName && signedOutEverywhere(area.account)}
                <p
                  data-slot="note"
                  class="type-meta text-pretty text-status-attn-ink"
                  data-account-signed-out
                >
                  {words.accountSignedOut(accountName)}
                </p>
              {/if}
              {@render said_("account")}
              <RowFault
                again={again("account", "change the area's account")}
                reason={faults.account ?? null}
              />
            </div>

            {#if area?.account}
              <div class="flex flex-col gap-space-2" data-setting="at-limit">
                <span class="type-meta text-ink-muted" id="{uid}-at-limit"
                  >{projectAccountWords.atLimit.label}</span
                >
                <AtLimitPick
                  labelledby="{uid}-at-limit"
                  onpick={(next) =>
                    write(
                      "atLimit",
                      { accountAtLimit: next },
                      "change what the area's sessions do at the limit"
                    )}
                  pending={asked.atLimit !== undefined}
                  value={atLimit}
                />
                {@render said_("atLimit")}
                <RowFault
                  again={again(
                    "atLimit",
                    "change what the area's sessions do at the limit"
                  )}
                  reason={faults.atLimit ?? null}
                />
              </div>
            {/if}

            <div class="flex flex-col gap-space-2" data-setting="caw-mode">
              <label class="type-meta text-ink-muted" for="{uid}-mode"
                >{words.cawModeLabel}</label
              >
              <NativeSelect.Root
                class="w-full"
                disabled={asked.cawMode !== undefined || area === undefined}
                id="{uid}-mode"
                bind:value={
                  () => modeNow ?? "",
                  (next) =>
                    write(
                      "cawMode",
                      { cawMode: (next || null) as OfferedMode | null },
                      "change the area's permission mode for Caw"
                    )
                }
              >
                <NativeSelect.Option value=""
                  >{words.fleets(
                    fleetMode ? spawnWords.modes[fleetMode] : null
                  )}</NativeSelect.Option
                >
                {#each modes as mode (mode)}
                  <NativeSelect.Option value={mode}
                    >{spawnWords.modes[mode]}</NativeSelect.Option
                  >
                {/each}
              </NativeSelect.Root>
              {#if !(modeNow || fleetMode)}
                <p
                  data-slot="note"
                  class="type-meta text-pretty text-ink-muted"
                >
                  {words.cawModeFleet}
                </p>
              {/if}
              {@render said_("cawMode")}
              <RowFault
                again={again(
                  "cawMode",
                  "change the area's permission mode for Caw"
                )}
                reason={faults.cawMode ?? null}
              />
            </div>
          </section>

          <!-- Spend: what each project in it may spend, and what reaching it does. -->
          <section
            aria-labelledby="{uid}-spend"
            class="flex flex-col gap-space-5"
          >
            <h2 class="type-label text-ink-strong" id="{uid}-spend">
              {words.groups.spend}
            </h2>
            <div class="flex flex-col gap-space-2" data-setting="budget">
              <label class="type-meta text-ink-muted" for="{uid}-budget"
                >{words.budgetLabel}</label
              >
              <form
                class="flex flex-wrap items-center gap-space-2"
                onsubmit={(event) => {
                  event.preventDefault();
                  keepBudget();
                }}
              >
                <span aria-hidden="true" class="type-label text-ink-muted"
                  >{words.budgetAmount}</span
                >
                <Input
                  aria-invalid={faults.cap ? "true" : undefined}
                  field="number"
                  disabled={asked.cap !== undefined || area === undefined}
                  id="{uid}-budget"
                  inputmode="decimal"
                  min="0"
                  onblur={keepBudget}
                  step="any"
                  type="number"
                  bind:value={amount}
                />
                <ToggleGroup.Root
                  aria-label={words.budgetLabel}
                  type="single"
                  bind:value={
                    () => period,
                    (next) => {
                      if (next) {
                        period = next as CapPeriod;
                        keepBudget();
                      }
                    }
                  }
                >
                  <ToggleGroup.Item value="day"
                    >{words.budgetPer.day}</ToggleGroup.Item
                  >
                  <ToggleGroup.Item value="month"
                    >{words.budgetPer.month}</ToggleGroup.Item
                  >
                </ToggleGroup.Root>
                {#if area?.capUsd !== null && area?.capUsd !== undefined}
                  <Button
                    data-clear-budget
                    disabled={asked.cap !== undefined}
                    label={words.clearBudget}
                    onclick={() =>
                      write("cap", { cap: null }, "clear the area's budget")}
                    size="sm"
                    variant="ghost"
                  />
                {/if}
              </form>
              <p data-slot="note" class="type-meta text-pretty text-ink-muted">
                {area?.capUsd !== null &&
                area?.capUsd !== undefined &&
                area.capPeriod
                  ? words.budgetSet(money(area.capUsd), area.capPeriod)
                  : words.budgetNone}
              </p>
              {@render said_("cap")}
              <RowFault
                again={again("cap", "set the area's budget")}
                reason={faults.cap ?? null}
              />
            </div>

            <div class="flex flex-col gap-space-2" data-setting="on-cap">
              <label class="type-meta text-ink-muted" for="{uid}-on-cap"
                >{words.onCapLabel}</label
              >
              <NativeSelect.Root
                class="w-full"
                disabled={asked.onCap !== undefined || area === undefined}
                id="{uid}-on-cap"
                bind:value={
                  () => onCapNow ?? "",
                  (next) =>
                    write(
                      "onCap",
                      { onCap: (next || null) as OnCap | null },
                      "change what reaching the area's budget does"
                    )
                }
              >
                <NativeSelect.Option value=""
                  >{words.fleets(onCapLabel(fleetOnCap))}</NativeSelect.Option
                >
                {#each SPEND_ON_CAP as each (each.value)}
                  <NativeSelect.Option value={each.value}
                    >{each.label}</NativeSelect.Option
                  >
                {/each}
              </NativeSelect.Root>
              {#if onCapMeans}
                <p
                  data-slot="note"
                  class="type-meta text-pretty text-ink-muted"
                >
                  {onCapMeans}
                </p>
              {/if}
              <RowFault
                again={again(
                  "onCap",
                  "change what reaching the area's budget does"
                )}
                reason={faults.onCap ?? null}
              />
            </div>
          </section>

          <!-- Agents: who settles its projects' choices, and the types their delegates pick from. -->
          <section
            aria-labelledby="{uid}-agents"
            class="flex flex-col gap-space-5"
          >
            <h2 class="type-label text-ink-strong" id="{uid}-agents">
              {words.groups.agents}
            </h2>
            <div class="flex flex-col gap-space-2" data-setting="decides">
              <span class="type-meta text-ink-muted"
                >{AREA_SETTING_LABELS.decides}</span
              >
              <div
                class="flex flex-wrap items-center justify-between gap-space-3"
              >
                <p class="text-pretty">
                  {kinds > 0 ? words.decidesOwn(kinds) : words.decidesFleet}
                </p>
                <Button
                  data-set-decides
                  href="/config/areas/{id}/decides"
                  label={words.setDecides}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
            <AreaTypes areaId={id} types={facts?.types ?? null} />
          </section>

          <!-- Scoped to it: what its projects get from each kind's own section. -->
          <section
            aria-labelledby="{uid}-scoped"
            class="flex flex-col gap-space-4"
          >
            <h2 class="type-label text-ink-strong" id="{uid}-scoped">
              {words.groups.scoped}
            </h2>
            {#snippet scoped(
              Icon: typeof IconRules,
              label: string,
              what: string,
              open: string,
              rows: { href: string; key: string; name: string }[] | null
            )}
              <div class="flex flex-col gap-space-1" data-scoped={what}>
                <div class="flex items-center justify-between gap-space-3">
                  <span
                    class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
                  >
                    <Icon class="size-icon-sm flex-none" data-box />
                    <span>{label}</span>
                  </span>
                  <a
                    class="type-meta text-link-ink no-underline can-hover:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
                    href={open}>{words.scopedOpen(what)}</a
                  >
                </div>
                {#if rows !== null && rows.length === 0}
                  <p class="type-meta text-ink-muted">
                    {words.scopedNone(what)}
                  </p>
                {:else if rows}
                  <ul class="m-0 flex list-none flex-col gap-space-row p-0">
                    {#each rows as row (row.key)}
                      <li class="min-w-0">
                        <a
                          class="block truncate type-label text-ink-row no-underline can-hover:hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
                          href={row.href}>{row.name}</a
                        >
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/snippet}
            {@render scoped(
              IconRules,
              words.scopedLabels.rules,
              words.scopedKinds.rules,
              "/config/rules",
              store.rules.value === null
                ? null
                : rules.map((rule) => ({
                    key: rule.id,
                    name: rule.name,
                    href: `/config/rules/${encodeURIComponent(rule.id)}`,
                  }))
            )}
            {@render scoped(
              IconBook,
              words.scopedLabels.memory,
              words.scopedKinds.memory,
              "/config/memory",
              store.fleet.value === null
                ? null
                : docs.map((doc) => ({
                    key: doc.path,
                    name: doc.path,
                    href: `/config/memory/${doc.path}`,
                  }))
            )}
            {@render scoped(
              IconConnection,
              words.scopedLabels.connections,
              words.scopedKinds.connections,
              "/config/connections",
              connections === null
                ? null
                : connections.map((one) => ({
                    key: one.id,
                    name: one.name,
                    href: "/config/connections",
                  }))
            )}
          </section>
        </div>

        <!-- The projects in it, each saying which settings it sets itself. -->
        <aside
          aria-labelledby="{uid}-projects"
          class="flex min-w-0 flex-col gap-space-3"
          data-slot="projects"
        >
          <h2 class="type-label text-ink-strong" id="{uid}-projects">
            {words.groups.projects}
          </h2>
          {#if projects.length === 0}
            <p class="type-meta text-pretty text-ink-muted">
              {words.noProjects}
            </p>
          {:else}
            <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
              {#each projects as project (project.id)}
                {@const own = ownOf(project)}
                <li
                  class="flex min-w-0 items-start gap-space-2"
                  data-project={project.id}
                >
                  <span
                    class="mark-cell mt-space-row inline-flex flex-none text-(--hue)"
                    style:--hue="var(--mark-{markHue(folderOf(project))})"
                  >
                    <IconFolder class="size-icon-md" />
                  </span>
                  <span class="flex min-w-0 flex-col gap-space-row">
                    <a
                      class="truncate type-label text-ink-row no-underline can-hover:hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid rounded-xs"
                      href="/project/{encodeURIComponent(project.id)}"
                      >{project.name}</a
                    >
                    <span class="type-meta text-pretty text-ink-muted"
                      >{own.length === 0
                        ? words.projectTakesAll
                        : words.projectSetsOwn(own)}</span
                    >
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </aside>
      </div>

      <footer
        class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-5"
      >
        <div class="flex justify-end">
          <Button
            data-delete-area
            disabled={cawco.hub !== "connected" || area === undefined}
            icon={IconTrash}
            aria-label={area ? words.deleteArea(area.name) : undefined}
            label={words.deleteConfirm}
            onclick={askDelete}
            variant="destructive"
          />
        </div>
        <AskHere {asker} at="delete" />
      </footer>
    {/if}
  </div>
</div>
