<script lang="ts">
  /**
   * One project's spend (fable-lead-switch.md §2): five tiles — today, this
   * month, its Caw's share this month, its budget (its spend cap for a day
   * or a month, what reaching it does, and the way to set it), and what one
   * attempt may spend — then
   * a ledger: Caw's threads with how often each woke him, and each task's
   * attempts with what they cost and how the newest stands. Rows open the
   * thread or the task. A thread's dollars are the turns it woke: each
   * turn's share of the lead session's cost, booked by the hub.
   */
  import type { CapPeriod, OnCap, ProjectSpend } from "@cawco/core";
  import {
    cawco,
    projectSpend,
    setProjectBudget,
    setProjectCap,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import StatTile from "#lib/cawco/StatTile.svelte";
  import { usd } from "#lib/cawco/usage.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { formatAgeShort } from "#lib/utils/time.js";

  let {
    projectId,
    projectName,
    leadOn,
  }: { projectId: string; projectName: string; leadOn: boolean | null } =
    $props();

  let spend = $state<ProjectSpend | null>(null);
  let refused = $state<string | null>(null);

  async function read(id: string) {
    try {
      const answer = await projectSpend(id);
      if (id === projectId) {
        spend = answer;
        refused = null;
      }
    } catch (error) {
      refused = failureWords(error);
    }
  }
  $effect(() => {
    spend = null;
    read(projectId);
  });

  /** The budget as one line: each limit it sets, an attempt at a time. */
  const budgetLine = $derived.by(() => {
    const budget = spend?.budget;
    if (!budget) {
      return "None";
    }
    return [
      budget.usd === undefined ? null : usd(budget.usd),
      budget.turns === undefined ? null : `${budget.turns} turns`,
      budget.minutes === undefined ? null : `${budget.minutes} min`,
    ]
      .filter(Boolean)
      .join(" · ");
  });

  let budgetOpen = $state(false);
  let amount = $state("");
  let turns = $state("");
  let minutes = $state("");
  let saving = $state(false);
  let budgetRefused = $state<string | null>(null);
  $effect(() => {
    if (budgetOpen) {
      amount = spend?.budget?.usd?.toString() ?? "";
      turns = spend?.budget?.turns?.toString() ?? "";
      minutes = spend?.budget?.minutes?.toString() ?? "";
      budgetRefused = null;
    }
  });
  const number = (text: string): number | undefined =>
    text.trim() === "" ? undefined : Number(text);

  async function saveBudget() {
    const next = {
      usd: number(amount),
      turns: number(turns),
      minutes: number(minutes),
    };
    const set = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined)
    );
    saving = true;
    budgetRefused = null;
    try {
      await setProjectBudget(
        projectId,
        Object.keys(set).length > 0 ? set : null
      );
      budgetOpen = false;
      await read(projectId);
    } catch (error) {
      budgetRefused = failureWords(error);
    } finally {
      saving = false;
    }
  }

  // --- its budget: the spend cap -----------------------------------------------

  /** What reaching the budget does, as Configure and the tile say it. */
  const ON_CAP_LABEL: Record<OnCap, string> = {
    pause: "Pause dispatch",
    quiet: "Stop waking Caw",
    both: "Pause both",
  };
  /** The cap, as the hub keeps it live (`project.cap`), else as the spend read had it. */
  const cap = $derived(
    cawco.project(projectId)?.cap === undefined
      ? (spend?.cap ?? null)
      : (cawco.project(projectId)?.cap ?? null)
  );
  const share = $derived(
    cap ? Math.round((cap.spentUsd / cap.usd) * 100) : null
  );
  const capTone = $derived.by(() => {
    if (share === null) {
      return "neutral" as const;
    }
    if (share > 90) {
      return "fail" as const;
    }
    return share > 70 ? ("attn" as const) : ("neutral" as const);
  });
  /**
   * What reaching it does, in a word: the fleet's default, or the project's
   * own choice. Only with a budget: without one nothing is reached.
   */
  const onCapLine = $derived.by(() => {
    if (!cap) {
      return "";
    }
    return cap.inherited ? "Fleet default" : ON_CAP_LABEL[cap.onCap];
  });

  const fleetDefault = $derived(spend ? ON_CAP_LABEL[spend.fleetOnCap] : "");

  let capOpen = $state(false);
  let capAmount = $state("");
  let capPeriod = $state<CapPeriod>("month");
  /** The project's own choice; empty follows the fleet's. */
  let capOnCap = $state<OnCap | "">("");
  let capSaving = $state(false);
  let capRefused = $state<string | null>(null);
  $effect(() => {
    if (capOpen) {
      capAmount = cap ? String(cap.usd) : "";
      capPeriod = cap?.period ?? "month";
      capOnCap = cap && !cap.inherited ? cap.onCap : "";
      capRefused = null;
    }
  });

  async function saveCap(clear = false) {
    const dollars = clear ? undefined : number(capAmount);
    capSaving = true;
    capRefused = null;
    try {
      await setProjectCap(projectId, {
        usd: dollars ?? null,
        period: dollars === undefined ? null : capPeriod,
        onCap: capOnCap === "" ? null : capOnCap,
      });
      capOpen = false;
      await read(projectId);
    } catch (error) {
      capRefused = failureWords(error);
    } finally {
      capSaving = false;
    }
  }

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });
  const STATE_WORD: Record<string, string> = {
    done: "landed",
    failed: "failed",
    cancelled: "stopped",
    running: "working",
    starting: "working",
  };
</script>

<section
  aria-label="{projectName}'s spend"
  class="flex flex-col gap-space-group"
>
  {#if refused && !spend}
    <p data-slot="note" class="type-meta text-ink-muted" role="alert">
      The spend for {projectName} could not be read: {refused}
    </p>
  {:else if !spend}
    <!-- literal: 9.5rem -->
    <div
      class="grid grid-cols-(--tiles) gap-space-3"
      style:--tiles="repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))"
    >
      {#each [0, 1, 2, 3, 4] as i (i)}
        <Skeleton class="h-c-stat-h" radius="tile" />
      {/each}
    </div>
    <Skeleton height="chart" radius="card" />
  {:else}
    <!-- literal: 9.5rem -->
    <div
      class="grid grid-cols-(--tiles) gap-space-3"
      style:--tiles="repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))"
      in:appear
    >
      <StatTile label="Today" value={usd(spend.todayUsd)} />
      <StatTile label="This month" value={usd(spend.monthUsd)} />
      <StatTile
        label="Caw, this month"
        unit={leadOn === false ? "lead off" : undefined}
        value={usd(spend.caw.monthUsd)}
      />
      <StatTile
        data-bad={share !== null && share > 90 ? "" : undefined}
        data-warn={share !== null && share > 70 ? "" : undefined}
        label="Budget"
        tone={capTone}
        unit={cap ? `this ${cap.period} · ${share}%` : undefined}
        value={cap ? `${usd(cap.spentUsd)} / ${usd(cap.usd)}` : "None"}
      >
        {#snippet action()}
          {#if onCapLine}
            <span class="type-meta shrink grow basis-full text-ink-muted"
              >{onCapLine}</span
            >
          {/if}
          <Popover.Root bind:open={capOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <!-- The tile says Budget; the button only what it does, named
                     whole for a reader that hears it on its own. -->
                <Button
                  {...props}
                  aria-label={cap ? "Change budget" : "Set budget"}
                  size="sm"
                  variant="outline">{cap ? "Change" : "Set"}</Button
                >
              {/snippet}
            </Popover.Trigger>
            <Popover.Content
              align="start"
              class="max-w-(--cap-max-w)"
              style="--cap-max-w: calc(100vw - 2 * var(--space-5))"
              width="wide"
            >
              <form
                class="flex flex-col gap-space-3"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveCap();
                }}
              >
                <p data-slot="note" class="type-meta text-ink-muted">
                  What {projectName} may spend, its Caw and its attempts together.
                  Leave it empty for no limit.
                </p>
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                  >Dollars
                  <Input
                    inputmode="decimal"
                    placeholder="20.00"
                    bind:value={capAmount}
                  /></label
                >
                <div
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                >
                  <span>Each</span>
                  <Tabs
                    onValueChange={(next) => {
                      capPeriod = next as CapPeriod;
                    }}
                    value={capPeriod}
                  >
                    <TabsList aria-label="Budget period">
                      <TabItem label="Day" value="day" />
                      <TabItem label="Month" value="month" />
                    </TabsList>
                  </Tabs>
                </div>
                <label
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                  for="cap-on"
                  >When it is reached
                  <NativeSelect
                    class="w-full"
                    id="cap-on"
                    bind:value={capOnCap}
                  >
                    <NativeSelectOption value=""
                      >Fleet default · {fleetDefault}</NativeSelectOption
                    >
                    <NativeSelectOption value="pause"
                      >{ON_CAP_LABEL.pause}</NativeSelectOption
                    >
                    <NativeSelectOption value="quiet"
                      >{ON_CAP_LABEL.quiet}</NativeSelectOption
                    >
                    <NativeSelectOption value="both"
                      >{ON_CAP_LABEL.both}</NativeSelectOption
                    >
                  </NativeSelect>
                </label>
                {#if capRefused}
                  <p
                    data-slot="refused"
                    class="type-meta text-error-11"
                    role="alert"
                    in:appear
                  >
                    {capRefused}
                  </p>
                {/if}
                <div class="flex justify-end gap-space-2">
                  {#if cap}
                    <Button
                      label="Remove"
                      onclick={() => saveCap(true)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    />
                  {/if}
                  <Button
                    label="Save"
                    pending={capSaving}
                    pendingLabel="Saving…"
                    size="sm"
                    type="submit"
                  />
                </div>
              </form>
            </Popover.Content>
          </Popover.Root>
        {/snippet}
      </StatTile>
      <StatTile label="Each attempt" value={budgetLine}>
        {#snippet action()}
          <Popover.Root bind:open={budgetOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  aria-label={spend?.budget
                    ? "Change the attempt limit"
                    : "Set the attempt limit"}
                  size="sm"
                  variant="outline">{spend?.budget ? "Change" : "Set"}</Button
                >
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="start">
              <form
                class="flex flex-col gap-space-3"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveBudget();
                }}
              >
                <p data-slot="note" class="type-meta text-ink-muted">
                  What one attempt at a task may spend before it stops. Leave a
                  field empty for no limit.
                </p>
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                  >Dollars
                  <Input
                    inputmode="decimal"
                    placeholder="2.00"
                    bind:value={amount}
                  /></label
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                  >Turns
                  <Input
                    inputmode="numeric"
                    placeholder="40"
                    bind:value={turns}
                  /></label
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label
                  data-slot="project-spend-field"
                  class="type-meta flex flex-col gap-space-1 text-ink-muted"
                  >Minutes
                  <Input
                    inputmode="numeric"
                    placeholder="30"
                    bind:value={minutes}
                  /></label
                >
                {#if budgetRefused}
                  <p
                    data-slot="refused"
                    class="type-meta text-error-11"
                    role="alert"
                    in:appear
                  >
                    {budgetRefused}
                  </p>
                {/if}
                <Button
                  class="self-end"
                  label="Save"
                  pending={saving}
                  pendingLabel="Saving…"
                  size="sm"
                  type="submit"
                />
              </form>
            </Popover.Content>
          </Popover.Root>
        {/snippet}
      </StatTile>
    </div>

    {#if spend.monthUsd > 0 || spend.threads.length > 0 || spend.attempts.length > 0}
      <!-- This month's ledger: Caw's threads (and his turns no thread
           woke), the attempts, every other session, and their total, which
           is the This month tile. -->
      <div
        data-slot="ledger"
        class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
      >
        <Table.Root
          class="table-fixed border-separate max-phone:block"
          spacing="flush"
          style="--none: 0; --col-count: 8rem; --col-usd: 6rem; --col-last: 6rem; --row-cols: 1fr auto auto"
        >
          {#if spend.threads.length > 0 || spend.caw.unthreadedMonthUsd > 0}
            <Table.Header class="max-phone:block">
              <Table.Row class="max-phone:flex" variant="band">
                <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
                <Table.Head
                  class="h-c-toolbar-ctl"
                  variant="caps"
                  scope="col">Caw</Table.Head
                >
                <Table.Head
                  class="h-c-toolbar-ctl w-(--col-count) max-phone:hidden"
                  variant="caps"
                  scope="col">Wakes</Table.Head
                >
                <Table.Head
                  class="h-c-toolbar-ctl w-(--col-usd) text-end max-phone:hidden"
                  variant="caps"
                  scope="col">Spent</Table.Head
                >
                <Table.Head
                  data-col-last
                  class="h-c-toolbar-ctl w-(--col-last) text-end max-phone:hidden"
                  variant="caps"
                  scope="col">Last</Table.Head
                >
                <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
              </Table.Row>
            </Table.Header>
            <Table.Body class="max-phone:block">
              {#each spend.threads as thread (thread.id)}
                <Table.Row
                  data-project-spend-row
                  class="relative max-phone:grid max-phone:grid-cols-(--row-cols)"
                  variant="stacks"
                >
                  <Table.Cell
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto max-phone:col-span-full"
                  >
                    <a
                      data-slot="name"
                      class="type-label block truncate text-ink-row no-underline"
                      href="/session/thread:{thread.id}"
                      >Thread · {thread.title}</a
                    >
                  </Table.Cell>
                  <Table.Cell
                    data-num
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-count)"
                    >{thread.wakes}
                    {thread.wakes === 1 ? "wake" : "wakes"}</Table.Cell
                  >
                  <Table.Cell
                    data-num
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-usd) text-end max-phone:text-start"
                    >{usd(thread.usd)}</Table.Cell
                  >
                  <Table.Cell
                    data-num
                    data-col-last
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-last) text-end max-phone:text-start"
                    >{formatAgeShort(thread.lastAt, now)}</Table.Cell
                  >
                </Table.Row>
              {/each}
              {#if spend.caw.unthreadedMonthUsd > 0}
                <Table.Row
                  data-project-spend-row
                  class="relative max-phone:grid max-phone:grid-cols-(--row-cols)"
                  variant="stacks"
                >
                  <Table.Cell
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto max-phone:col-span-full"
                    ><span
                      data-slot="name"
                      class="type-label block truncate text-ink-row no-underline"
                      >Not in a thread</span
                    ></Table.Cell
                  >
                  <Table.Cell
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-count)"
                  ></Table.Cell>
                  <Table.Cell
                    data-num
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-usd) text-end max-phone:text-start"
                    >{usd(spend.caw.unthreadedMonthUsd)}</Table.Cell
                  >
                  <Table.Cell
                    data-col-last
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-last) text-end max-phone:text-start"
                  ></Table.Cell>
                </Table.Row>
              {/if}
            </Table.Body>
          {/if}
          {#if spend.attempts.length > 0}
            <Table.Header class="max-phone:block">
              <Table.Row class="max-phone:flex" variant="band">
                <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
                <Table.Head
                  class="h-c-toolbar-ctl"
                  variant="caps"
                  scope="col">Attempts</Table.Head
                >
                <Table.Head
                  class="h-c-toolbar-ctl w-(--col-count) max-phone:hidden"
                  variant="caps"
                  scope="col">Tries</Table.Head
                >
                <Table.Head
                  class="h-c-toolbar-ctl w-(--col-usd) text-end max-phone:hidden"
                  variant="caps"
                  scope="col">Spent</Table.Head
                >
                <Table.Head
                  data-col-last
                  class="h-c-toolbar-ctl w-(--col-last) text-end max-phone:hidden"
                  variant="caps"
                  scope="col">Now</Table.Head
                >
                <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
              </Table.Row>
            </Table.Header>
            <Table.Body class="max-phone:block">
              {#each spend.attempts as attempt (attempt.taskId)}
                <Table.Row
                  data-project-spend-row
                  class="relative max-phone:grid max-phone:grid-cols-(--row-cols)"
                  variant="stacks"
                >
                  <Table.Cell
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto max-phone:col-span-full"
                  >
                    <a
                      data-slot="name"
                      class="type-label block truncate text-ink-row no-underline"
                      href="/project/{encodeURIComponent(
                        projectId
                      )}?task={attempt.taskId}"
                      >{attempt.title}<span
                        data-slot="id"
                        class="type-code ms-space-2 text-ink-subtle"
                        >{attempt.taskId}</span
                      ></a
                    >
                  </Table.Cell>
                  <Table.Cell
                    data-num
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-count)"
                    >{attempt.attempts}
                    {attempt.attempts === 1
                      ? "attempt"
                      : "attempts"}</Table.Cell
                  >
                  <Table.Cell
                    data-num
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-usd) text-end max-phone:text-start"
                    >{usd(attempt.usd)}</Table.Cell
                  >
                  <Table.Cell
                    data-col-last
                    variant="ledger-stacks"
                    class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-last) text-end max-phone:text-start"
                    >{STATE_WORD[attempt.state] ?? attempt.state}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          {/if}
          <Table.Body class="max-phone:block">
            {#if spend.others.monthUsd > 0}
              <Table.Row
                data-project-spend-row
                class="relative max-phone:grid max-phone:grid-cols-(--row-cols)"
                variant="stacks"
              >
                <Table.Cell
                  variant="ledger-stacks"
                  class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto max-phone:col-span-full"
                  ><span
                    data-slot="name"
                    class="type-label block truncate text-ink-row no-underline"
                    >Other sessions</span
                  ></Table.Cell
                >
                <Table.Cell
                  variant="ledger-stacks"
                  class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-count)"
                ></Table.Cell>
                <Table.Cell
                  data-num
                  variant="ledger-stacks"
                  class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-usd) text-end max-phone:text-start"
                  >{usd(spend.others.monthUsd)}</Table.Cell
                >
                <Table.Cell
                  data-col-last
                  variant="ledger-stacks"
                  class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-last) text-end max-phone:text-start"
                ></Table.Cell>
              </Table.Row>
            {/if}
            <Table.Row
              data-project-spend-row
              class="relative max-phone:grid max-phone:grid-cols-(--row-cols)"
              variant="stacks"
            >
              <Table.Cell
                variant="ledger-stacks"
                class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto max-phone:col-span-full"
                ><span
                  data-slot="name"
                  class="type-label block truncate text-ink-row no-underline"
                  >This month</span
                ></Table.Cell
              >
              <Table.Cell
                variant="ledger-stacks"
                class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-count)"
              ></Table.Cell>
              <Table.Cell
                data-num
                variant="ledger-stacks"
                class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto num w-(--col-usd) text-end max-phone:text-start"
                >{usd(spend.monthUsd)}</Table.Cell
              >
              <Table.Cell
                data-col-last
                variant="ledger-stacks"
                class="h-c-btn-h-lg max-phone:block max-phone:h-auto max-phone:w-auto w-(--col-last) text-end max-phone:text-start"
              ></Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </div>
    {:else}
      <p data-slot="note" class="type-meta text-ink-muted">
        No spend on {projectName} yet. The first wake or attempt shows up here.
      </p>
    {/if}
  {/if}
</section>

<style>
  /* residual: pseudo */
  a[data-slot="name"]::after {
    position: absolute;
    inset: 0;
    content: "";
  }
</style>
