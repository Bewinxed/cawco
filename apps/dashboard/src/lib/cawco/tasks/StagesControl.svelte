<script lang="ts">
  import { failureWords } from "#lib/cawco/hub-read.js";
  /**
   * The project has no stages.md, so the code stages stand in. This picks a
   * set of stages for it from the hub's templates (code, launch, SEO, brand,
   * design, social, outreach): the hub writes stages.md into the project folder as a
   * commit, and the board takes its columns from it from then on. Tasks in a
   * stage the new set lacks keep their stage and stand in "Other stages"
   * until they are moved.
   *
   * It is asked for from the project head's ⋯ (Pick stages…), and opens
   * from the control that asked (`anchor`).
   */
  import {
    applyTemplate,
    readTemplates,
    type StagesTemplate,
    type StagesTemplateView,
    type StagesView,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconToolTodo } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest, type AskItem } from "../ask-here.svelte";

  let {
    projectId,
    tasks,
    onapplied,
    anchor,
    open = $bindable(false),
  }: {
    projectId: string;
    /** The project's tasks: a set that lacks their stages names them first. */
    tasks: TaskSummary[];
    onapplied: (stages: StagesView) => void;
    /** What it opens from. */
    anchor: HTMLElement | null;
    open?: boolean;
  } = $props();

  let templates = $state<StagesTemplateView[] | null>(null);
  let problem = $state<string | null>(null);
  let applying = $state<StagesTemplate | null>(null);
  /** The set last chosen: what Try again writes. */
  let lastAsked = $state<StagesTemplateView | null>(null);

  const NAMES: Record<StagesTemplate, string> = {
    code: "Code",
    launch: "Launch campaign",
    seo: "SEO",
    brand: "Brand kit",
    design: "Design",
    social: "Social posts",
    outreach: "Outreach",
  };

  $effect(() => {
    if (open && templates === null) {
      readTemplates().then(
        (read) => {
          templates = read;
        },
        (error: unknown) => {
          problem = failureWords(error);
        }
      );
    }
  });

  /** Writes the set; throws the hub's refusal. */
  async function write(name: StagesTemplate) {
    const { stranded: _, ...stages } = await applyTemplate(projectId, name);
    onapplied(stages);
    open = false;
  }

  /** The tasks a set strands: in a stage it lacks, each with where it stands. */
  const strandedBy = (template: StagesTemplateView): AskItem[] => {
    const kept = new Set(template.stages.map((stage) => stage.name));
    return tasks
      .filter((task) => !kept.has(task.stage))
      .map((task) => ({
        id: task.id,
        title: `${task.id} ${task.title}`,
        lead: { kind: "glyph" as const, icon: IconToolTodo },
        status: stageLabel(task.stage),
      }));
  };

  /**
   * One question at a time, under the set it is about, in the picker: the
   * page and the picker's other sets stay live while it stands.
   */
  const asks = new Asker<AskHereRequest>();
  // The picker put away takes its question with it.
  $effect(() => {
    if (!open) {
      asks.dismiss();
    }
  });

  /**
   * A set that keeps every task's stage is written at once. One that lacks
   * stages tasks stand in asks first, under the set, naming those tasks and
   * where each stands: that is the consequence of the choice, said before it
   * is made.
   */
  async function apply(template: StagesTemplateView) {
    const { name } = template;
    problem = null;
    if (strandedBy(template).length > 0) {
      await asks.ask({
        at: name,
        title: `Use the ${NAMES[name]} stages?`,
        body: "The set lacks the stage each task below stands in. Each keeps its stage and stands in Other stages until moved.",
        confirmLabel: `Use ${NAMES[name]}`,
        items: () => strandedBy(template),
        pendingLabel: "Writing stages.md…",
        run: () => write(name),
      });
      return;
    }
    applying = name;
    try {
      await write(name);
    } catch (error) {
      problem = failureWords(error);
    } finally {
      applying = null;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Content
    align="end"
    class="w-80 gap-[var(--space-2)]"
    customAnchor={anchor}
    side="bottom"
  >
    <div class="intro">
      <p data-slot="lead" class="lead">
        This project has no stages of its own yet
      </p>
      <p class="line">
        The code stages stand in until you pick a set. The set is written to
        stages.md in the project folder.
      </p>
    </div>
    <RowFault
      again={applying === null && lastAsked
        ? () => apply(lastAsked as StagesTemplateView)
        : undefined}
      class="stages-fault"
      reason={problem}
    />
    <ul data-slot="list" class="list">
      {#if templates}
        {#each templates as template (template.name)}
          <li>
            <button
              aria-expanded={asks.pending?.at === template.name}
              class="kit-item template"
              disabled={applying !== null}
              onclick={() => {
                lastAsked = template;
                apply(template);
              }}
              type="button"
            >
              <span data-slot="name" class="name mark-line" data-box>
                <span>{NAMES[template.name]}</span>
                {#if applying === template.name}
                  <Spinner class="ml-auto" />
                {/if}
              </span>
              <span class="chain">
                {template.stages
                  .filter((stage) => stage.kind !== "dropped")
                  .map((stage) => stageLabel(stage.name))
                  .join(" → ")}
              </span>
            </button>
            <AskHere asker={asks} at={template.name} class="stages-ask" />
          </li>
        {/each}
      {:else if !problem}
        {#each [0, 1, 2, 3, 4, 5, 6] as row (row)}
          <li class="template-skeleton">
            <Skeleton class="h-space-4 w-24" />
            <Skeleton class="h-icon-sm w-full" />
          </li>
        {/each}
      {/if}
    </ul>
  </Popover.Content>
</Popover.Root>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2) 0;
  }
  .lead {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .template {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-row);
    inline-size: 100%;
    block-size: auto;
    padding: var(--space-2) var(--space-3);
    text-align: start;
  }
  @media (hover: hover) and (pointer: fine) {
    .template:hover:not(:disabled) {
      background: var(--surface-hover);
    }
  }
  .template:disabled {
    opacity: 0.5;
  }
  .name {
    display: flex;
    align-items: center;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .chain {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .template-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
  }
  :global(.stages-fault) {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);
  }
  :global(.stages-ask) {
    --ask-indent: var(--space-2);
    --ask-end: var(--space-2);
  }
</style>
