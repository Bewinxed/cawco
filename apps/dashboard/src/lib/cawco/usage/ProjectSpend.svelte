<script lang="ts">
  /**
   * One project's spend (fable-lead-switch.md §2): four tiles — today, this
   * month, its Caw's share this month, and what an attempt may spend — then
   * a ledger: Caw's threads with how often each woke him, and each task's
   * attempts with what they cost and how the newest stands. Rows open the
   * thread or the task. A thread's dollars are the turns it woke: each
   * turn's share of the lead session's cost, booked by the hub.
   */
  import type { ProjectSpend } from "@cawco/core";
  import { projectSpend, setProjectBudget } from "#lib/cawco/client.svelte.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import StatTile from "#lib/cawco/StatTile.svelte";
  import { usd } from "#lib/cawco/usage.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
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
      refused = error instanceof Error ? error.message : String(error);
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
      return "Not set";
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
      budgetRefused = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
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

<section aria-label="{projectName}'s spend" class="project-spend">
  {#if refused && !spend}
    <p class="note" role="alert">
      The spend for {projectName} could not be read: {refused}
    </p>
  {:else if !spend}
    <div class="tiles">
      {#each [0, 1, 2, 3] as i (i)}
        <Skeleton class="h-[var(--c-stat-h)] rounded-[var(--radius-md)]" />
      {/each}
    </div>
    <Skeleton class="h-48 rounded-[var(--radius-lg)]" />
  {:else}
    <div class="tiles" in:appear>
      <StatTile label="Today" value={usd(spend.todayUsd)} />
      <StatTile label="This month" value={usd(spend.monthUsd)} />
      <StatTile
        label="Caw, this month"
        unit={leadOn === false ? "lead off" : undefined}
        value={usd(spend.caw.monthUsd)}
      />
      <StatTile label="Budget" unit="an attempt" value={budgetLine}>
        {#snippet action()}
          <Popover.Root bind:open={budgetOpen}>
            <Popover.Trigger>
              {#snippet child({
                props,
              })}
                <Button {...props} size="sm" variant="outline"
                  >Set budget</Button
                >
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="start" class="w-72">
              <form
                class="budget"
                onsubmit={(event) => {
                  event.preventDefault();
                  saveBudget();
                }}
              >
                <p class="note">
                  What one attempt at a task may spend before it stops. Leave a
                  field empty for no limit.
                </p>
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label class="field"
                  >Dollars
                  <Input
                    inputmode="decimal"
                    placeholder="2.00"
                    bind:value={amount}
                  /></label
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label class="field"
                  >Turns
                  <Input
                    inputmode="numeric"
                    placeholder="40"
                    bind:value={turns}
                  /></label
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child -->
                <label class="field"
                  >Minutes
                  <Input
                    inputmode="numeric"
                    placeholder="30"
                    bind:value={minutes}
                  /></label
                >
                {#if budgetRefused}
                  <p class="refused" role="alert" in:appear>{budgetRefused}</p>
                {/if}
                <Button
                  class="self-end"
                  label="Save budget"
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

    {#if spend.threads.length > 0 || spend.attempts.length > 0}
      <div class="ledger">
        <Table.Root class="table-fixed">
          {#if spend.threads.length > 0}
            <Table.Header>
              <Table.Row class="band border-0">
                <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
                <Table.Head class="col-name" scope="col">Caw</Table.Head>
                <Table.Head class="col-count" scope="col">Wakes</Table.Head>
                <Table.Head class="col-usd" scope="col">Spent</Table.Head>
                <Table.Head class="col-last" scope="col">Last</Table.Head>
                <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each spend.threads as thread (thread.id)}
                <Table.Row class="row">
                  <Table.Cell class="col-name">
                    <a class="name" href="/session/thread:{thread.id}"
                      >Thread · {thread.title}</a
                    >
                  </Table.Cell>
                  <Table.Cell class="col-count num"
                    >{thread.wakes}
                    {thread.wakes === 1 ? "wake" : "wakes"}</Table.Cell
                  >
                  <Table.Cell class="col-usd num">{usd(thread.usd)}</Table.Cell>
                  <Table.Cell class="col-last num"
                    >{formatAgeShort(thread.lastAt, now)}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          {/if}
          {#if spend.attempts.length > 0}
            <Table.Header>
              <Table.Row class="band border-0">
                <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
                <Table.Head class="col-name" scope="col">Attempts</Table.Head>
                <Table.Head class="col-count" scope="col">Tries</Table.Head>
                <Table.Head class="col-usd" scope="col">Spent</Table.Head>
                <Table.Head class="col-last" scope="col">Now</Table.Head>
                <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each spend.attempts as attempt (attempt.taskId)}
                <Table.Row class="row">
                  <Table.Cell class="col-name">
                    <a
                      class="name"
                      href="/project/{encodeURIComponent(
                        projectId
                      )}?task={attempt.taskId}"
                      ><span class="id">{attempt.taskId}</span>
                      {attempt.title}{attempt.type
                        ? ` · ${attempt.type}`
                        : ""}</a
                    >
                  </Table.Cell>
                  <Table.Cell class="col-count num"
                    >{attempt.attempts}
                    {attempt.attempts === 1
                      ? "attempt"
                      : "attempts"}</Table.Cell
                  >
                  <Table.Cell class="col-usd num"
                    >{usd(attempt.usd)}</Table.Cell
                  >
                  <Table.Cell class="col-last"
                    >{STATE_WORD[attempt.state] ?? attempt.state}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          {/if}
        </Table.Root>
      </div>
    {:else}
      <p class="note">
        No spend on {projectName} yet. The first wake or attempt shows up here.
      </p>
    {/if}
  {/if}
</section>

<style>
  .project-spend {
    display: flex;
    flex-direction: column;
    gap: var(--space-group);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }
  .budget {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .refused {
    font: var(--type-meta);
    color: var(--error-11);
  }
  .ledger {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .ledger :global(table) {
    border-collapse: separate;
    border-spacing: 0;
  }
  .ledger :global(tr.band) {
    background: var(--surface-band);
  }
  .ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .ledger :global(tr.row) {
    position: relative;
  }
  .ledger :global(tr.row td) {
    block-size: var(--c-btn-h-lg);
    padding-block: 0;
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .ledger :global(.col-count) {
    inline-size: 8rem;
  }
  .ledger :global(.col-usd) {
    inline-size: 6rem;
    text-align: end;
    color: var(--ink-strong);
  }
  .ledger :global(.col-last) {
    inline-size: 6rem;
    text-align: end;
  }
  .name {
    display: block;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  .id {
    margin-inline-end: var(--space-2);
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  @media (max-width: 899px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* Under 640px each ledger row is a two-line card: the name, then the rest. */
  @media (max-width: 639px) {
    .ledger :global(table),
    .ledger :global(tbody),
    .ledger :global(thead) {
      display: block;
    }
    .ledger :global(tr.band) {
      display: flex;
    }
    .ledger :global(tr.band th:not(.col-name)) {
      display: none;
    }
    .ledger :global(tr.row) {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-block-end: 1px solid var(--border-hairline);
    }
    .ledger :global(tr.row td) {
      display: block;
      inline-size: auto;
      block-size: auto;
      padding: 0;
      border: 0;
      text-align: start;
    }
    .ledger :global(tr.row td.col-name) {
      grid-column: 1 / -1;
    }
  }
</style>
