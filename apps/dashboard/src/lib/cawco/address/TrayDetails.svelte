<script lang="ts">
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import FactList from "./FactList.svelte";
  import type { AddressTray, Fact } from "./tray.svelte";

  /**
   * The particulars, one press away (gradual revelation): a fold that
   * opens inside the tray under its actions (`unfold`), holding Facts and
   * Raw as one segmented switch (fluid-tabs). Facts are a few drawn facts,
   * each by its mark; Raw is what the hub holds, word for word, in a well
   * that scrolls and selects whole, with Copy where the clipboard exists.
   * Its foot ends the work: Stop while it sets up, Remove once live, each
   * asked in place, its cost named before the press (WORDS.md, Destructive
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
      class="mark-line press-tint focus-inset group/fold -mx-space-2 flex min-h-c-btn-h-sm items-center gap-space-1 rounded-sm px-space-2 type-label text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
      data-tray-details
      onclick={() => {
        open = !open;
      }}
      type="button"
    >
      <IconChevronDown
        aria-hidden="true"
        class="size-icon-md transition-transform duration-(--dur-control) group-aria-expanded/fold:rotate-180"
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
          tab = next as "facts" | "raw";
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
            class="focus-inset m-0 max-h-c-address-raw-h overflow-auto overscroll-contain rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 type-code wrap-anywhere whitespace-pre-wrap text-ink-strong select-all"
            data-slot="raw">{raw}</pre>
          {#if tray.overHttps}
            <span class="flex justify-end">
              <CopyButton size="xs" text={raw} variant="ghost">Copy</CopyButton>
            </span>
          {/if}
        </div>
      {/if}
      {#if tray.step !== "unsupported"}
        <div
          class="grid gap-space-2 border-t border-t-border-hairline pt-space-2"
        >
          {#if tray.stopping}
            <p
              class="m-0 type-body text-pretty text-ink-strong"
              transition:unfold
            >
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
