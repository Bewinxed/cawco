<script lang="ts">
  /**
   * Option B, the step ledger: a workflow is its rows, one a step, each the
   * work item it becomes (SessionTree's rows and nest lines), so the editor
   * and the run look alike. Shape swaps the rows for their dagre picture.
   * Created from blank, from Caw's draft approved row by row, or from a
   * finished run kept. Fixture for the option's canvas.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconHistory,
    IconListCheck,
    IconPlus,
    IconSparkles,
    IconStructure,
  } from "#lib/icons.js";
  import {
    BRIEF,
    CHECK_ROWS,
    KIND_WORD,
    STEPS,
    type Step,
    VERSION,
    WORKFLOW,
  } from "./release";
  import { endedTree, ROOT_LINE } from "./run-tree";
  import WfBlock from "./WfBlock.svelte";
  import WfCallFields from "./WfCallFields.svelte";
  import WfChecks from "./WfChecks.svelte";
  import WfDesk from "./WfDesk.svelte";
  import WfLedger from "./WfLedger.svelte";
  import WfPhone from "./WfPhone.svelte";
  import WfRunBody from "./WfRunBody.svelte";
  import WfRuns from "./WfRuns.svelte";
  import WfShape from "./WfShape.svelte";
  import WfTree, { type TreeNode } from "./WfTree.svelte";

  let {
    view,
  }: {
    view: "open" | "live" | "past" | "create" | "phone" | "phone-run";
  } = $props();

  /** A step as its ledger row: its delegate's mark, type, brief and what it waits on. */
  const rowOf = (step: Step, phone = false): TreeNode => ({
    id: step.id,
    title: phone ? step.short : step.title,
    mark: step.kind === "agent" ? "session" : step.kind,
    status: "idle",
    tag: step.kind === "agent" ? step.who : KIND_WORD[step.kind],
    line: [
      step.kind === "call" ? `${step.who} · ${step.call?.tool}` : step.brief,
      step.when,
      step.doneWhen && !phone ? `Done when: ${step.doneWhen}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    trail:
      step.after.length > 0 ? `after ${step.after.join(", ")}` : undefined,
  });
  const ledgerRoot = (phone = false): TreeNode => ({
    id: "release-orchestrator",
    title: phone ? "Orchestrator" : `${WORKFLOW} · its orchestrator`,
    mark: "session",
    status: "idle",
    line: phone ? "Starts with version" : "Starts with: version",
    kids: STEPS.map((step) => rowOf(step, phone)),
  });

  /** Caw's draft: the rows he proposed, two kept so far. */
  const KEPT = new Set(["notes", "links"]);
  const draftRoot: TreeNode = {
    id: "release-draft",
    title: "Caw's draft · 5 steps",
    mark: "session",
    status: "idle",
    line: "From: release a version, notes and links, Slack, ask me, smoke test on beta",
    kids: STEPS.map((step) => ({
      ...rowOf(step),
      planned: !KEPT.has(step.id),
    })),
  };
</script>

{#snippet stepsFoot()}
  <div
    class="flex flex-wrap items-center gap-space-2 ps-(--at)"
    style:--at="calc(var(--space-3) + var(--c-row-mark) + var(--space-2) + var(--tree-step))"
  >
    <Button size="xs" variant="ghost"><IconPlus /><span>Add a step</span></Button>
  </div>
{/snippet}

{#snippet steps(phone: boolean)}
  <WfTree label="Release 2.4's steps" compact={phone} root={ledgerRoot(phone)}>
    {#snippet under(node)}
      {#if node.id === "post" && !phone}
        <div
          class="pe-space-3 pt-space-1 pb-space-3 ps-(--at)"
          style:--at="calc(var(--space-3) + var(--c-row-mark) + var(--space-2))"
        >
          <WfCallFields id="b-post" />
        </div>
      {/if}
    {/snippet}
  </WfTree>
  {@render stepsFoot()}
{/snippet}

{#snippet detailHead(shape: boolean)}
  <div class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2">
    <Tabs size="compact" value={shape ? "shape" : "ledger"}>
      <TabsList aria-label="Release 2.4 as">
        <TabItem label="Ledger" value="ledger" />
        <TabItem label="Shape" value="shape" />
      </TabsList>
    </Tabs>
    <span class="flex-auto type-meta text-ink-muted"
      >{VERSION} · saved 2m ago · 12 runs</span
    >
  </div>
{/snippet}

{#snippet briefAndInputs(phone: boolean)}
  <div
    class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,var(--c-key-field-basis)),1fr))] gap-space-3"
  >
    <div class="col-span-full flex min-w-0 flex-col gap-space-1">
      <Label for="b-brief-{phone}">Brief</Label>
      <Textarea id="b-brief-{phone}" rows={2} value={BRIEF} />
    </div>
    <div class="flex min-w-0 flex-col gap-space-1">
      <Label for="b-version-{phone}">Input · version</Label>
      <Input id="b-version-{phone}" placeholder="2.4" />
    </div>
  </div>
{/snippet}

{#snippet detailFoot()}
  <div class="flex min-w-0 flex-wrap items-center gap-space-2">
    <span class="mark-line inline-flex flex-auto items-center gap-space-1 type-meta text-ink-muted"
      ><IconListCheck aria-hidden="true" class="size-icon-sm" /><span
        >3 checks, and 2 on steps</span
      ></span
    >
    <Button size="sm" variant="outline">Save as v4</Button>
    <Button size="sm" variant="default">Run now</Button>
  </div>
{/snippet}

{#snippet detail(shape: boolean)}
  <div class="flex min-w-0 flex-col gap-space-4 px-space-3 pt-space-2 pb-space-4">
    {@render detailHead(shape)}
    {@render briefAndInputs(false)}
    {#if shape}
      <div class="h-c-decision-graph-min-h min-w-0">
        <WfShape label="Release 2.4's shape, from its rows" />
      </div>
    {:else}
      <div class="flex min-w-0 flex-col gap-space-1">
        {@render steps(false)}
      </div>
    {/if}
    {@render detailFoot()}
  </div>
{/snippet}

{#snippet workflowsAction()}
  <span class="flex flex-wrap justify-end gap-space-2">
    <Button size="sm" variant="outline">Ask Caw</Button>
    <Button size="sm" variant="outline">Create workflow</Button>
  </span>
{/snippet}

{#snippet runDetail(_n: number)}
  <div class="flex min-w-0 flex-col gap-space-3 px-space-3 pt-space-2 pb-space-4">
    <WfTree label="Run 10's steps as it ended" root={endedTree()} />
    <div class="flex flex-wrap gap-space-2 ps-space-3">
      <Button size="sm" variant="outline">Run again with 2.3</Button>
      <Button size="sm" variant="ghost">Retry the smoke test</Button>
    </div>
  </div>
{/snippet}

{#snippet checksBlock(span: 1 | 2)}
  <WfBlock count={4} glyph={IconListCheck} id="checks" {span} title="Checks">
    {#snippet action()}
      <Button size="sm" variant="outline">Add a check</Button>
    {/snippet}
    <WfChecks
      rows={[
        ...CHECK_ROWS,
        {
          sentence: "0 failed",
          scope: "Step 5 · Run the smoke test · on its report alone",
          held: 2,
          judged: 3,
          recent: ["neutral", "done", "failed", "done", "neutral"],
        },
      ]}
    />
  </WfBlock>
{/snippet}

{#if view === "phone"}
  <WfPhone>
    <WfBlock count={2} glyph={IconStructure} id="workflows" title="Workflows">
      {#snippet action()}
        <Button aria-label="Create workflow" size="icon-sm" variant="ghost"
          ><IconPlus /></Button
        >
      {/snippet}
      <div class="flex min-w-0 flex-col gap-space-3 p-space-3">
        <div class="flex min-w-0 flex-col">
          <span class="type-label text-ink-strong">{WORKFLOW}</span>
          <span class="type-meta text-ink-muted">{VERSION} · run 12 needs you · 4m</span>
        </div>
        {@render briefAndInputs(true)}
        <div class="-mx-space-3 flex min-w-0 flex-col gap-space-1">
          {@render steps(true)}
        </div>
        <div class="flex flex-wrap gap-space-2">
          <Button class="flex-auto" size="sm" variant="outline">Save</Button>
          <Button class="flex-auto" size="sm" variant="default">Run now</Button>
        </div>
      </div>
    </WfBlock>
  </WfPhone>
{:else if view === "phone-run"}
  <WfPhone back={{ title: `${WORKFLOW} · run 12` }} line="Needs you · 4m · {ROOT_LINE}">
    <WfRunBody phone />
  </WfPhone>
{:else}
  <WfDesk
    beside={view === "live" ? runSide : undefined}
    sideActions={view === "live" ? runActions : undefined}
    sideLabel="Run 12"
    sideSubtitle="Needs you · 4m · {ROOT_LINE}"
    sideTitle="{WORKFLOW} · run 12"
  >
    {#snippet page()}
      <div class="grid min-w-0 grid-cols-2 gap-space-group max-phone:grid-cols-1">
        {#if view === "create"}
          <WfBlock count={2} glyph={IconStructure} id="workflows" title="Workflows">
            {#snippet action()}
              {@render workflowsAction()}
            {/snippet}
            <div class="flex min-w-0 flex-col gap-space-4 p-space-3">
              <div
                class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,var(--c-key-field-basis)),1fr))] gap-space-3"
              >
                <div class="flex min-w-0 flex-col gap-space-1">
                  <Label for="b-new-name">Name</Label>
                  <Input id="b-new-name" value={WORKFLOW} />
                </div>
                <div class="flex min-w-0 flex-col gap-space-1">
                  <Label for="b-new-ask">Ask Caw to draft the steps</Label>
                  <Input
                    id="b-new-ask"
                    value="Release a version: notes and links, post to Slack, ask me the channel, smoke test on beta"
                  />
                </div>
              </div>
              <section
                aria-labelledby="b-draft"
                class="flex min-w-0 flex-col gap-space-2 rounded-lg border border-border-control bg-surface-raised pt-space-3 pb-space-2"
              >
                <h3
                  id="b-draft"
                  class="mark-line m-0 flex flex-wrap items-center gap-space-2 px-space-3 type-label text-ink-strong"
                >
                  <IconSparkles aria-hidden="true" class="size-icon-md text-ink-muted" />
                  <span class="flex-auto">Caw drafted 5 steps. Keep each one you want.</span>
                  <Badge variant="secondary"><span>2 of 5 kept</span></Badge>
                </h3>
                <WfTree label="Caw's draft" root={draftRoot}>
                  {#snippet under(node)}
                    {#if node.planned}
                      <div
                        class="flex flex-wrap gap-space-2 pe-space-3 pb-space-2 ps-(--at)"
                        style:--at="calc(var(--space-3) + var(--c-row-mark) + var(--space-2))"
                      >
                        <Button size="xs" variant="outline">Keep</Button>
                        <Button size="xs" variant="ghost">Drop</Button>
                      </div>
                    {/if}
                  {/snippet}
                </WfTree>
              </section>
              <p class="m-0 max-w-c-measure type-meta text-ink-muted">
                Or start from a finished run: on its tree, ⋯ › Keep as workflow
                writes one row for each delegate it started.
              </p>
              <div class="flex flex-wrap justify-end gap-space-2">
                <Button size="sm" variant="ghost">Cancel</Button>
                <Button size="sm" variant="outline">Add a step by hand</Button>
                <Button size="sm" variant="default">Save workflow</Button>
              </div>
            </div>
          </WfBlock>
        {:else if view === "past"}
          <WfBlock count={12} glyph={IconHistory} id="runs" title="Runs">
            <WfRuns open={10}>
              {#snippet detail(n)}
                {@render runDetail(n)}
              {/snippet}
            </WfRuns>
          </WfBlock>
          {@render checksBlock(2)}
        {:else}
          <WfBlock count={2} glyph={IconStructure} id="workflows" needs={1} title="Workflows">
            {#snippet action()}
              {@render workflowsAction()}
            {/snippet}
            <WfLedger>
              {#snippet detail()}
                {@render detailOf(view === "live")}
              {/snippet}
            </WfLedger>
          </WfBlock>
          {#if view === "open"}
            <WfBlock count={12} glyph={IconHistory} id="runs" span={1} title="Runs">
              <WfRuns limit={3} />
            </WfBlock>
            {@render checksBlock(1)}
          {/if}
        {/if}
      </div>
    {/snippet}
  </WfDesk>
{/if}

{#snippet detailOf(shape: boolean)}
  {@render detail(shape)}
{/snippet}

{#snippet runSide()}
  <WfRunBody />
{/snippet}

{#snippet runActions()}
  <Button size="sm" variant="outline">Stop run</Button>
{/snippet}
