<script lang="ts">
  import type {
    DelegateType,
    Problem,
    Workflow,
    WorkflowCheckRule,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowInput,
    WorkflowNode,
  } from "@whiffle/core";
  import { EFFORT_LEVELS, workflowPorts } from "@whiffle/core";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { newId } from "$lib/whiffle/id";
  import JsonField from "./JsonField.svelte";
  import SchemaBuilder from "./SchemaBuilder.svelte";
  import TemplateInput from "./TemplateInput.svelte";
  import WhenFields from "./WhenFields.svelte";
  import { templatePaths, upstream } from "./workflow-ui";

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
  }: {
    graph: WorkflowGraph;
    node?: WorkflowNode;
    edge?: WorkflowEdge;
    types: DelegateType[];
    workflows: Workflow[];
    workflowId: string;
    description: string;
    problems: Problem[];
    onchange: (graph: WorkflowGraph) => void;
    ondescription: (value: string) => void;
    onselect: (id?: string) => void;
    editBody: (id: string) => void;
  } = $props();
  const paths = $derived(node ? templatePaths(graph, node.id) : []);
  const continuations = $derived(
    node?.kind === "step"
      ? upstream(graph, node.id).filter(
          (entry) => entry.kind === "step" && entry.harness === node?.harness
        )
      : []
  );
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
<section aria-label="Workflow inspector" class="wf wf-stack inspector">
  {#if node}
    <div class="wf-row wf-spread">
      <h2>{node.kind === 'step' ? 'Step' : node.kind} inspector</h2>
      <button class="wf-btn" onclick={() => onselect()} type="button">
        Settings
      </button>
    </div>
    <label
      >Title<input
        oninput={(event) => patch({ title: event.currentTarget.value })}
        value={node.title}
      ></label
    >
    <label>Node ID<input class="wf-mono" readonly value={node.id}></label>
    {#if node.kind === 'step'}
      <div class="wf-well">
        <label
          >Run on<select
            onchange={(event) => preset(event.currentTarget.value)}
            value={node.delegateType ?? ''}
          >
            <option value="">Manual</option>
            {#each types as type (type.name)}
              <option value={type.name}>{type.name}</option>
            {/each}
          </select></label
        >
        <fieldset>
          <legend>Harness</legend>
          <div class="wf-row">
            {#each ['claude', 'opencode', 'pi'] as harness (harness)}
              <button
                aria-pressed={node.harness === harness}
                class="wf-btn"
                onclick={() => patch({ harness, ...(harness === 'claude' ? {} : { denyTools: [] }), ...(harness === 'pi' ? { effort: undefined } : {}) })}
                type="button"
                class:wf-primary={node.harness === harness}
              >
                {harness}
              </button>
            {/each}
          </div>
        </fieldset>
        <label
          >Model<input
            list="workflow-models"
            oninput={(event) => patch({ model: event.currentTarget.value })}
            value={node.model}
          >
          <datalist id="workflow-models">
            {#each [...new Set(types.filter((type) => type.harness === node?.harness).map((type) => type.model))] as model (model)}
              <option value={model}></option>
            {/each}
          </datalist></label
        >
        <label
          >Effort<select
            disabled={node.harness === 'pi'}
            onchange={(event) => patch({ effort: event.currentTarget.value || undefined })}
            value={node.effort ?? ''}
          >
            <option value="">Harness default</option>
            {#each EFFORT_LEVELS as effort (effort)}
              <option>{effort}</option>
            {/each}
          </select></label
        >
        <label
          >Skills (comma-separated)<input
            onchange={(event) => patch({ skills: split(event.currentTarget.value) })}
            value={node.skills?.join(', ') ?? ''}
          ></label
        >
        <label
          >Denied tools (Claude only)<input
            disabled={node.harness !== 'claude'}
            onchange={(event) => patch({ denyTools: split(event.currentTarget.value) })}
            value={node.denyTools?.join(', ') ?? ''}
          ></label
        >
      </div>
      <label
        >Context<select
          onchange={(event) => patch({ context: event.currentTarget.value ? { mode: 'continue', from: event.currentTarget.value } : { mode: 'fresh' } })}
          value={node.context.mode === 'fresh' ? '' : node.context.from}
        >
          <option value="">Fresh</option>
          {#each continuations as source (source.id)}
            <option value={source.id}>Continue from {source.title}</option>
          {/each}
        </select></label
      >
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
      <div class="wf-fields">
        <label
          >Retries<input
            max="5"
            min="0"
            oninput={(event) => patch({ retries: event.currentTarget.valueAsNumber })}
            type="number"
            value={node.retries ?? 2}
          ></label
        ><label
          >Timeout (minutes)<input
            min="1"
            oninput={(event) => patch({ timeoutMinutes: event.currentTarget.valueAsNumber })}
            type="number"
            value={node.timeoutMinutes ?? 60}
          ></label
        >
      </div>
    {:else if node.kind === 'start'}
      <h3>Inputs</h3>
      {#each node.inputs as entry, index (index)}
        <div class="wf-well">
          <div class="wf-fields">
            <label
              >Name<input
                oninput={(event) => input(index, { name: event.currentTarget.value })}
                value={entry.name}
              ></label
            ><label
              >Label<input
                oninput={(event) => input(index, { label: event.currentTarget.value })}
                value={entry.label}
              ></label
            >
          </div>
          <label
            >Type<select
              onchange={(event) => input(index, { type: event.currentTarget.value as WorkflowInput['type'] })}
              value={entry.type}
            >
              <option>text</option>
              <option>path</option>
              <option>select</option>
            </select></label
          >
          {#if entry.type === 'select'}
            <label
              >Options (comma-separated)<input
                onchange={(event) => input(index, { options: split(event.currentTarget.value) })}
                value={entry.options?.join(', ') ?? ''}
              ></label
            >
          {/if}
          <label
            >Default<input
              oninput={(event) => input(index, { default: event.currentTarget.value })}
              value={entry.default ?? ''}
            ></label
          >
          <div class="wf-row wf-spread">
            <label class="wf-check"
              ><input
                checked={entry.required}
                onchange={(event) => input(index, { required: event.currentTarget.checked })}
                type="checkbox"
              >Required</label
            ><button
              class="wf-btn"
              onclick={() => node?.kind === 'start' && patch({ inputs: node.inputs.filter((_, i) => i !== index) })}
              type="button"
            >
              Remove input
            </button>
          </div>
        </div>
      {/each}
      <button
        class="wf-btn"
        onclick={() => node?.kind === 'start' && patch({ inputs: [...node.inputs, { name: `input${node.inputs.length + 1}`, label: 'Input', type: 'text', required: true }] })}
        type="button"
      >
        Add input
      </button>
    {:else if node.kind === 'check'}
      {#each node.rules as entry, index (index)}
        <div class="wf-well">
          <div class="wf-row wf-spread">
            <h3>{entry.kind}</h3>
            <button
              class="wf-btn"
              onclick={() => node?.kind === 'check' && patch({ rules: node.rules.filter((_, i) => i !== index) })}
              type="button"
            >
              Remove rule
            </button>
          </div>
          {#if entry.kind === 'schema'}
            <JsonField
              label="Schema"
              objectOnly
              onchange={(schema) => rule(index, { schema })}
              value={entry.schema}
            />
          {:else if entry.kind === 'command'}
            <TemplateInput
              label="Command"
              onchange={(cmd) => rule(index, { cmd })}
              {paths}
              value={entry.cmd}
            /><label
              >Expected exit code<input
                oninput={(event) => rule(index, { expectExit: event.currentTarget.valueAsNumber })}
                type="number"
                value={entry.expectExit}
              ></label
            >
          {:else}
            <TemplateInput
              label="Path"
              onchange={(path) => rule(index, { path })}
              {paths}
              value={entry.path}
            />
            {#if entry.kind === 'regex'}
              <label
                >Pattern<input
                  oninput={(event) => rule(index, { pattern: event.currentTarget.value })}
                  value={entry.pattern}
                ></label
              ><label class="wf-check"
                ><input
                  checked={entry.mustMatch}
                  onchange={(event) => rule(index, { mustMatch: event.currentTarget.checked })}
                  type="checkbox"
                >Must match</label
              >
            {:else if entry.kind === 'forbidden-words'}
              <label
                >Forbidden words (comma-separated)<input
                  onchange={(event) => rule(index, { words: split(event.currentTarget.value) })}
                  value={entry.words.join(', ')}
                ></label
              >
            {/if}
          {/if}
        </div>
      {/each}
      <label
        >Add rule<select
          onchange={(event) => { addRule(event.currentTarget.value as WorkflowCheckRule['kind']); event.currentTarget.value = ''; }}
          value=""
        >
          <option disabled value="">Choose a rule</option>
          {#each ['schema','regex','forbidden-words','file-exists','command'] as kind (kind)}
            <option>{kind}</option>
          {/each}
        </select></label
      >
    {:else if node.kind === 'branch'}
      {#each node.cases as entry, index (index)}
        <div class="wf-well">
          {#if index === node.cases.length - 1}
            <h3>Else</h3>
          {:else}
            <label
              >Port label<input
                oninput={(event) => node?.kind === 'branch' && patch({ cases: node.cases.map((item, i) => i === index ? { ...item, port: event.currentTarget.value } : item) })}
                value={entry.port}
              ></label
            ><WhenFields
              onchange={(when) => node?.kind === 'branch' && patch({ cases: node.cases.map((item, i) => i === index ? { ...item, when } : item) })}
              value={entry.when}
            />
            <div class="wf-row">
              <button
                class="wf-btn"
                disabled={index === 0}
                onclick={() => { if (node?.kind !== 'branch') { return; } const cases = [...node.cases]; [cases[index - 1], cases[index]] = [cases[index], cases[index - 1]]; patch({ cases }); }}
                type="button"
              >
                Move up
              </button><button
                class="wf-btn"
                onclick={() => node?.kind === 'branch' && patch({ cases: node.cases.filter((_, i) => i !== index) })}
                type="button"
              >
                Remove case
              </button>
            </div>
          {/if}
        </div>
      {/each}
      <button
        class="wf-btn"
        onclick={() => node?.kind === 'branch' && patch({ cases: [...node.cases.slice(0, -1), { port: `case${node.cases.length}`, when: { path: 'result.pass', op: 'truthy' } }, { port: 'else' }] })}
        type="button"
      >
        Add case
      </button>
    {:else if node.kind === 'map'}
      <TemplateInput
        label="Over (array path)"
        onchange={(over) => patch({ over })}
        {paths}
        value={node.over}
      /><label
        >Concurrency<input
          min="1"
          oninput={(event) => patch({ concurrency: event.currentTarget.valueAsNumber })}
          type="number"
          value={node.concurrency}
        ></label
      ><button
        class="wf-btn"
        onclick={() => node && editBody(node.id)}
        type="button"
      >
        Edit body
      </button>
    {:else if node.kind === 'workflow'}
      <label
        >Workflow<select
          onchange={(event) => patch({ workflowId: event.currentTarget.value, inputs: {} })}
          value={node.workflowId}
        >
          <option disabled value="">Choose workflow</option>
          {#each workflows.filter((entry) => entry.id !== workflowId) as entry (entry.id)}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select></label
      >
      {#if childStart?.kind === 'start'}
        {#each childStart.inputs as entry (entry.name)}
          <TemplateInput
            label="{entry.label}{entry.required ? ' (required)' : ''}"
            onchange={(value) => node?.kind === 'workflow' && patch({ inputs: { ...node.inputs, [entry.name]: value } })}
            {paths}
            value={node.inputs[entry.name] ?? ''}
          />
        {/each}
      {/if}
    {:else if node.kind === 'ask'}
      <TemplateInput
        label="Question"
        multiline
        onchange={(question) => patch({ question })}
        {paths}
        value={node.question}
      />
      {#each node.options as entry, index (index)}
        <div class="wf-well">
          <TemplateInput
            label="Option {index + 1}"
            onchange={(label) => node?.kind === 'ask' && patch({ options: node.options.map((item, i) => i === index ? { ...item, label } : item) })}
            {paths}
            value={entry.label}
          /><label
            >Description<input
              oninput={(event) => node?.kind === 'ask' && patch({ options: node.options.map((item, i) => i === index ? { ...item, description: event.currentTarget.value } : item) })}
              value={entry.description ?? ''}
            ></label
          ><button
            class="wf-btn"
            onclick={() => node?.kind === 'ask' && patch({ options: node.options.filter((_, i) => i !== index) })}
            type="button"
          >
            Remove option
          </button>
        </div>
      {/each}
      <button
        class="wf-btn"
        onclick={() => node?.kind === 'ask' && patch({ options: [...node.options, { label: `Option ${node.options.length + 1}` }] })}
        type="button"
      >
        Add option
      </button><label class="wf-check"
        ><input
          checked={node.allowOther}
          onchange={(event) => patch({ allowOther: event.currentTarget.checked })}
          type="checkbox"
        >Allow other</label
      ><label
        >Answered by<select
          onchange={(event) => patch({ answeredBy: event.currentTarget.value })}
          value={node.answeredBy ?? 'operator'}
        >
          <option>operator</option>
          <option>supervisor</option>
        </select></label
      ><label
        >Wait up to (hours, optional)<input
          min="1"
          oninput={(event) => patch({ waitFor: event.currentTarget.value ? event.currentTarget.valueAsNumber : undefined })}
          type="number"
          value={node.waitFor ?? ''}
        ></label
      >
    {:else if node.kind === 'end'}
      {#each Object.entries(node.outputs) as [name, path], index (index)}
        <div class="wf-well">
          <label
            >Output name<input
              onchange={(event) => node?.kind === 'end' && patch({ outputs: Object.fromEntries(Object.entries(node.outputs).map(([key, value]) => [key === name ? event.currentTarget.value : key, value])) })}
              value={name}
            ></label
          ><TemplateInput
            label="Result path"
            onchange={(value) => node?.kind === 'end' && patch({ outputs: { ...node.outputs, [name]: value } })}
            {paths}
            value={path}
          /><button
            class="wf-btn"
            onclick={() => node?.kind === 'end' && patch({ outputs: Object.fromEntries(Object.entries(node.outputs).filter(([key]) => key !== name)) })}
            type="button"
          >
            Remove output
          </button>
        </div>
      {/each}
      <button
        class="wf-btn"
        onclick={() => node?.kind === 'end' && patch({ outputs: { ...node.outputs, [`output${Object.keys(node.outputs).length + 1}`]: '' } })}
        type="button"
      >
        Add output
      </button>
    {/if}
    {#if workflowPorts(node).length}
      <section aria-label="Connections" class="wf-stack">
        <h3>Connections</h3>
        {#each workflowPorts(node) as port (port)}
          <div class="wf-well">
            <label
              >Connect {port} to<select
                onchange={(event) => { connect(port, event.currentTarget.value); event.currentTarget.value = ''; }}
                value=""
              >
                <option value="">Choose a node</option>
                {#each graph.nodes.filter((entry) => entry.kind !== 'start') as target (target.id)}
                  <option value={target.id}>{target.title}</option>
                {/each}
              </select></label
            >
            {#each graph.edges.filter((entry) => entry.from.node === node?.id && entry.from.port === port) as connection (connection.id)}
              <button
                class="wf-btn"
                onclick={() => onselect(connection.id)}
                type="button"
              >
                {graph.nodes.find((entry) => entry.id === connection.to.node)?.title}
                {connection.maxIterations ? `×${connection.maxIterations}` : ''}
              </button>
            {/each}
          </div>
        {/each}
      </section>
      <details>
        <summary>Unwired ports</summary>
        {#each workflowPorts(node) as port (port)}
          <label class="wf-check"
            ><input
              checked={node.failedPorts?.includes(port) ?? false}
              onchange={(event) => patch({ failedPorts: event.currentTarget.checked ? [...(node?.failedPorts ?? []), port] : node?.failedPorts?.filter((entry) => entry !== port) })}
              type="checkbox"
            >{port}: ends the run as failed</label
          >
        {/each}
      </details>
    {/if}
    <label
      >Notes<textarea
        oninput={(event) => patch({ notes: event.currentTarget.value })}
        value={node.notes ?? ''}
      ></textarea></label
    >
    <button
      class="wf-btn"
      onclick={() => { onchange({ ...graph, nodes: graph.nodes.filter((entry) => entry.id !== node?.id), edges: graph.edges.filter((entry) => entry.from.node !== node?.id && entry.to.node !== node?.id) }); onselect(); }}
      type="button"
    >
      Delete node
    </button>
  {:else if edge}
    <h2>Edge inspector</h2>
    <p class="wf-muted">{edge.from.node} · {edge.from.port} → {edge.to.node}</p>
    <WhenFields onchange={(when) => patchEdge({ when })} value={edge.when} />
    <label
      >Max iterations (required for cycles)<input
        min="1"
        oninput={(event) => patchEdge({ maxIterations: event.currentTarget.value ? event.currentTarget.valueAsNumber : undefined })}
        type="number"
        value={edge.maxIterations ?? ''}
      ></label
    ><button
      class="wf-btn"
      onclick={() => { onchange({ ...graph, edges: graph.edges.filter((entry) => entry.id !== edge?.id) }); onselect(); }}
      type="button"
    >
      Delete edge
    </button>
  {:else}
    <h2>Workflow settings</h2>
    <label
      >Description<textarea
        oninput={(event) => ondescription(event.currentTarget.value)}
        value={description}
      ></textarea></label
    ><label
      >Concurrency<input
        min="1"
        oninput={(event) => settings({ concurrency: event.currentTarget.valueAsNumber })}
        type="number"
        value={graph.settings?.concurrency ?? 4}
      ></label
    >
    <label
      >Default project<select
        onchange={(event) => settings({ defaultProject: event.currentTarget.value || undefined })}
        value={graph.settings?.defaultProject ?? ''}
      >
        <option value="">Choose at launch</option>
        {#each whiffle.projects as project (project.id)}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select></label
    ><label
      >Default machine<select
        onchange={(event) => settings({ defaultMachine: event.currentTarget.value || undefined })}
        value={graph.settings?.defaultMachine ?? ''}
      >
        <option value="">Choose at launch</option>
        {#each whiffle.machines as machine (machine.machineId)}
          <option value={machine.machineId}>{machine.hostname}</option>
        {/each}
      </select></label
    ><label
      >Default supervisor<select
        onchange={(event) => settings({ defaultSupervisor: event.currentTarget.value ? { delegateType: event.currentTarget.value } : null })}
        value={graph.settings?.defaultSupervisor && 'delegateType' in graph.settings.defaultSupervisor ? graph.settings.defaultSupervisor.delegateType : ''}
      >
        <option value="">None</option>
        {#each types as type (type.name)}
          <option value={type.name}>{type.name}</option>
        {/each}
      </select></label
    >
  {/if}
  <section aria-label="Problems" class="wf-stack">
    <h2>Problems · {problems.length}</h2>
    {#if !problems.length}
      <p class="wf-muted">No problems found.</p>
    {/if}
    {#each problems as problem, index (index)}
      <button
        class="problem"
        onclick={() => onselect(problem.nodeId ?? problem.edgeId)}
        type="button"
      >
        {problem.message}
      </button>
    {/each}
  </section>
</section>
<style>
  .inspector {
    padding: var(--space-5) var(--space-4) var(--space-8);
  }
  legend {
    font-size: var(--text-label);
    margin-bottom: var(--space-2);
  }
  .problem {
    padding: var(--space-3);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    text-align: left;
    overflow-wrap: anywhere;
    min-height: 44px;
  }
  summary {
    min-height: 36px;
    cursor: pointer;
  }
</style>
