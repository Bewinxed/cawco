<script lang="ts">
  /**
   * The picked node in the panel's inspector (the sheet inspector's frame,
   * DESIGN.md "A sheet's inspector"): beside the well on a pane 640px or
   * wider, `c-sheet-inspector-w` on the raised surface with a hairline seam;
   * narrower, a sheet docked under the well, edge to edge, at most 40% of
   * the pane, so nothing on the app's screen stands under it; its body
   * scrolls under the house's edge fade. It says the node's class and
   * label and where its view is made when the build stamps it, then (the
   * mirror's) that it was written, not read; the comment pinned on it;
   * then its frame, and its type, ink, fill and radius by the design
   * system's token names. What a short sheet must show stands first.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconFileCode } from "#lib/icons.js";
  import PinMark from "../PinMark.svelte";
  import type { NativeNode } from "./fixture";

  let {
    node,
    pin,
    note = null,
    same = null,
    onclose,
  }: {
    /** Where else this node stands picked under the same pin (the both option's canvas still). */
    same?: string | null;
    node: NativeNode;
    /** A line on what the node is not: the mirror's, that it was written, not read. */
    note?: string | null;
    onclose: () => void;
    /** The comment on it. */
    pin: { number: number; words: string; who: string; age: string } | null;
  } = $props();

  const rows = $derived([
    [
      "Frame",
      `${node.frame[0]},${node.frame[1]} · ${node.frame[2]}×${node.frame[3]}`,
    ],
    ["Type", node.tokens.type],
    ["Ink", node.tokens.ink],
    ["Fill", node.tokens.fill],
    ["Radius", node.tokens.radius],
  ]);
</script>

<aside
  aria-label="Picked"
  class="z-2 flex max-h-2/5 flex-none flex-col rounded-t-lg border-t border-t-border-hairline bg-surface-raised shadow-drawer @phone/pane:max-h-none @phone/pane:w-c-sheet-inspector-w @phone/pane:rounded-none @phone/pane:border-t-0 @phone/pane:border-s @phone/pane:border-s-border-hairline @phone/pane:shadow-none"
  data-slot="node-inspector"
>
  <header
    class="flex min-h-c-sheet-inspector-head-h flex-none items-center gap-space-2 border-b border-b-border-hairline ps-space-4 pe-space-2"
  >
    <h2
      class="mark-line m-0 flex flex-1 items-center gap-space-2 text-ink-strong type-label"
    >
      {#if pin}<span class="mark-cell"
          ><PinMark number={pin.number} state="sent" tail="none" /></span
        >{/if}<span>Picked</span>{#if same}<span
          class="min-w-0 text-ink-muted type-meta"
          data-slot="same-node">{same}</span
        >{/if}
    </h2>
    <Button
      aria-label="Close"
      class="touch-hit"
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title="Close"
      variant="ghost"
    />
  </header>
  <div
    class="kit-edge-fade-block fade-len-c-edge-fade-len grid min-h-0 flex-1 content-start gap-space-3 overflow-auto overscroll-contain px-space-4 py-space-3"
  >
    <div class="grid gap-space-1">
      <span class="text-ink-muted type-code liga-none">{node.kind}</span>
      <span class="text-ink-strong type-label wrap-anywhere"
        >“{node.label}”</span
      >
      {#if node.at}
        <span
          class="mark-line flex items-center gap-space-1 text-ink-muted type-meta"
        >
          <span class="mark-cell"><IconFileCode /></span>
          <span
            class="min-w-0 type-code liga-none wrap-anywhere text-ink-strong"
            >{node.at}</span
          >
        </span>
      {:else}
        <span class="text-ink-muted type-meta"
          >Not stamped: the build doesn't say where it's made.</span
        >
      {/if}
    </div>
    {#if note}
      <p
        class="m-0 rounded-sm border border-border-hairline bg-surface-recess px-space-3 py-space-2 text-ink-strong type-label text-pretty"
        data-slot="written-note"
      >
        {note}
      </p>
    {/if}
    {#if pin}
      <div
        class="grid gap-space-2 border-t border-t-border-hairline pt-space-3"
      >
        <div class="mark-line flex items-start gap-space-2">
          <span class="mark-cell"
            ><PinMark number={pin.number} state="sent" tail="none" /></span
          >
          <span class="grid min-w-0 flex-1 gap-space-row" data-box>
            <span class="text-ink-strong type-body wrap-anywhere"
              >{pin.words}</span
            >
            <span class="text-ink-muted type-meta"
              >{pin.who} · <span class="num">{pin.age}</span></span
            >
          </span>
        </div>
        <div class="flex justify-end">
          <Button label="Reply" size="sm" variant="outline" />
        </div>
      </div>
    {/if}
    <dl
      class="m-0 grid gap-y-space-1 border-t border-t-border-hairline pt-space-3 type-meta"
    >
      {#each rows as [name, value] (name)}
        <div class="flex gap-space-3">
          <dt class="w-1/4 flex-none text-ink-muted">{name}</dt>
          <dd
            class="m-0 min-w-0 text-ink-strong type-code liga-none wrap-anywhere num"
          >
            {value}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
</aside>
