<script lang="ts">
  import * as Select from "#lib/components/ui/select/index.js";

  let {
    label,
    ariaLabel,
    value,
    items,
    onchange,
  }: {
    ariaLabel: string;
    items: readonly { id: string; text: string }[];
    label: string;
    onchange: (next: string) => void;
    value: string;
  } = $props();
</script>

<div class="flex flex-col gap-space-1">
  <span class="type-meta text-ink-muted">{label}</span>
  <Select.Root
    onValueChange={(next) => {
      if (next) {
        onchange(next);
      }
    }}
    type="single"
    {value}
  >
    <Select.Trigger aria-label={ariaLabel}>{value}</Select.Trigger>
    <Select.Content>
      {#each items as item (item.id)}
        <Select.Item label={item.text} value={item.id}>
          <span>{item.text}</span>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
