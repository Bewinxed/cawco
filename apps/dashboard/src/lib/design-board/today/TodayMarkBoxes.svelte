<script lang="ts">
  /**
   * COMPARISON ONLY, deleted once the owner picks (2026-11-25): the kit's
   * boxes that lead with a glyph as they stood before the even-room rule
   * (cawco/neon-design-system at 5cecb35a9f), frozen as markup carrying that
   * commit's recipes, beside MarkBoxes (the rule) on one design graph. The
   * same pieces, words and sizes as MarkBoxes; the toast is left out, its
   * look being the app's stylesheet's, which holds only the new rule.
   */
  import {
    DropdownMenu as DropdownMenuPrimitive,
    ToggleGroup as ToggleGroupPrimitive,
  } from "bits-ui";
  import {
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { OptionGroup } from "#lib/components/ui/option-group/index.js";
  import { RowList } from "#lib/components/ui/row/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconCpu, IconFolder, IconInfo, IconPlus } from "#lib/icons.js";
  import TodayOption from "./TodayOption.svelte";
  import { today } from "./today.js";

  let {
    lines,
    size,
  }: {
    /** Its words on one line, or wrapped to two where the box wraps. */
    lines: "one" | "two";
    /** Each box in its smaller size, or its larger where it has one. */
    size: "small" | "large";
  } = $props();

  const large = $derived(size === "large");
  const two = $derived(lines === "two");
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
</script>

{#snippet slot()}
  <span class="icon-swap me-(--btn-gap) w-(--btn-icon) flex-none"
    ><span data-active="true"><IconPlus class="size-(--btn-icon)" /></span
    ></span
  >
{/snippet}

{#snippet button(look: string)}
  <button class={look} type="button">
    <span
      ><span class="inline-flex items-baseline"
        >{@render slot()}<span class="px-(--btn-word-pad)">New session</span
        ></span
      ></span
    >
  </button>
{/snippet}

<div class="flex flex-wrap items-start gap-space-6 p-space-4">
  <section class="flex flex-col items-start gap-space-2">
    <h3 class="type-meta text-tx-2">Button, toggle, badge, setting chip</h3>
    {@render button(
      `${today.button} ${large ? today.buttonLg : today.buttonSm}`
    )}
    {@render button(
      `${today.button} ${today.buttonPrimary} ${large ? today.buttonDefault : today.buttonXs}`
    )}
    <!-- mark-line: comparison only, today's recipe in today.ts -->
    <button
      aria-pressed="false"
      class={`${today.toggle} ${large ? today.toggleLg : today.toggleXs}`}
      type="button"
    >
      <IconInfo data-icon="inline-start" /><span>Watch</span>
    </button>
    <!-- mark-line: comparison only, today's recipe in today.ts -->
    <span class={today.badge}
      ><IconInfo aria-hidden="true" data-icon="inline-start" /><span>Live</span
      ></span
    >
    <!-- mark-line: comparison only, today's recipe in today.ts -->
    <button
      class={`${today.chip} ${large ? "" : today.chipCompact}`}
      type="button"
    >
      <IconCpu /><span data-slot="chip-label">Opus 5.5</span>
    </button>
  </section>

  <section class="flex w-56 max-w-full flex-col items-stretch gap-space-2">
    <h3 class="type-meta text-tx-2">Option</h3>
    <OptionGroup aria-label="While it updates" layout="list" value={["keep"]}>
      <TodayOption chosen>{words.option}</TodayOption>
      <TodayOption chosen={false}>Stop it</TodayOption>
    </OptionGroup>
  </section>

  <section class="relative min-h-40 w-64 max-w-full contain-layout">
    <h3 class="type-meta text-tx-2">Menu item</h3>
    <DropdownMenu.Root open>
      <!-- mark-line: comparison only, today's recipe in today.ts -->
      <DropdownMenuPrimitive.Trigger
        class={`${today.button} ${today.buttonDefault} ${today.childrenPad}`}
        ><IconFolder data-icon="inline-start" /><span>Folder</span
        ></DropdownMenuPrimitive.Trigger
      >
      <DropdownMenu.Content
        forceMount
        onOpenAutoFocus={(event) => event.preventDefault()}
        portalProps={{ disabled: true }}
        trapFocus={false}
        width="regular"
      >
        <!-- mark-line: comparison only, today's recipe in today.ts -->
        <DropdownMenuPrimitive.Item class={today.menuItem} data-menu-item
          ><IconFolder /><span>{words.menu}</span></DropdownMenuPrimitive.Item
        >
        <!-- mark-line: comparison only, today's recipe in today.ts -->
        <DropdownMenuPrimitive.Item class={today.menuItem} data-menu-item
          ><IconCpu /><span>Machines</span></DropdownMenuPrimitive.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </section>

  <section class="flex flex-col items-start gap-space-2">
    <h3 class="type-meta text-tx-2">Segments</h3>
    <ToggleGroup.Root aria-label="View" type="single" value="machines">
      <!-- mark-line: comparison only, today's recipe in today.ts -->
      <ToggleGroupPrimitive.Item
        class={today.segment}
        data-slot="toggle-group-item"
        value="files"
        ><IconFolder /><span>Files</span></ToggleGroupPrimitive.Item
      >
      <!-- mark-line: comparison only, today's recipe in today.ts -->
      <ToggleGroupPrimitive.Item
        class={today.segment}
        data-slot="toggle-group-item"
        value="machines"
        ><IconCpu /><span>Machines</span></ToggleGroupPrimitive.Item
      >
    </ToggleGroup.Root>
  </section>

  <section class="flex w-72 max-w-full flex-col gap-space-2">
    <h3 class="type-meta text-tx-2">Alert</h3>
    <div class={today.alert} role="alert">
      <IconInfo />
      <AlertTitle>{words.alert}</AlertTitle>
      <AlertDescription>Nothing running is lost.</AlertDescription>
    </div>
  </section>

  <section class="flex w-72 max-w-full flex-col gap-space-2">
    <h3 class="type-meta text-tx-2">Row</h3>
    <RowList aria-label="Keys">
      <li class={today.row} data-slot="row-item">
        <span class="col-start-1 grid place-items-center" data-box>
          <span
            class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
          >
            <IconCpu class="size-icon-md" />
          </span>
        </span>
        <span class="col-start-2 min-w-0" data-slot="row-body"
          ><span class="type-label text-tx">{words.row}</span></span
        >
      </li>
    </RowList>
  </section>
</div>
