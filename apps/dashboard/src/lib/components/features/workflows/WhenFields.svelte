<script lang="ts">
  import type { WorkflowWhen } from "@whiffle/core";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import JsonField from "./JsonField.svelte";

  let {
    value,
    onchange,
  }: {
    value: WorkflowWhen | undefined;
    onchange: (value: WorkflowWhen | undefined) => void;
  } = $props();
</script>
<label
  >When<select
    onchange={(event) => onchange(event.currentTarget.value === 'always' ? undefined : { path: 'result.pass', op: 'truthy' })}
    value={value ? 'condition' : 'always'}
  >
    <option value="always">Always</option>
    <option value="condition">Condition</option>
  </select></label
>
{#if value}
  <!-- The condition's fields open and fold as one: the rows below slide. -->
  <div class="when" in:unfold out:unfold>
    <label
      >Path<input
        oninput={(event) => value && onchange({ ...value, path: event.currentTarget.value })}
        value={value.path}
      ></label
    ><label
      >Operator<select
        onchange={(event) => value && onchange({ ...value, op: event.currentTarget.value as WorkflowWhen['op'] })}
        value={value.op}
      >
        {#each ['eq','neq','gt','lt','contains','matches','truthy','falsy'] as op (op)}
          <option>{op}</option>
        {/each}
      </select></label
    >
    {#if value.op !== 'truthy' && value.op !== 'falsy'}
      <div class="when" in:unfold out:unfold>
        <JsonField
          label="Compare with (JSON)"
          onchange={(next) => value && onchange({ ...value, value: next })}
          value={value.value ?? ''}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  /* One item of the column it sits in, spacing its own fields the same. */
  .when {
    display: flex;
    flex-direction: column;
    gap: inherit;
    min-width: 0;
  }
</style>
