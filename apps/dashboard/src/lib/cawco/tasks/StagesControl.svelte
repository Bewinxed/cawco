<script lang="ts">
  /**
   * The project has no stages.md, so the code stages stand in. This picks a
   * set of stages for it from the hub's templates (code, social, outreach,
   * SEO, design): the hub writes stages.md into the project folder as a
   * commit, and the board takes its columns from it from then on. Tasks in a
   * stage the new set lacks keep their stage and stand in "Other stages"
   * until they are moved.
   */
  import {
    applyTemplate,
    readTemplates,
    type StagesTemplate,
    type StagesTemplateView,
    type StagesView,
    stageLabel,
  } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconLayers } from "#lib/icons.js";

  let {
    projectId,
    onapplied,
  }: {
    projectId: string;
    onapplied: (stages: StagesView, stranded: string[]) => void;
  } = $props();

  let open = $state(false);
  let templates = $state<StagesTemplateView[] | null>(null);
  let problem = $state<string | null>(null);
  let applying = $state<StagesTemplate | null>(null);

  const NAMES: Record<StagesTemplate, string> = {
    code: "Code",
    social: "Social posts",
    outreach: "Outreach",
    seo: "SEO",
    design: "Design",
  };

  $effect(() => {
    if (open && templates === null) {
      readTemplates().then(
        (read) => {
          templates = read;
        },
        (error: unknown) => {
          problem = error instanceof Error ? error.message : String(error);
        }
      );
    }
  });

  async function apply(name: StagesTemplate) {
    applying = name;
    problem = null;
    try {
      const { stranded, ...stages } = await applyTemplate(projectId, name);
      onapplied(stages, stranded);
      open = false;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      applying = null;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({
      props,
    })}
      <Button {...props} class="pressable" variant="outline">
        <IconLayers />
        Pick stages
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-80 gap-[var(--space-2)]">
    <div class="intro">
      <p class="lead">This project has no stages of its own yet</p>
      <p class="line">
        The code stages stand in until you pick a set. The set is written to
        stages.md in the project folder.
      </p>
    </div>
    {#if problem}
      <p class="problem" role="alert">{problem}</p>
    {/if}
    <ul class="list">
      {#if templates}
        {#each templates as template (template.name)}
          <li>
            <button
              class="kit-item template"
              disabled={applying !== null}
              onclick={() => apply(template.name)}
              type="button"
            >
              <span class="name">
                {NAMES[template.name]}
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
          </li>
        {/each}
      {:else if !problem}
        {#each [0, 1, 2, 3, 4] as row (row)}
          <li class="template-skeleton">
            <Skeleton class="h-3.5 w-24" />
            <Skeleton class="h-3 w-full" />
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
  .problem {
    padding-inline: var(--space-2);
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
