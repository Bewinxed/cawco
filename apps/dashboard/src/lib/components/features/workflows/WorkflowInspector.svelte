<script lang="ts">
  import type {
    DelegateType,
    JevNodeQuestion,
    Problem,
    WorkflowCheckRule,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowInput,
    WorkflowListing,
    WorkflowNode,
  } from "@cawco/core";
  import { EFFORT_LEVELS, workflowPorts } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { newId } from "#lib/cawco/id.js";
  import { crossIn, crossOut, dur } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { NativeSelect } from "#lib/components/ui/native-select/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import JsonField from "./JsonField.svelte";
  import SchemaBuilder from "./SchemaBuilder.svelte";
  import TemplateInput from "./TemplateInput.svelte";
  import WhenFields from "./WhenFields.svelte";
  import {
    ENTRY,
    inspectorTitle,
    JEV_TYPE_NAMES,
    templatePaths,
    upstream,
  } from "./workflow-ui";

  let {
    graph,
    node,
    edge,
    types,
    workflows,
    workflowId,
    description,
    problems,
    onchange,
    ondescription,
    onselect,
    editBody,
    sheet = false,
  }: {
    graph: WorkflowGraph;
    node?: WorkflowNode;
    edge?: WorkflowEdge;
    types: DelegateType[];
    workflows: WorkflowListing[];
    workflowId: string;
    description: string;
    problems: Problem[];
    onchange: (graph: WorkflowGraph) => void;
    ondescription: (value: string) => void;
    onselect: (id?: string) => void;
    editBody: (id: string) => void;
    /**
     * It stands in a sheet (the narrow editor's drawer): the sheet's header
     * names what it holds (inspectorTitle), so it draws no head of its own,
     * and its edges are the sheet's.
     */
    sheet?: boolean;
  } = $props();
  const title = $derived(inspectorTitle(node, edge));
  /**
   * The Add rule and Connect selects are actions, not settings: each stands
   * on its placeholder at rest. Their value is held here and set back to ""
   * once the choice is acted on; the kit select binds its value, so a write
   * to the element alone is undone by the binding's next flush.
   */
  let ruleChoice = $state("");
  let connectChoice = $state<Record<string, string>>({});
  const paths = $derived(node ? templatePaths(graph, node.id) : []);
  const child = $derived(
    node?.kind === "workflow"
      ? workflows.find((workflow) => workflow.id === node?.workflowId)
      : undefined
  );
  const childStart = $derived(
    child?.graph?.nodes.find((entry) => entry.kind === "start")
  );
  function patch(fields: object) {
    if (node) {
      onchange({
        ...graph,
        nodes: graph.nodes.map((entry) =>
          entry.id === node?.id
            ? ({ ...entry, ...fields } as WorkflowNode)
            : entry
        ),
      });
    }
  }
  function patchEdge(fields: Partial<WorkflowEdge>) {
    if (edge) {
      onchange({
        ...graph,
        edges: graph.edges.map((entry) =>
          entry.id === edge?.id ? { ...entry, ...fields } : entry
        ),
      });
    }
  }
  function settings(fields: object) {
    onchange({ ...graph, settings: { ...graph.settings, ...fields } });
  }
  function input(index: number, fields: Partial<WorkflowInput>) {
    if (node?.kind === "start") {
      patch({
        inputs: node.inputs.map((entry, i) =>
          i === index ? { ...entry, ...fields } : entry
        ),
      });
    }
  }
  function rule(index: number, fields: object) {
    if (node?.kind === "check") {
      patch({
        rules: node.rules.map((entry, i) =>
          i === index ? { ...entry, ...fields } : entry
        ),
      });
    }
  }
  function addRule(kind: WorkflowCheckRule["kind"]) {
    if (node?.kind !== "check") {
      return;
    }
    const rules: Record<WorkflowCheckRule["kind"], WorkflowCheckRule> = {
      schema: { kind: "schema", schema: { type: "object", properties: {} } },
      regex: { kind: "regex", path: "result", pattern: "", mustMatch: true },
      "forbidden-words": { kind: "forbidden-words", path: "result", words: [] },
      "file-exists": { kind: "file-exists", path: "" },
      command: { kind: "command", cmd: "", expectExit: 0 },
    };
    patch({ rules: [...node.rules, rules[kind]] });
  }
  function question(index: number, next: JevNodeQuestion) {
    if (node?.kind === "jev") {
      patch({
        questions: node.questions.map((entry, i) =>
          i === index ? next : entry
        ),
      });
    }
  }
  /** A new type starts from that type's smallest valid criteria. */
  function retype(index: number, type: JevNodeQuestion["type"]) {
    if (node?.kind !== "jev") {
      return;
    }
    const { id, instructions } = node.questions[index];
    const fresh: Record<JevNodeQuestion["type"], JevNodeQuestion> = {
      noul: { id, type: "noul", instructions },
      choice: {
        id,
        type: "choice",
        instructions,
        criteria: [
          { option: "", meaning: "" },
          { option: "", meaning: "" },
        ],
      },
      score: { id, type: "score", instructions, criteria: ["", ""] },
    };
    question(index, fresh[type]);
  }
  function preset(name: string) {
    const type = types.find((entry) => entry.name === name);
    patch(
      type
        ? {
            delegateType: name,
            harness: type.harness,
            model: type.model,
            effort: type.effort,
            skills: type.skills,
            denyTools: type.denyTools,
          }
        : { delegateType: undefined }
    );
  }
  const split = (text: string) =>
    text
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  function connect(port: string, target: string) {
    if (!(node && target)) {
      return;
    }
    const cycle =
      target === node.id ||
      upstream(graph, node.id).some((entry) => entry.id === target);
    onchange({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: newId(),
          from: { node: node.id, port },
          to: { node: target },
          ...(cycle ? { maxIterations: 3 } : {}),
        },
      ],
    });
  }
</script>

<section
  aria-label="Workflow inspector"
  class="flex min-w-0 flex-col gap-space-4 px-space-4 pt-space-5 pb-space-8 type-body text-ink-strong data-sheet:px-0 data-sheet:pt-space-3 data-sheet:pb-space-4"
  data-sheet={sheet || undefined}
>
  <!-- What is selected gives way to the next in place: the two cross-fade
       (the one leaving is taken out of the flow) while the box tweens to
       the new one's height, and the problems below slide with it. -->
  <div
    data-slot="swap"
    class="relative min-w-0"
    {@attach morph({ ms: dur("--dur-pop") })}
  >
    {#key node?.id ?? edge?.id ?? "settings"}
      <div class="flex min-w-0 flex-col gap-space-4" in:crossIn out:crossOut>
        {#if node}
          <div class="flex flex-wrap items-center justify-between gap-space-2">
            {#if !sheet}
              <h2 class="type-label">{title}</h2>
            {/if}
            <Button
              class="ms-auto"
              onclick={() => onselect()}
              type="button"
              variant="outline"
            >
              Settings
            </Button>
          </div>
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Title<Input
              oninput={(event) => patch({ title: event.currentTarget.value })}
              value={node.title}
            /></label
          >
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Node ID<Input
              face="mono"
              readonly
              text="label"
              value={node.id}
            /></label
          >
          {#if node.kind === "step"}
            <div class="flex flex-col gap-space-3">
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Run on<NativeSelect
                  class="w-full"
                  onchange={(event) => preset(event.currentTarget.value)}
                  value={node.delegateType ?? ""}
                >
                  <option value="">Manual</option>
                  {#each types as type (type.name)}
                    <option value={type.name}>{type.name}</option>
                  {/each}
                </NativeSelect></label
              >
              <fieldset>
                <legend class="mb-space-2 text-size-label font-medium"
                  >Harness</legend
                >
                <ToggleGroup.Root
                  aria-label="Harness"
                  onValueChange={(harness) => {
                    if (harness) {
                      patch({
                        harness,
                        ...(harness === "claude" ? {} : { denyTools: [] }),
                        ...(harness === "pi" ? { effort: undefined } : {}),
                      });
                    }
                  }}
                  type="single"
                  value={node.harness}
                >
                  {#each ["claude", "opencode", "pi"] as harness (harness)}
                    <ToggleGroup.Item value={harness}
                      >{harness}</ToggleGroup.Item
                    >
                  {/each}
                </ToggleGroup.Root>
              </fieldset>
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Model<Input
                  list="workflow-models"
                  oninput={(event) =>
                    patch({ model: event.currentTarget.value })}
                  value={node.model}
                />
                <datalist id="workflow-models">
                  {#each [...new Set(types
                        .filter((type) => type.harness === node?.harness)
                        .map((type) => type.model))] as model (model)}
                    <option value={model}></option>
                  {/each}
                </datalist></label
              >
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Effort<NativeSelect
                  class="w-full"
                  disabled={node.harness === "pi"}
                  onchange={(event) =>
                    patch({ effort: event.currentTarget.value || undefined })}
                  value={node.effort ?? ""}
                >
                  <option value="">Harness default</option>
                  {#each EFFORT_LEVELS as effort (effort)}
                    <option>{effort}</option>
                  {/each}
                </NativeSelect></label
              >
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Skills (comma-separated)<Input
                  onchange={(event) =>
                    patch({ skills: split(event.currentTarget.value) })}
                  value={node.skills?.join(", ") ?? ""}
                /></label
              >
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Denied tools (Claude only)<Input
                  disabled={node.harness !== "claude"}
                  onchange={(event) =>
                    patch({ denyTools: split(event.currentTarget.value) })}
                  value={node.denyTools?.join(", ") ?? ""}
                /></label
              >
            </div>
            <TemplateInput
              label="Prompt"
              multiline
              onchange={(prompt) => patch({ prompt })}
              {paths}
              value={node.prompt}
            />
            <SchemaBuilder
              onchange={(outputSchema) => patch({ outputSchema })}
              value={node.outputSchema}
            />
            <div
              class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
            >
              <label class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Retries<Input
                  max="5"
                  min="0"
                  oninput={(event) =>
                    patch({ retries: event.currentTarget.valueAsNumber })}
                  type="number"
                  value={node.retries ?? 2}
                /></label
              ><label
                class="flex flex-col gap-space-2 type-label text-ink-muted"
                >Timeout (minutes)<Input
                  min="1"
                  oninput={(event) =>
                    patch({
                      timeoutMinutes: event.currentTarget.valueAsNumber,
                    })}
                  type="number"
                  value={node.timeoutMinutes ?? 60}
                /></label
              >
            </div>
          {:else if node.kind === "start"}
            <h3 class="type-label">Inputs</h3>
            {#each node.inputs as entry, index (index)}
              <div class={ENTRY}>
                <div
                  class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
                >
                  <label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Name<Input
                      oninput={(event) =>
                        input(index, { name: event.currentTarget.value })}
                      value={entry.name}
                    /></label
                  ><label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Label<Input
                      oninput={(event) =>
                        input(index, { label: event.currentTarget.value })}
                      value={entry.label}
                    /></label
                  >
                </div>
                <label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Type<NativeSelect
                    class="w-full"
                    onchange={(event) =>
                      input(index, {
                        type: event.currentTarget
                          .value as WorkflowInput["type"],
                      })}
                    value={entry.type}
                  >
                    <option>text</option>
                    <option>path</option>
                    <option>select</option>
                  </NativeSelect></label
                >
                {#if entry.type === "select"}
                  <label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Options (comma-separated)<Input
                      onchange={(event) =>
                        input(index, {
                          options: split(event.currentTarget.value),
                        })}
                      value={entry.options?.join(", ") ?? ""}
                    /></label
                  >
                {/if}
                <label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Default<Input
                    oninput={(event) =>
                      input(index, { default: event.currentTarget.value })}
                    value={entry.default ?? ""}
                  /></label
                >
                <div
                  class="flex flex-wrap items-center justify-between gap-space-2"
                >
                  <label
                    class="flex min-h-c-input-h items-center gap-space-2 type-label text-ink-muted"
                    ><Checkbox
                      checked={entry.required}
                      onCheckedChange={(checked) =>
                        input(index, { required: checked })}
                    />Required</label
                  ><Button
                    variant="outline"
                    onclick={() =>
                      node?.kind === "start" &&
                      patch({
                        inputs: node.inputs.filter((_, i) => i !== index),
                      })}
                    type="button"
                  >
                    Remove input
                  </Button>
                </div>
              </div>
            {/each}
            <Button
              variant="outline"
              onclick={() =>
                node?.kind === "start" &&
                patch({
                  inputs: [
                    ...node.inputs,
                    {
                      name: `input${node.inputs.length + 1}`,
                      label: "Input",
                      type: "text",
                      required: true,
                    },
                  ],
                })}
              type="button"
            >
              Add input
            </Button>
          {:else if node.kind === "check"}
            {#each node.rules as entry, index (index)}
              <div class={ENTRY}>
                <div
                  class="flex flex-wrap items-center justify-between gap-space-2"
                >
                  <h3 class="type-label">{entry.kind}</h3>
                  <Button
                    variant="outline"
                    onclick={() =>
                      node?.kind === "check" &&
                      patch({
                        rules: node.rules.filter((_, i) => i !== index),
                      })}
                    type="button"
                  >
                    Remove rule
                  </Button>
                </div>
                {#if entry.kind === "schema"}
                  <JsonField
                    label="Schema"
                    objectOnly
                    onchange={(schema) => rule(index, { schema })}
                    value={entry.schema}
                  />
                {:else if entry.kind === "command"}
                  <TemplateInput
                    label="Command"
                    onchange={(cmd) => rule(index, { cmd })}
                    {paths}
                    value={entry.cmd}
                  /><label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Expected exit code<Input
                      oninput={(event) =>
                        rule(index, {
                          expectExit: event.currentTarget.valueAsNumber,
                        })}
                      type="number"
                      value={entry.expectExit}
                    /></label
                  >
                {:else}
                  <TemplateInput
                    label="Path"
                    onchange={(path) => rule(index, { path })}
                    {paths}
                    value={entry.path}
                  />
                  {#if entry.kind === "regex"}
                    <label
                      class="flex flex-col gap-space-2 type-label text-ink-muted"
                      >Pattern<Input
                        oninput={(event) =>
                          rule(index, { pattern: event.currentTarget.value })}
                        value={entry.pattern}
                      /></label
                    ><label
                      class="flex min-h-c-input-h items-center gap-space-2 type-label text-ink-muted"
                      ><Checkbox
                        checked={entry.mustMatch}
                        onCheckedChange={(checked) =>
                          rule(index, { mustMatch: checked })}
                      />Must match</label
                    >
                  {:else if entry.kind === "forbidden-words"}
                    <label
                      class="flex flex-col gap-space-2 type-label text-ink-muted"
                      >Forbidden words (comma-separated)<Input
                        onchange={(event) =>
                          rule(index, {
                            words: split(event.currentTarget.value),
                          })}
                        value={entry.words.join(", ")}
                      /></label
                    >
                  {/if}
                {/if}
              </div>
            {/each}
            <label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Add rule<NativeSelect
                class="w-full"
                onchange={(event) => {
                  addRule(
                    event.currentTarget.value as WorkflowCheckRule["kind"]
                  );
                  ruleChoice = "";
                }}
                bind:value={ruleChoice}
              >
                <option disabled value="">Choose a rule</option>
                {#each ["schema", "regex", "forbidden-words", "file-exists", "command"] as kind (kind)}
                  <option>{kind}</option>
                {/each}
              </NativeSelect></label
            >
          {:else if node.kind === "branch"}
            {#each node.cases as entry, index (index)}
              <div class={ENTRY}>
                {#if index === node.cases.length - 1}
                  <h3 class="type-label">Else</h3>
                {:else}
                  <label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Port label<Input
                      oninput={(event) =>
                        node?.kind === "branch" &&
                        patch({
                          cases: node.cases.map((item, i) =>
                            i === index
                              ? { ...item, port: event.currentTarget.value }
                              : item
                          ),
                        })}
                      value={entry.port}
                    /></label
                  ><WhenFields
                    onchange={(when) =>
                      node?.kind === "branch" &&
                      patch({
                        cases: node.cases.map((item, i) =>
                          i === index ? { ...item, when } : item
                        ),
                      })}
                    value={entry.when}
                  />
                  <div class="flex flex-wrap items-center gap-space-2">
                    <Button
                      variant="outline"
                      disabled={index === 0}
                      onclick={() => {
                        if (node?.kind !== "branch") {
                          return;
                        }
                        const cases = [...node.cases];
                        [cases[index - 1], cases[index]] = [
                          cases[index],
                          cases[index - 1],
                        ];
                        patch({ cases });
                      }}
                      type="button"
                    >
                      Move up
                    </Button><Button
                      variant="outline"
                      onclick={() =>
                        node?.kind === "branch" &&
                        patch({
                          cases: node.cases.filter((_, i) => i !== index),
                        })}
                      type="button"
                    >
                      Remove case
                    </Button>
                  </div>
                {/if}
              </div>
            {/each}
            <Button
              variant="outline"
              onclick={() =>
                node?.kind === "branch" &&
                patch({
                  cases: [
                    ...node.cases.slice(0, -1),
                    {
                      port: `case${node.cases.length}`,
                      when: { path: "result.pass", op: "truthy" },
                    },
                    { port: "else" },
                  ],
                })}
              type="button"
            >
              Add case
            </Button>
          {:else if node.kind === "map"}
            <TemplateInput
              label="Over (array path)"
              onchange={(over) => patch({ over })}
              {paths}
              value={node.over}
            /><label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Concurrency<Input
                min="1"
                oninput={(event) =>
                  patch({ concurrency: event.currentTarget.valueAsNumber })}
                type="number"
                value={node.concurrency}
              /></label
            ><Button
              variant="outline"
              onclick={() => node && editBody(node.id)}
              type="button"
            >
              Edit body
            </Button>
          {:else if node.kind === "workflow"}
            <label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Workflow<NativeSelect
                class="w-full"
                onchange={(event) =>
                  patch({ workflowId: event.currentTarget.value, inputs: {} })}
                value={node.workflowId}
              >
                <option disabled value="">Choose workflow</option>
                {#each workflows.filter((entry) => entry.id !== workflowId) as entry (entry.id)}
                  <option value={entry.id}>{entry.name}</option>
                {/each}
              </NativeSelect></label
            >
            {#if childStart?.kind === "start"}
              {#each childStart.inputs as entry (entry.name)}
                <TemplateInput
                  label="{entry.label}{entry.required ? ' (required)' : ''}"
                  onchange={(value) =>
                    node?.kind === "workflow" &&
                    patch({ inputs: { ...node.inputs, [entry.name]: value } })}
                  {paths}
                  value={node.inputs[entry.name] ?? ""}
                />
              {/each}
            {/if}
          {:else if node.kind === "ask"}
            <TemplateInput
              label="Question"
              multiline
              onchange={(question) => patch({ question })}
              {paths}
              value={node.question}
            />
            {#each node.options as entry, index (index)}
              <div class={ENTRY}>
                <TemplateInput
                  label="Option {index + 1}"
                  onchange={(label) =>
                    node?.kind === "ask" &&
                    patch({
                      options: node.options.map((item, i) =>
                        i === index ? { ...item, label } : item
                      ),
                    })}
                  {paths}
                  value={entry.label}
                /><label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Description<Input
                    oninput={(event) =>
                      node?.kind === "ask" &&
                      patch({
                        options: node.options.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                description: event.currentTarget.value,
                              }
                            : item
                        ),
                      })}
                    value={entry.description ?? ""}
                  /></label
                ><Button
                  variant="outline"
                  onclick={() =>
                    node?.kind === "ask" &&
                    patch({
                      options: node.options.filter((_, i) => i !== index),
                    })}
                  type="button"
                >
                  Remove option
                </Button>
              </div>
            {/each}
            <Button
              variant="outline"
              onclick={() =>
                node?.kind === "ask" &&
                patch({
                  options: [
                    ...node.options,
                    { label: `Option ${node.options.length + 1}` },
                  ],
                })}
              type="button"
            >
              Add option
            </Button><label
              class="flex min-h-c-input-h items-center gap-space-2 type-label text-ink-muted"
              ><Checkbox
                checked={node.allowOther}
                onCheckedChange={(checked) => patch({ allowOther: checked })}
              />Allow other</label
            ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Answered by<NativeSelect
                class="w-full"
                onchange={(event) =>
                  patch({ answeredBy: event.currentTarget.value })}
                value={node.answeredBy ?? "operator"}
              >
                <option>operator</option>
                <option>supervisor</option>
              </NativeSelect></label
            ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Wait up to (hours, optional)<Input
                min="1"
                oninput={(event) =>
                  patch({
                    waitFor: event.currentTarget.value
                      ? event.currentTarget.valueAsNumber
                      : undefined,
                  })}
                type="number"
                value={node.waitFor ?? ""}
              /></label
            >
          {:else if node.kind === "jev"}
            <TemplateInput
              label="State"
              multiline
              onchange={(state) => patch({ state })}
              {paths}
              value={node.state}
            />
            <p class="type-meta text-ink-muted">
              What every question below is asked about. Text that is a JSON
              object or array goes as structured data.
            </p>
            <h3 class="type-label">Questions · asked in one call</h3>
            {#each node.questions as entry, index (index)}
              <div class={ENTRY}>
                <div
                  class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
                >
                  <label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >ID<Input
                      face="mono"
                      text="label"
                      oninput={(event) =>
                        question(index, {
                          ...entry,
                          id: event.currentTarget.value,
                        })}
                      value={entry.id}
                    /></label
                  ><label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Type<NativeSelect
                      class="w-full"
                      onchange={(event) =>
                        retype(
                          index,
                          event.currentTarget.value as JevNodeQuestion["type"]
                        )}
                      value={entry.type}
                    >
                      {#each Object.entries(JEV_TYPE_NAMES) as [type, name] (type)}
                        <option value={type}>{name}</option>
                      {/each}
                    </NativeSelect></label
                  >
                </div>
                <label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Instructions<Textarea
                    oninput={(event) =>
                      question(index, {
                        ...entry,
                        instructions: event.currentTarget.value,
                      })}
                    value={entry.instructions}
                  /></label
                >
                {#if entry.type === "noul"}
                  <div
                    class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
                  >
                    <label
                      class="flex flex-col gap-space-2 type-label text-ink-muted"
                      >Yes means (optional)<Input
                        oninput={(event) =>
                          question(index, {
                            ...entry,
                            criteria: {
                              true: event.currentTarget.value,
                              false: entry.criteria?.false ?? "",
                            },
                          })}
                        value={entry.criteria?.true ?? ""}
                      /></label
                    ><label
                      class="flex flex-col gap-space-2 type-label text-ink-muted"
                      >No means (optional)<Input
                        oninput={(event) =>
                          question(index, {
                            ...entry,
                            criteria: {
                              true: entry.criteria?.true ?? "",
                              false: event.currentTarget.value,
                            },
                          })}
                        value={entry.criteria?.false ?? ""}
                      /></label
                    >
                  </div>
                {:else if entry.type === "choice"}
                  {#each entry.criteria as row, rowIndex (rowIndex)}
                    <div
                      class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
                    >
                      <label
                        class="flex flex-col gap-space-2 type-label text-ink-muted"
                        >Option {rowIndex + 1}
                        <Input
                          oninput={(event) =>
                            question(index, {
                              ...entry,
                              criteria: entry.criteria.map((item, i) =>
                                i === rowIndex
                                  ? {
                                      ...item,
                                      option: event.currentTarget.value,
                                    }
                                  : item
                              ),
                            })}
                          value={row.option}
                        /></label
                      ><label
                        class="flex flex-col gap-space-2 type-label text-ink-muted"
                        >Meaning<Input
                          oninput={(event) =>
                            question(index, {
                              ...entry,
                              criteria: entry.criteria.map((item, i) =>
                                i === rowIndex
                                  ? {
                                      ...item,
                                      meaning: event.currentTarget.value,
                                    }
                                  : item
                              ),
                            })}
                          value={row.meaning}
                        /></label
                      >
                    </div>
                    <Button
                      variant="outline"
                      disabled={entry.criteria.length <= 2}
                      onclick={() =>
                        question(index, {
                          ...entry,
                          criteria: entry.criteria.filter(
                            (_, i) => i !== rowIndex
                          ),
                        })}
                      type="button"
                    >
                      Remove option
                    </Button>
                  {/each}
                  <Button
                    variant="outline"
                    onclick={() =>
                      question(index, {
                        ...entry,
                        criteria: [
                          ...entry.criteria,
                          { option: "", meaning: "" },
                        ],
                      })}
                    type="button"
                  >
                    Add option
                  </Button>
                {:else}
                  <p class="type-meta text-ink-muted">
                    Levels run lowest first.
                  </p>
                  {#each entry.criteria as level, levelIndex (levelIndex)}
                    <label
                      class="flex flex-col gap-space-2 type-label text-ink-muted"
                      >Level {levelIndex}
                      <Input
                        oninput={(event) =>
                          question(index, {
                            ...entry,
                            criteria: entry.criteria.map((item, i) =>
                              i === levelIndex
                                ? event.currentTarget.value
                                : item
                            ),
                          })}
                        value={level}
                      /></label
                    >
                    <div class="flex flex-wrap items-center gap-space-2">
                      <Button
                        variant="outline"
                        disabled={levelIndex === 0}
                        onclick={() => {
                          const criteria = [...entry.criteria];
                          [criteria[levelIndex - 1], criteria[levelIndex]] = [
                            criteria[levelIndex],
                            criteria[levelIndex - 1],
                          ];
                          question(index, { ...entry, criteria });
                        }}
                        type="button"
                      >
                        Move up
                      </Button><Button
                        variant="outline"
                        disabled={entry.criteria.length <= 2}
                        onclick={() =>
                          question(index, {
                            ...entry,
                            criteria: entry.criteria.filter(
                              (_, i) => i !== levelIndex
                            ),
                          })}
                        type="button"
                      >
                        Remove level
                      </Button>
                    </div>
                  {/each}
                  <Button
                    variant="outline"
                    disabled={entry.criteria.length >= 10}
                    onclick={() =>
                      question(index, {
                        ...entry,
                        criteria: [...entry.criteria, ""],
                      })}
                    type="button"
                  >
                    Add level
                  </Button>
                {/if}
                <Button
                  variant="outline"
                  disabled={node.questions.length <= 1}
                  onclick={() =>
                    node?.kind === "jev" &&
                    patch({
                      questions: node.questions.filter((_, i) => i !== index),
                    })}
                  type="button"
                >
                  Remove question
                </Button>
              </div>
            {/each}
            <Button
              variant="outline"
              onclick={() =>
                node?.kind === "jev" &&
                patch({
                  questions: [
                    ...node.questions,
                    {
                      id: `question${node.questions.length + 1}`,
                      type: "noul",
                      instructions: "",
                    },
                  ],
                })}
              type="button"
            >
              Add question
            </Button>
            <label class="flex flex-col gap-space-2 type-label text-ink-muted"
              >Model<Input
                oninput={(event) =>
                  patch({ model: event.currentTarget.value || undefined })}
                placeholder="jev-latest"
                value={node.model ?? ""}
              /></label
            >
          {:else if node.kind === "end"}
            {#each Object.entries(node.outputs) as [name, path], index (index)}
              <div class={ENTRY}>
                <label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Output name<Input
                    onchange={(event) =>
                      node?.kind === "end" &&
                      patch({
                        outputs: Object.fromEntries(
                          Object.entries(node.outputs).map(([key, value]) => [
                            key === name ? event.currentTarget.value : key,
                            value,
                          ])
                        ),
                      })}
                    value={name}
                  /></label
                ><TemplateInput
                  label="Result path"
                  onchange={(value) =>
                    node?.kind === "end" &&
                    patch({ outputs: { ...node.outputs, [name]: value } })}
                  {paths}
                  value={path}
                /><Button
                  variant="outline"
                  onclick={() =>
                    node?.kind === "end" &&
                    patch({
                      outputs: Object.fromEntries(
                        Object.entries(node.outputs).filter(
                          ([key]) => key !== name
                        )
                      ),
                    })}
                  type="button"
                >
                  Remove output
                </Button>
              </div>
            {/each}
            <Button
              variant="outline"
              onclick={() =>
                node?.kind === "end" &&
                patch({
                  outputs: {
                    ...node.outputs,
                    [`output${Object.keys(node.outputs).length + 1}`]: "",
                  },
                })}
              type="button"
            >
              Add output
            </Button>
          {/if}
          {#if workflowPorts(node).length}
            <section
              aria-label="Connections"
              class="flex min-w-0 flex-col gap-space-4"
            >
              <h3 class="type-label">Connections</h3>
              {#each workflowPorts(node) as port (port)}
                <div class={ENTRY}>
                  <label
                    class="flex flex-col gap-space-2 type-label text-ink-muted"
                    >Connect {port} to<NativeSelect
                      class="w-full"
                      onchange={(event) => {
                        connect(port, event.currentTarget.value);
                        connectChoice[port] = "";
                      }}
                      bind:value={connectChoice[port]}
                    >
                      <option value="">Choose a node</option>
                      {#each graph.nodes.filter((entry) => entry.kind !== "start") as target (target.id)}
                        <option value={target.id}>{target.title}</option>
                      {/each}
                    </NativeSelect></label
                  >
                  {#each graph.edges.filter((entry) => entry.from.node === node?.id && entry.from.port === port) as connection (connection.id)}
                    <Button
                      variant="outline"
                      onclick={() => onselect(connection.id)}
                      type="button"
                    >
                      {graph.nodes.find(
                        (entry) => entry.id === connection.to.node
                      )?.title}
                      {connection.maxIterations
                        ? `×${connection.maxIterations}`
                        : ""}
                    </Button>
                  {/each}
                </div>
              {/each}
            </section>
            <details>
              <summary class="min-h-c-btn-h">Unwired ports</summary>
              {#each workflowPorts(node) as port (port)}
                <label
                  class="flex min-h-c-input-h items-center gap-space-2 type-label text-ink-muted"
                  ><Checkbox
                    checked={node.failedPorts?.includes(port) ?? false}
                    onCheckedChange={(checked) =>
                      patch({
                        failedPorts: checked
                          ? [...(node?.failedPorts ?? []), port]
                          : node?.failedPorts?.filter(
                              (entry) => entry !== port
                            ),
                      })}
                  />{port}: ends the run as failed</label
                >
              {/each}
            </details>
          {/if}
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Notes<Textarea
              oninput={(event) => patch({ notes: event.currentTarget.value })}
              value={node.notes ?? ""}
            /></label
          >
          <Button
            variant="outline"
            onclick={() => {
              onchange({
                ...graph,
                nodes: graph.nodes.filter((entry) => entry.id !== node?.id),
                edges: graph.edges.filter(
                  (entry) =>
                    entry.from.node !== node?.id && entry.to.node !== node?.id
                ),
              });
              onselect();
            }}
            type="button"
          >
            Delete node
          </Button>
        {:else if edge}
          {#if !sheet}
            <h2 class="type-label">{title}</h2>
          {/if}
          <p class="type-meta text-ink-muted">
            {edge.from.node}
            · {edge.from.port} → {edge.to.node}
          </p>
          <WhenFields
            onchange={(when) => patchEdge({ when })}
            value={edge.when}
          />
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Max iterations (required for cycles)<Input
              min="1"
              oninput={(event) =>
                patchEdge({
                  maxIterations: event.currentTarget.value
                    ? event.currentTarget.valueAsNumber
                    : undefined,
                })}
              type="number"
              value={edge.maxIterations ?? ""}
            /></label
          ><Button
            variant="outline"
            onclick={() => {
              onchange({
                ...graph,
                edges: graph.edges.filter((entry) => entry.id !== edge?.id),
              });
              onselect();
            }}
            type="button"
          >
            Delete edge
          </Button>
        {:else}
          {#if !sheet}
            <h2 class="type-label">{title}</h2>
          {/if}
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Description<Textarea
              oninput={(event) => ondescription(event.currentTarget.value)}
              value={description}
            /></label
          ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Concurrency<Input
              min="1"
              oninput={(event) =>
                settings({ concurrency: event.currentTarget.valueAsNumber })}
              type="number"
              value={graph.settings?.concurrency ?? 4}
            /></label
          >
          <label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Default project<NativeSelect
              class="w-full"
              onchange={(event) =>
                settings({
                  defaultProject: event.currentTarget.value || undefined,
                })}
              value={graph.settings?.defaultProject ?? ""}
            >
              <option value="">Choose at launch</option>
              {#each cawco.projects as project (project.id)}
                <option value={project.id}>{project.name}</option>
              {/each}
            </NativeSelect></label
          ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Default machine<NativeSelect
              class="w-full"
              onchange={(event) =>
                settings({
                  defaultMachine: event.currentTarget.value || undefined,
                })}
              value={graph.settings?.defaultMachine ?? ""}
            >
              <option value="">Choose at launch</option>
              {#each cawco.machines as machine (machine.machineId)}
                <option value={machine.machineId}>{machine.hostname}</option>
              {/each}
            </NativeSelect></label
          ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
            >Default supervisor<NativeSelect
              class="w-full"
              onchange={(event) =>
                settings({
                  defaultSupervisor: event.currentTarget.value
                    ? { delegateType: event.currentTarget.value }
                    : null,
                })}
              value={graph.settings?.defaultSupervisor &&
              "delegateType" in graph.settings.defaultSupervisor
                ? graph.settings.defaultSupervisor.delegateType
                : ""}
            >
              <option value="">None</option>
              {#each types as type (type.name)}
                <option value={type.name}>{type.name}</option>
              {/each}
            </NativeSelect></label
          >
        {/if}
      </div>
    {/key}
  </div>
  <section aria-label="Problems" class="flex min-w-0 flex-col gap-space-4">
    <h2 data-slot="num" class="num type-label">Problems · {problems.length}</h2>
    {#if !problems.length}
      <p class="type-meta text-ink-muted">No problems found.</p>
    {/if}
    {#each problems as problem, index (index)}
      <button
        class="min-h-c-btn-h-lg rounded-sm bg-surface-recess p-space-3 text-start wrap-anywhere"
        onclick={() => onselect(problem.nodeId ?? problem.edgeId)}
        type="button"
      >
        {problem.message}
      </button>
    {/each}
  </section>
</section>
