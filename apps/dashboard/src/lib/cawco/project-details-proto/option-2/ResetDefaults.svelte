<script lang="ts">
  /**
   * Who decides' way back to the fleet's defaults, at its step's head: the
   * design graph dials' reset arrow (DialRow: a ghost icon-xs button, the
   * edited ink, the house tooltip). Putting several kinds back is more than
   * the arrow says, so its press first says what it reaches (DESIGN.md,
   * Flow: ceremony matches consequence): a popover hung from the arrow
   * listing each kind this project set, then the one press that puts them
   * back, which names the act. Escape or a press elsewhere leaves them as they are.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconReset } from "#lib/icons.js";
  import type { ChoiceKind } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    kinds,
    disabled,
    onreset,
  }: {
    /** The kinds this project set itself, which the press puts back. */
    kinds: ChoiceKind[];
    disabled: boolean;
    onreset: () => void;
  } = $props();

  let open = $state(false);
</script>

<Popover.Root bind:open>
  <Tooltip.Root disabled={open}>
    <Popover.Trigger {disabled}>
      {#snippet child({ props: pop })}
        <Tooltip.Trigger {...pop}>
          {#snippet child({ props })}
            <Button
              {...props}
              aria-label={words.waits.putAllBack}
              icon={IconReset}
              press="pressable"
              size="icon-xs"
              tone="edited"
              variant="ghost"
            />
          {/snippet}
        </Tooltip.Trigger>
      {/snippet}
    </Popover.Trigger>
    <Tooltip.Content>{words.waits.putAllBack}</Tooltip.Content>
  </Tooltip.Root>
  <Popover.Content
    align="end"
    aria-label={words.waits.putAllBack}
    gap="snug"
    pad="form"
    side="bottom"
    width="narrow"
  >
    <p class="m-0 type-label text-ink-strong">
      {words.waits.resetSays(kinds.length)}
    </p>
    <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each kinds as kind (kind)}
        <li class="type-meta text-ink-muted">{words.waits.kinds[kind].name}</li>
      {/each}
    </ul>
    <Button
      class="self-start"
      {disabled}
      label={words.waits.putAllBack}
      onclick={() => {
        open = false;
        onreset();
      }}
      size="sm"
      variant="outline"
    />
  </Popover.Content>
</Popover.Root>
