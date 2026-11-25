<script lang="ts">
  /**
   * The popover's `segment` look in a frame of its own (its states file's):
   * a single ToggleGroup of owners whose last segment, "+N", opens the rest
   * in a popover, as the repository picker composes it. Open, the "+N"
   * segment stands under the lens in place, beside the group's own lens on
   * the picked owner (ui/segmented).
   */
  import * as Command from "#lib/components/ui/command/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  let {
    shown,
    hidden,
    picked,
    open = true,
    height,
  }: {
    /** The owners on the group's line, each a login. */
    shown: string[];
    /** The owners past it, in the popover. */
    hidden: string[];
    /** The picked owner. */
    picked: string;
    /** The popover is open. */
    open?: boolean;
    /** The frame's least height, px: room for the popover under its trigger. */
    height: number;
  } = $props();

  // The story's pick and open state, until a press changes them
  // (house/follows-props).
  let value = $derived(picked);
  let opened = $derived(open);
</script>

<div
  class="relative flex min-h-(--frame-h) items-start justify-end p-space-4"
  style:--frame-h={`${height}px`}
>
  <ToggleGroup.Root aria-label="Owners" type="single" bind:value>
    {#each shown as login (login)}
      <ToggleGroup.Item compact value={login}>{login}</ToggleGroup.Item>
    {/each}
    <Popover.Root bind:open={opened}>
      <Popover.Trigger
        aria-label={`${hidden.length} more owners`}
        look="segment-compact"
      >
        <span>+{hidden.length}</span>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        onOpenAutoFocus={(event) => event.preventDefault()}
        pad="none"
        portalProps={{ disabled: true }}
        side="bottom"
        trapFocus={false}
        width="narrow"
      >
        <!-- Its first row is not scrolled into view as it mounts: drawn in
             place, that scroll reached the page around the frame (the
             design board, scrolled down to it on load). -->
        <Command.Root disableInitialScroll label="Owners">
          <Command.List>
            {#each hidden as login (login)}
              <Command.Item
                onSelect={() => {
                  value = login;
                  opened = false;
                }}
                value={login}>{login}</Command.Item
              >
            {/each}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  </ToggleGroup.Root>
</div>
