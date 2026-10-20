<script lang="ts">
  import type { WorkflowSchema } from "@cawco/core";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { NativeSelect } from "#lib/components/ui/native-select/index.js";
  import JsonField from "./JsonField.svelte";
  import { ENTRY } from "./workflow-ui";

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

<div class="flex min-w-0 flex-col gap-space-4">
  <div class="flex flex-wrap items-center justify-between gap-space-2">
    <h3 class="type-label">Result schema</h3>
    <Button
      onclick={() => {
        json = !json;
      }}
      type="button"
      variant="outline"
    >
      {json ? "Field builder" : "Edit as JSON"}
    </Button>
  </div>
  <!-- The two editors cross-fade in one place and the box tweens between
       their heights. -->
  <div data-slot="swap" class="grid min-w-0" {@attach morph()}>
    {#key json}
      <div
        class="col-start-1 row-start-1 flex flex-col gap-space-4 min-w-0"
        transition:crossIn
      >
        {#if json}
          <JsonField
            label="JSON Schema"
            objectOnly
            onchange={(schema) => onchange(schema as WorkflowSchema)}
            {value}
          />
        {:else}
          {#each fields as [name, schema], index (index)}
            <div class={ENTRY} in:unfold out:unfold>
              <div
                class="grid grid-cols-2 gap-space-3 max-wide:grid-cols-1 coarse:grid-cols-1"
              >
                <label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Field name<Input
                    onchange={(event) =>
                      update(
                        name,
                        event.currentTarget.value,
                        schema.type ?? "string",
                        required.includes(name)
                      )}
                    value={name}
                  /></label
                ><label
                  class="flex flex-col gap-space-2 type-label text-ink-muted"
                  >Type<NativeSelect
                    class="w-full"
                    onchange={(event) =>
                      update(
                        name,
                        name,
                        event.currentTarget.value,
                        required.includes(name)
                      )}
                    value={schema.type}
                  >
                    {#each ["string", "number", "integer", "boolean", "array", "object"] as type (type)}
                      <option>{type}</option>
                    {/each}
                  </NativeSelect></label
                >
              </div>
              <div
                class="flex flex-wrap items-center justify-between gap-space-2"
              >
                <label
                  class="flex min-h-c-input-h items-center gap-space-2 type-label text-ink-muted"
                  ><Checkbox
                    checked={required.includes(name)}
                    onCheckedChange={(checked) =>
                      update(name, name, schema.type ?? "string", checked)}
                  />Required</label
                ><Button
                  aria-label="Remove field {name}"
                  onclick={() =>
                    onchange({
                      ...value,
                      properties: Object.fromEntries(
                        fields.filter(([key]) => key !== name)
                      ),
                      required: required.filter((key) => key !== name),
                    })}
                  type="button"
                  variant="outline"
                >
                  Remove
                </Button>
              </div>
            </div>
          {/each}
          <Button
            onclick={() =>
              onchange({
                ...value,
                type: "object",
                properties: {
                  ...Object.fromEntries(fields),
                  [`field${fields.length + 1}`]: { type: "string" },
                },
              })}
            type="button"
            variant="outline"
          >
            Add field
          </Button>
        {/if}
      </div>
    {/key}
  </div>
</div>
