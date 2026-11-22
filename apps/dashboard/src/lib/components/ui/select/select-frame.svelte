<script lang="ts">
  /**
   * The kit's Select in a frame of its own (its states file's): its field
   * trigger, open or shut, its list drawn in place (the portal off) in a box
   * that holds it (`contain: layout`, so floating-ui places it in the
   * frame), as the task form composes it.
   */
  import * as Select from "./index.js";

  let {
    options,
    value,
    open = false,
    disabled = false,
    height,
  }: {
    /** Its options, each its words. */
    options: string[];
    /** The option picked; none shows the placeholder. */
    value?: string;
    /** Its list stands open. */
    open?: boolean;
    /** Can't be changed. */
    disabled?: boolean;
    /** The frame's least height, px: room for the list under its trigger. */
    height: number;
  } = $props();
</script>

<div
  class="relative min-h-(--frame-h) w-sm max-w-full contain-layout"
  style:--frame-h={`${height}px`}
>
  <Select.Root {disabled} {open} type="single" value={value ?? ""}>
    <Select.Trigger aria-label="Stage" look="field"
      >{value ?? "Pick a stage"}</Select.Trigger
    >
    <Select.Content forceMount={open} portalProps={{ disabled: true }}>
      {#each options as option (option)}
        <Select.Item label={option} value={option} />
      {/each}
    </Select.Content>
  </Select.Root>
</div>
