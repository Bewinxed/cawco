<script lang="ts">
  /**
   * Show details (gradual revelation): a ghost text link that unfolds, in
   * the tray, the state's few facts, drawn by their marks, and on a failure
   * what came back word for word, in a well that selects whole, with Copy
   * where this page has a clipboard. Its foot ends the work, the only thing
   * that does: Stop while it sets up, Remove once live, each asked in place
   * with its cost named before the press (WORDS.md, Destructive confirm).
   *
   * `part`: the link alone (it stands in the actions' row on a desk), the
   * fold alone (under that row), or both, the link over its fold.
   */
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconDot, IconMinusCircle, IconSuccess } from "#lib/icons.js";
  import Words from "../Words.svelte";
  import { hasClipboard } from "./FlowObject.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { factsFor, rawFor } from "./flow-words";

  let {
    flow,
    part = "both",
    open = $bindable(false),
  }: {
    flow: AddressFlow;
    part?: "link" | "fold" | "both";
    open?: boolean;
  } = $props();
  const foldId = $props.id();
  const clipboard = hasClipboard();
  const removing = $derived(flow.step === "done");
  const failed = $derived(flow.step === "failed");
  const cost = $derived(
    removing
      ? `Remove the word address? ${flow.name} leaves ${flow.facts.domain} and ${flow.address} stops answering. Its entry stays in the machines list as offline until an admin deletes it.`
      : `Stop setting up? ${flow.name} signs out. Anything it joined stays in the machines list as offline until an admin deletes it.`
  );
</script>

<div
  class={["grid min-w-0", part === "fold" && !open && "hidden"]}
  data-slot={part === "fold" ? "tray-details-fold" : "tray-details"}
>
  {#if part !== "fold"}
    <!-- At the tray's leading edge: the ghost button's pad hangs outside it, so its words stand on the edge. -->
    <span class="flex justify-start">
      <Button
        aria-controls={foldId}
        aria-expanded={open}
        class="-ms-space-2"
        data-tray-details
        label={open ? "Hide details" : "Show details"}
        onclick={() => {
          open = !open;
        }}
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </span>
  {/if}
  {#if open && part !== "link"}
    <div
      id={foldId}
      class="grid min-w-0 gap-space-3 pt-space-2 text-start"
      transition:unfold
    >
      <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
      <ul class="m-0 grid list-none gap-space-2 p-0" role="list">
        <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
        {#each factsFor(flow) as fact (fact.text)}
          <li class="mark-line flex min-w-0 items-start gap-space-2 type-body">
            <span class="mark-cell w-icon-md">
              {#if fact.mark === "yes"}
                <IconSuccess
                  aria-label="Yes"
                  class="size-icon-md text-status-done-ink"
                />
              {:else if fact.mark === "no"}
                <IconMinusCircle
                  aria-label="No"
                  class="size-icon-md text-ink-muted"
                />
              {:else if fact.mark === "wait"}
                <LiveDot />
              {:else}
                <IconDot
                  aria-hidden="true"
                  class="size-icon-sm text-ink-muted"
                />
              {/if}
            </span>
            <span class="mark-text min-w-0 text-ink-strong"
              ><Words text={fact.text} /></span
            >
          </li>
        {/each}
      </ul>
      {#if failed}
        <div class="grid min-w-0 gap-space-1">
          <span class="type-label text-ink-muted">What came back</span>
          <pre
            class="focus-inset m-0 max-h-c-address-raw-h overflow-auto overscroll-contain rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 type-code wrap-anywhere whitespace-pre-wrap text-ink-strong select-all"
            data-slot="raw">{rawFor(flow)}</pre>
          {#if clipboard}
            <span class="flex justify-end">
              <CopyButton size="xs" text={rawFor(flow)} variant="ghost"
                >Copy</CopyButton
              >
            </span>
          {/if}
        </div>
      {/if}
      {#if !(failed && flow.cause === "unsupported")}
        <div
          class="grid gap-space-2 border-t border-t-border-hairline pt-space-2"
        >
          {#if flow.stopping}
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
                  flow.stopping = false;
                }}
                size="sm"
                variant="outline"
              />
              <Button
                data-stop="confirm"
                label={removing
                  ? "Remove the word address"
                  : "Stop and sign out"}
                onclick={() => flow.stop()}
                size="sm"
                variant="destructive"
              />
            </span>
          {:else}
            <span class="flex justify-start">
              <Button
                data-stop="ask"
                label={removing ? "Remove the word address" : "Stop setting up"}
                onclick={() => {
                  flow.stopping = true;
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
