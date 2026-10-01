<script lang="ts">
  import type { WorkflowSchema } from "@cawco/core";
  import { crossIn } from "$lib/cawco/motion/curves.svelte";
  import { unfold } from "$lib/cawco/motion/fold.svelte";
  import { morph } from "$lib/cawco/motion/morph.svelte";
  import JsonField from "./JsonField.svelte";

  let {
    value,
    onchange,
  }: { value: WorkflowSchema; onchange: (schema: WorkflowSchema) => void } =
    $props();
  let json = $state(false);
  const fields = $derived(
    Object.entries(
      (value.properties ?? {}) as Record<
        string,
        { type?: string; items?: unknown }
      >
    )
  );
  const required = $derived((value.required ?? []) as string[]);
  function update(old: string, name: string, type: string, mandatory: boolean) {
    const properties = Object.fromEntries(
      fields.map(([key, schema]) =>
        key === old
          ? [
              name,
              type === "array"
                ? { type, items: schema.items ?? { type: "string" } }
                : { ...schema, type },
            ]
          : [key, schema]
      )
    );
    onchange({
      ...value,
      type: "object",
      properties,
      required: [
        ...required.filter((key) => key !== old),
        ...(mandatory ? [name] : []),
      ],
    });
  }
</script>
<div class="wf-stack">
  <div class="wf-row wf-spread">
    <h3>Result schema</h3>
    <button class="wf-btn" onclick={() => { json = !json; }} type="button">
      {json ? 'Field builder' : 'Edit as JSON'}
    </button>
  </div>
  <!-- The two editors cross-fade in one place and the box tweens between
       their heights. -->
  <div class="swap" {@attach morph()}>
    {#key json}
      <div class="alt" transition:crossIn>
        {#if json}
          <JsonField
            label="JSON Schema"
            objectOnly
            onchange={(schema) => onchange(schema as WorkflowSchema)}
            {value}
          />
        {:else}
          {#each fields as [name, schema], index (index)}
            <div class="wf-well" in:unfold out:unfold>
              <div class="wf-fields">
                <label
                  >Field name<input
                    onchange={(event) => update(name, event.currentTarget.value, schema.type ?? 'string', required.includes(name))}
                    value={name}
                  ></label
                ><label
                  >Type<select
                    onchange={(event) => update(name, name, event.currentTarget.value, required.includes(name))}
                    value={schema.type}
                  >
                    {#each ['string', 'number', 'integer', 'boolean', 'array', 'object'] as type (type)}
                      <option>{type}</option>
                    {/each}
                  </select></label
                >
              </div>
              <div class="wf-row wf-spread">
                <label class="wf-check"
                  ><input
                    checked={required.includes(name)}
                    onchange={(event) => update(name, name, schema.type ?? 'string', event.currentTarget.checked)}
                    type="checkbox"
                  >Required</label
                ><button
                  aria-label="Remove field {name}"
                  class="wf-btn"
                  onclick={() => onchange({ ...value, properties: Object.fromEntries(fields.filter(([key]) => key !== name)), required: required.filter((key) => key !== name) })}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          {/each}
          <button
            class="wf-btn"
            onclick={() => onchange({ ...value, type: 'object', properties: { ...Object.fromEntries(fields), [`field${fields.length + 1}`]: { type: 'string' } } })}
            type="button"
          >
            Add field
          </button>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .swap {
    display: grid;
    min-width: 0;
  }
  .alt {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
</style>
