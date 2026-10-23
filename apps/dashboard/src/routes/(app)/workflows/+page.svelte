<script lang="ts">
  import { onMount } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { workflowLaunches } from "#lib/cawco/workflow-launch.svelte.js";
  import {
    refreshWorkflows,
    workflowState,
  } from "#lib/cawco/workflow-state.svelte.js";
  import { createWorkflow } from "#lib/cawco/workflows.js";
  import WorkflowLaunch from "#lib/components/features/workflows/WorkflowLaunch.svelte";
  import WorkflowLaunchParked from "#lib/components/features/workflows/WorkflowLaunchParked.svelte";
  import WorkflowStatus from "#lib/components/features/workflows/WorkflowStatus.svelte";
  import {
    newNode,
    STARTER_PROGRAM,
  } from "#lib/components/features/workflows/workflow-ui.js";
  import { Alert } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconWorkflow } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";

  let busy = $state(false);
  let errorMessage = $state("");
  /** The workflow whose launch form stands open (workflow-launch.svelte.ts), once its row is drawn. */
  const launching = $derived(
    workflowState.workflows.find(
      (workflow) => workflow.id === workflowLaunches.open
    )
  );
  /** Until the first read is in, rows standing where the list will be. */
  const loading = $derived(!workflowState.loaded);
  const live = $derived(cawco.hub === "connected");
  const rows = $derived(
    workflowState.workflows.map((workflow) => {
      const runs = Object.values(workflowState.runs)
        .filter((run) => run.workflowId === workflow.id)
        .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
      return { workflow, runs, last: runs[0] };
    })
  );
  onMount(() => {
    refreshWorkflows();
  });
  /**
   * A row as a card: the name over its status, age and runs, as one block,
   * and Run at the card's end, centred on the block.
   */
  const CARD_COLS = "auto auto minmax(0, 1fr) auto";
  /** The name stands over the block's three facts. */
  const NAME_CELL = "@max-phone/table:col-span-3";
  /** Run stands at the end, down both of the block's lines. */
  const RUN_CELL =
    "@max-phone/table:col-start-4 @max-phone/table:row-span-2 @max-phone/table:row-start-1";
  const GRAPH = { graph: { nodes: [newNode("start")], edges: [] } };
  const PROGRAM = { program: STARTER_PROGRAM };
  /**
   * The two ways a workflow is authored (§13.4): a graph the editor compiles,
   * or a program written by hand. The origin is fixed at creation because
   * there is no decompiler back the other way.
   */
  async function create(source: typeof GRAPH | typeof PROGRAM) {
    busy = true;
    errorMessage = "";
    try {
      const workflow = await createWorkflow({
        name: "program" in source ? "Untitled program" : "Untitled workflow",
        ...source,
      });
      await goto(`/workflows/${workflow.id}`);
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Workflows · CawCo</title></svelte:head>
{#snippet newMenu(inEmptyState: boolean)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={!live || busy}>
      {#snippet child({ props })}
        <Button
          {...props}
          title={live
            ? undefined
            : "Can't create a workflow while the hub is unreachable"}
          type="button"
        >
          New workflow
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align={inEmptyState ? "start" : "end"} width="wide">
      <!-- The title (the pending content: slot and label) on one line, what it
           makes on the next, on a row's pitch (the kit's `titled`). -->
      <DropdownMenu.PendingItem
        label="New graph"
        look="titled"
        pendingLabel="Creating…"
        run={() => create(GRAPH)}
      >
        <small
          class="basis-full text-size-meta leading-body font-normal text-ink-muted"
          >Draw the steps; the hub compiles them.</small
        >
      </DropdownMenu.PendingItem>
      <DropdownMenu.PendingItem
        label="New program"
        look="titled"
        pendingLabel="Creating…"
        run={() => create(PROGRAM)}
      >
        <small
          class="basis-full text-size-meta leading-body font-normal text-ink-muted"
          >Write the steps as TypeScript.</small
        >
      </DropdownMenu.PendingItem>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}
<!-- The ledger's head (DESIGN.md, Density: "a 32px header band"); where the
     ledger is a card it names nothing. -->
{#snippet head()}
  <Table.Header>
    <Table.Row variant="band">
      <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      <Table.Head scope="col" variant="band">Name</Table.Head>
      <Table.Head class="w-c-workflow-when-col" scope="col" variant="band"
        >Last run</Table.Head
      >
      <Table.Head class="w-c-workflow-when-col" scope="col" variant="band"
        >Started</Table.Head
      >
      <Table.Head
        class="w-c-workflow-count-col"
        edge="end"
        scope="col"
        variant="band">Runs</Table.Head
      >
      <Table.Head
        class="w-c-workflow-actions-col"
        edge="end"
        scope="col"
        variant="band"><span class="sr-only">Actions</span></Table.Head
      >
      <!-- biome-ignore-end lint/a11y/noHeaderScope: the tags above -->
    </Table.Row>
  </Table.Header>
{/snippet}

<!-- Under a 640px ledger (the kit's `stacks="phone"`) each row is a card
     (DESIGN.md, Fleet board): the name across it, then the last run, its age
     and count, with Run at the end of that line. The page pads 25px on its
     inline start and 21px on its end, its groups 18px apart (DESIGN.md,
     Layout). -->
<div
  class="relative flex min-w-0 flex-1 flex-col gap-space-5 overflow-y-auto ps-space-7 pe-space-6 py-space-7 type-body text-ink-strong max-phone:p-space-4"
  data-slot="list-page"
>
  <header class="flex flex-wrap items-center justify-between gap-space-2">
    <div>
      <h1 class="mb-space-1 type-title">Workflows</h1>
      <p class="type-meta text-ink-muted">Reusable steps across your fleet.</p>
    </div>
    <div class="flex flex-wrap items-center gap-space-2">
      {@render newMenu(false)}
    </div>
  </header>
  <!-- An outage is said once, by the reconnect banner over the page: a read
       that failed for it adds no line while there are rows to keep showing,
       and a list that was never read says why it is empty. -->
  {#if errorMessage || (workflowState.error && (live || !rows.length))}
    <Alert variant="destructive">{errorMessage || workflowState.error}</Alert>
  {/if}
  <!-- Until the first read is in, rows at the height the list's rows take
       stand where it will be; then the skeleton hands its place to what the
       read brought in its reveal (it leaves the flow as it goes), so nothing
       below them moves. -->
  {#if loading}
    <div
      aria-label="Loading workflows"
      class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
      role="status"
      style:--card-cols={CARD_COLS}
      out:revealOut
    >
      <Table.Root layout="ledger" stacks="phone">
        {@render head()}
        <Table.Body aria-hidden="true">
          {#each [0, 1, 2] as index (index)}
            <Table.Row variant="stacks">
              <Table.Cell class={NAME_CELL} variant="ledger-stacks"
                ><Skeleton
                  height="x-height"
                  radius="line"
                  type="label"
                  width="title"
                /></Table.Cell
              >
              <Table.Cell variant="ledger-stacks"
                ><Skeleton height="badge" width="short" /></Table.Cell
              >
              <Table.Cell variant="ledger-stacks"
                ><Skeleton
                  height="x-height"
                  radius="line"
                  type="meta"
                  width="label"
                /></Table.Cell
              >
              <Table.Cell edge="end" variant="ledger-stacks"
                ><Skeleton
                  height="x-height"
                  radius="line"
                  type="meta"
                  width="glyph"
                /></Table.Cell
              >
              <Table.Cell class={RUN_CELL} edge="end" variant="ledger-stacks"
                ><Skeleton height="control" width="word" /></Table.Cell
              >
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else if !rows.length}
    {#if !workflowState.error}
      <div in:reveal>
        <EmptyState
          icon={IconWorkflow}
          line="A workflow is a graph of steps that run one after another across your fleet."
          title="No workflows yet"
        >
          {#snippet action()}
            {@render newMenu(true)}
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  {:else}
    <div
      class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
      style:--card-cols={CARD_COLS}
      in:reveal
    >
      <Table.Root aria-label="Workflows" layout="ledger" stacks="phone">
        {@render head()}
        <Table.Body>
          {#each rows as { workflow, runs, last } (workflow.id)}
            <Table.Row data-slot="workflow-row" variant="stacks">
              <Table.Cell class={NAME_CELL} variant="ledger-stacks">
                <a
                  data-slot="name"
                  class="pointer-hit focus-inset flex min-w-0 flex-col justify-center rounded-xs text-inherit no-underline coarse:min-h-c-btn-h-lg"
                  href="/workflows/{workflow.id}"
                  ><span class="truncate type-label text-ink-strong"
                    >{workflow.name}</span
                  >{#if workflow.description}<span class="truncate"
                      >{workflow.description}</span
                    >{/if}</a
                >
                <WorkflowLaunchParked workflowId={workflow.id} />
              </Table.Cell>
              <Table.Cell variant="ledger-stacks">
                {#if last}
                  <WorkflowStatus status={last.status} />
                {:else}
                  No runs
                {/if}
              </Table.Cell>
              <Table.Cell data-slot="age" variant="ledger-stacks">
                {last ? formatDistanceToNow(new Date(last.startedAt)) : "—"}
              </Table.Cell>
              <!-- The column's head says Runs; in the card, the count says it. -->
              <Table.Cell data-slot="count" edge="end" variant="ledger-stacks"
                >{runs.length}<span class="hidden @max-phone/table:inline"
                  >{runs.length === 1 ? " run" : " runs"}</span
                ></Table.Cell
              >
              <Table.Cell class={RUN_CELL} edge="end" variant="ledger-stacks">
                <Button
                  data-run-workflow={workflow.id}
                  disabled={!live}
                  onclick={(event) => {
                    workflowLaunches.openFor(
                      workflow.id,
                      workflow.name,
                      event.currentTarget
                    );
                  }}
                  title={live
                    ? undefined
                    : "Can't run while the hub is unreachable"}
                  type="button"
                  variant="outline"
                >
                  Run
                </Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</div>
{#if launching}
  {#key launching.id}
    <WorkflowLaunch workflow={launching} />
  {/key}
{/if}
