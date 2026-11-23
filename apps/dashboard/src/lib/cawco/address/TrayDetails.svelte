<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import FactList from "./FactList.svelte";
  import type { AddressTray, Fact } from "./tray.svelte";

  /**
   * The particulars, one press away (gradual revelation): a fold that
   * opens inside the tray under its actions (`unfold`), holding Facts and
   * Raw as one segmented switch (fluid-tabs). Facts are a few drawn facts,
   * each by its mark; Raw is what the hub holds, word for word, in a well
   * that scrolls and selects whole, with Copy where the clipboard exists.
   * Its foot ends the work: Stop while it sets up, Remove once live, each
   * asked in place, its cost named before the press (DESIGN.md, Voice, destructive
   * confirm).
   *
   * `look`: Family's chevron row ("Details"), or RowFault's text link
   * ("Show details" / "Hide details").
   */

  let {
    tray,
    facts,
    raw,
    open = $bindable(false),
    look = "row",
  }: {
    tray: AddressTray;
    facts: Fact[];
    raw: string;
    open?: boolean;
    look?: "row" | "link";
  } = $props();

  let tab = $state<"facts" | "raw">("facts");
  const foldId = $props.id();

  const removing = $derived(tray.step === "live");
  const cost = $derived(
    removing
      ? `Remove the word address? ${tray.name} leaves ${tray.facts.domain} and ${tray.short} stops answering. Its entry stays in the network's machines list as offline until an admin deletes it.`
      : `Stop setting up? ${tray.name} signs out. Anything it joined stays in the network's machines list as offline until an admin deletes it.`
  );
</script>

<div class="grid min-w-0" data-slot="tray-details">
  {#if look === "row"}
    <button
      aria-controls={foldId}
      aria-expanded={open}
      class="mark-line press-tint focus-inset group/fold -mx-space-2 flex min-h-control-sm items-center gap-space-1 rounded-sm px-space-2 type-label text-tx-2 transition-control hover:bg-ui hover:text-tx"
      data-tray-details
      onclick={() => {
        open = !open;
      }}
      type="button"
    >
      <IconChevronDown
        aria-hidden="true"
        class="size-icon-md transition-transform duration-(--duration-fast) group-aria-expanded/fold:rotate-180"
      />
      <span>Details</span>
    </button>
  {:else}
    <span class="flex justify-center">
      <Button
        aria-controls={foldId}
        aria-expanded={open}
        data-tray-details
        label={open ? "Hide details" : "Show details"}
        onclick={() => {
          open = !open;
        }}
        size="xs"
        variant="ghost"
      />
    </span>
  {/if}
  {#if open}
    <div
      id={foldId}
      class="grid min-w-0 gap-space-3 pt-space-2"
      transition:unfold
    >
      <Tabs
        onValueChange={(next) => {
          if (next === "facts" || next === "raw") {
            tab = next;
          }
        }}
        size="compact"
        value={tab}
      >
        <TabsList aria-label="Facts or raw">
          <TabItem label="Facts" value="facts" />
          <TabItem label="Raw" value="raw" />
        </TabsList>
      </Tabs>
      {#if tab === "facts"}
        <FactList cell="grid size-icon-md place-items-center" {facts} />
      {:else}
        <div class="grid min-w-0 gap-space-1">
          <pre
            class="focus-inset m-0 max-h-48 overflow-auto overscroll-contain rounded-sm ring ring-ui-2 bg-bg-2 px-space-3 py-space-2 type-code wrap-anywhere whitespace-pre-wrap text-tx select-all"
            data-slot="raw">{raw}</pre>
          {#if tray.overHttps}
            <span class="flex justify-end">
              <CopyButton size="xs" text={raw} variant="ghost">Copy</CopyButton>
            </span>
          {/if}
        </div>
      {/if}
      {#if tray.step !== "unsupported"}
        <div class="grid gap-space-2 border-t border-t-ui pt-space-2">
          {#if tray.stopping}
            <p class="m-0 type-body text-pretty text-tx" transition:unfold>
              {cost}
            </p>
            <span class="flex flex-wrap justify-end gap-space-2">
              <Button
                label="Keep it"
                onclick={() => {
                  tray.stopping = false;
                }}
                size="sm"
                variant="outline"
              />
              <Button
                label={removing ? "Remove address" : "Stop and sign out"}
                onclick={() => tray.stop()}
                size="sm"
                variant="destructive"
              />
            </span>
          {:else}
            <span class="flex justify-start">
              <Button
                label={removing ? "Remove address" : "Stop setting up"}
                onclick={() => {
                  tray.stopping = true;
                }}
                size="xs"
                tone="muted"
                variant="ghost"
              />
            </span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
