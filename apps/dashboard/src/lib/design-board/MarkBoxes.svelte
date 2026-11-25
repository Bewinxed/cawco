<script lang="ts">
  /**
   * The kit's mark boxes side by side (design.css `mark-box`, the owner's
   * pick of 2026-11-25): each box that leads with a glyph beside its words,
   * its words on one line or wrapped to two, in its smaller or its larger
   * size where the kit gives it two (a button, a toggle, a setting chip; the
   * rest have one), so the room round the words and the glyph on the first
   * line can be judged across the kit at once.
   */
  import { toast } from "svelte-sonner";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Row, RowList } from "#lib/components/ui/row/index.js";
  import Toaster from "#lib/components/ui/sonner/sonner.svelte";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconCpu, IconFolder, IconInfo, IconPlus } from "#lib/icons.js";

  let {
    lines,
    size,
  }: {
    /** Its words on one line, or wrapped to two where the box wraps. */
    lines: 1 | 2;
    /** Each box in its smaller size, or its larger where it has one. */
    size: "small" | "large";
  } = $props();

  const id = $props.id();
  const large = $derived(size === "large");
  const two = $derived(lines === 2);
  const words = $derived({
    option: two
      ? "Keep the session running on its machine while it updates"
      : "Keep it running",
    menu: two ? "Open the folder the session works in" : "Open the folder",
    alert: two
      ? "Sessions on obelisk pause while it updates its daemon"
      : "Sessions on obelisk pause",
    row: two ? "Anthropic API key, used by three harnesses" : "API key",
  });

  $effect(() => {
    const sent = toast.info(words.alert, {
      toasterId: id,
      duration: Number.POSITIVE_INFINITY,
    });
    return () => toast.dismiss(sent);
  });
</script>

<div class="flex flex-wrap items-start gap-space-6 p-space-4">
  <section class="flex flex-col items-start gap-space-2">
    <h3 class="type-meta text-tx-2">Button, toggle, badge, setting chip</h3>
    <Button
      icon={IconPlus}
      label="New session"
      size={large ? "lg" : "sm"}
      variant="outline"
    />
    <Button
      icon={IconPlus}
      label="New session"
      size={large ? "default" : "xs"}
    />
    <Toggle size={large ? "lg" : "xs"} variant="outline"
      ><IconInfo data-icon="inline-start" /><span>Watch</span></Toggle
    >
    <Badge icon={IconInfo} variant="live"><span>Live</span></Badge>
    <button
      class={chipVariants({
        variant: "setting",
        size: large ? "regular" : "compact",
      })}
      type="button"
    >
      <IconCpu /><span data-slot="chip-label">Opus 5.5</span>
    </button>
  </section>

  <section class="flex w-56 max-w-full flex-col items-stretch gap-space-2">
    <h3 class="type-meta text-tx-2">Option</h3>
    <OptionGroup aria-label="While it updates" layout="list" value={["keep"]}>
      <OptionGroupItem digit={1} value="keep">{words.option}</OptionGroupItem>
      <OptionGroupItem digit={2} value="stop">Stop it</OptionGroupItem>
    </OptionGroup>
  </section>

  <section class="relative min-h-40 w-64 max-w-full contain-layout">
    <h3 class="type-meta text-tx-2">Menu item</h3>
    <DropdownMenu.Root open>
      <DropdownMenu.Trigger variant="outline"
        ><IconFolder /><span>Folder</span></DropdownMenu.Trigger
      >
      <DropdownMenu.Content
        forceMount
        onOpenAutoFocus={(event) => event.preventDefault()}
        portalProps={{ disabled: true }}
        trapFocus={false}
        width="regular"
      >
        <DropdownMenu.Item
          ><IconFolder /><span>{words.menu}</span></DropdownMenu.Item
        >
        <DropdownMenu.Item><IconCpu /><span>Machines</span></DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </section>

  <section class="flex flex-col items-start gap-space-2">
    <h3 class="type-meta text-tx-2">Segments</h3>
    <ToggleGroup.Root aria-label="View" type="single" value="machines">
      <ToggleGroup.Item value="files"
        ><IconFolder /><span>Files</span></ToggleGroup.Item
      >
      <ToggleGroup.Item value="machines"
        ><IconCpu /><span>Machines</span></ToggleGroup.Item
      >
    </ToggleGroup.Root>
  </section>

  <section class="flex w-72 max-w-full flex-col gap-space-2">
    <h3 class="type-meta text-tx-2">Alert</h3>
    <Alert>
      <IconInfo />
      <AlertTitle>{words.alert}</AlertTitle>
      <AlertDescription>Nothing running is lost.</AlertDescription>
    </Alert>
  </section>

  <section class="flex w-72 max-w-full flex-col gap-space-2">
    <h3 class="type-meta text-tx-2">Row</h3>
    <RowList aria-label="Keys">
      <Row>
        {#snippet lead()}
          <span
            class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
          >
            <IconCpu class="size-icon-md" />
          </span>
        {/snippet}
        <span class="type-label text-tx">{words.row}</span>
      </Row>
    </RowList>
  </section>

  <section class="flex flex-col gap-space-2">
    <h3 class="type-meta text-tx-2">Toast</h3>
    <div class="relative h-32 w-sm max-w-full overflow-clip contain-layout">
      <Toaster expand {id} position="bottom-right" />
    </div>
  </section>
</div>
