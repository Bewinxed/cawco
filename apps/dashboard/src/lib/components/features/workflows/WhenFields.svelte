<script lang="ts">
  import type { WorkflowWhen } from "@cawco/core";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import JsonField from "./JsonField.svelte";

  let {
    value,
    onchange,
  }: {
    value: WorkflowWhen | undefined;
    onchange: (value: WorkflowWhen | undefined) => void;
  } = $props();
</script>

<label class="flex flex-col gap-space-2 type-label text-ink-muted"
  >When<NativeSelect.Root
    class="w-full"
    onchange={(event) =>
      onchange(
        event.currentTarget.value === "always"
          ? undefined
          : { path: "result.pass", op: "truthy" }
      )}
    value={value ? "condition" : "always"}
  >
    <option value="always">Always</option>
    <option value="condition">Condition</option>
  </NativeSelect.Root></label
>
{#if value}
  <!-- The condition's fields open and fold as one: the rows below slide. -->
  <!-- One item of the column it sits in, spacing its own fields the same. -->
  <div
    data-slot="when"
    class="flex flex-col min-w-0 gap-inherit"
    in:unfold
    out:unfold
  >
    <label class="flex flex-col gap-space-2 type-label text-ink-muted"
      >Path<Input
        oninput={(event) =>
          value && onchange({ ...value, path: event.currentTarget.value })}
        value={value.path}
      /></label
    ><label class="flex flex-col gap-space-2 type-label text-ink-muted"
      >Operator<NativeSelect.Root
        class="w-full"
        onchange={(event) =>
          value &&
          onchange({
            ...value,
            op: event.currentTarget.value as WorkflowWhen["op"],
          })}
        value={value.op}
      >
        {#each ["eq", "neq", "gt", "lt", "contains", "matches", "truthy", "falsy"] as op (op)}
          <option>{op}</option>
        {/each}
      </NativeSelect.Root></label
    >
    {#if value.op !== "truthy" && value.op !== "falsy"}
      <div
        data-slot="when"
        class="flex flex-col min-w-0 gap-inherit"
        in:unfold
        out:unfold
      >
        <JsonField
          label="Compare with (JSON)"
          onchange={(next) => value && onchange({ ...value, value: next })}
          value={value.value ?? ""}
        />
      </div>
    {/if}
  </div>
{/if}
