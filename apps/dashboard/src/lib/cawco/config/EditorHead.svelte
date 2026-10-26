<script lang="ts">
  /**
   * The head of an editor whose row is named and switched on or off (a
   * hook, a rule): its name, typed where its title reads, with the name's
   * problem under it (or that another row has it); Enabled, saying what on
   * and off mean; and why the hub refused the last Save or Delete.
   */
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import type { EditorForm } from "./editor-form.svelte";
  import SwitchField from "./SwitchField.svelte";
  import TitleInput from "./TitleInput.svelte";

  let {
    form,
    name = $bindable(),
    enabled = $bindable(),
    label,
    placeholder,
    problem,
    duplicate,
    switchId,
    on,
    off,
  }: {
    form: EditorForm;
    name: string;
    enabled: boolean;
    label: string;
    placeholder: string;
    /** The name's problem, once it is said. */
    problem: string | undefined;
    /** That another row has the name. */
    duplicate: string | undefined;
    switchId: string;
    /** What Enabled means, on and off. */
    on: string;
    off: string;
  } = $props();
</script>

<TitleInput
  invalid={Boolean(problem || duplicate)}
  {label}
  onblur={() => {
    form.touched.name = true;
  }}
  {placeholder}
  bind:value={name}
/>
{#if problem}
  <p class="type-meta text-status-fail-ink" in:appear>{problem}</p>
{:else if duplicate}
  <p class="type-meta text-status-fail-ink" in:appear>{duplicate}</p>
{/if}
<SwitchField
  hint={enabled ? on : off}
  id={switchId}
  label="Enabled"
  bind:checked={enabled}
/>
{#if form.failed}
  <p class="type-meta text-status-fail-ink" role="alert" in:appear>
    {form.failed}
  </p>
{/if}
