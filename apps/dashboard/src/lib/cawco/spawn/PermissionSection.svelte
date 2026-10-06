<script lang="ts">
  import type { HarnessKind, PermissionMode } from "@cawco/core";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  /**
   * Permission-mode rows (§1.8, §2.11): sliding fill + mounted check. Every
   * pick of Full Send is confirmed first, in the app's one confirmation
   * dialog, which says what it allows beyond Bypass and what still stops;
   * only its own button applies it. The rows stay open under it, so a
   * Cancel lands back on the row it was asked from.
   */
  import Check from "~icons/solar/check-circle-bold-duotone";
  import { confirm } from "../confirm.svelte";
  import { fullSendCopy } from "../permission-modes";
  import { permissionLook } from "./permission-look";

  let {
    modes,
    value,
    onchange,
    harness,
    restarts = false,
    embedded = false,
  }: {
    modes: { value: PermissionMode; disabled: boolean; reason?: string }[];
    value: PermissionMode | null;
    onchange: (mode: PermissionMode) => unknown;
    /** The harness the modes are described for. */
    harness: HarnessKind | undefined;
    /** Switching into Full Send restarts a running session in place. */
    restarts?: boolean;
    embedded?: boolean;
  } = $props();
  const uid = $props.id();
  const rows = $derived(
    modes.map((mode) => ({ ...mode, ...permissionLook(mode.value, harness) }))
  );
  function pick(mode: PermissionMode) {
    if (mode !== "fullSend" || value === "fullSend") {
      onchange(mode);
      return;
    }
    // Offered only where it has words (permission-modes.ts): never unread.
    const copy = fullSendCopy(harness);
    if (!copy) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: the dialog answers itself; a Cancel changes nothing
    void confirm({
      title: "Switch to Full Send?",
      body: restarts ? [...copy.confirm, copy.restarts] : copy.confirm,
      confirmLabel: "Switch to Full Send",
      pendingLabel: "Switching…",
      grant: true,
      run: async () => {
        await onchange("fullSend");
      },
    });
  }
  const index = $derived(
    Math.max(
      0,
      rows.findIndex((row) => row.value === value)
    )
  );
</script>

<div
  aria-label="Permission mode"
  class="perms"
  role="radiogroup"
  tabindex="-1"
  class:embedded={embedded}
  {@attach highlight({ rows: "[data-fh]" })}
>
  <span
    aria-hidden="true"
    class="fill"
    style={`transform:translateY(calc(${index} * (var(--row-h) + 2px)));opacity:${rows.some((row) => row.value === value) ? 1 : 0}`}
  ></span>
  {#each rows as row, i (row.value)}
    {@const Icon = row.icon}
    {@const on = row.value === value}
    <!-- biome-ignore lint/a11y/useSemanticElements: the permission rows are designed tiles with a sliding fill; a native radio cannot render them -->
    <button
      aria-checked={on}
      aria-describedby={row.reason
        ? `${uid}-perm-${row.value}-reason`
        : undefined}
      class="row ns-in press-tint"
      data-fh="1"
      data-perm={row.value}
      disabled={row.disabled}
      onclick={() => pick(row.value)}
      role="radio"
      style={`--delay:${i * 35}ms`}
      type="button"
    >
      <span class="ns-tile tile" style={`color:${row.hue}`}><Icon /></span>
      <span class="text">
        <span class="name">{row.name}</span>
        <span class="desc">{row.desc}</span>
      </span>
      <!-- Every row keeps the check's slot, so the rows share one width
           whichever mode is chosen. -->
      <span aria-hidden="true" class="check-slot">
        {#if on}
          <Check class="check ns-check" />
        {/if}
      </span>
      {#if row.reason}
        <span class="sr-only" id={`${uid}-perm-${row.value}-reason`}
          >{row.reason}</span
        >
      {/if}
    </button>
  {/each}
</div>

<style>
  .perms {
    /* One row's height: the rows and the fill that slides under them. */
    --row-h: 44px;
    position: relative;
    display: grid;
    gap: 2px;
    padding: 4px;
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xs);
  }
  .perms.embedded {
    padding: 0;
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  .fill {
    position: absolute;
    left: 4px;
    right: 4px;
    top: 4px;
    height: var(--row-h);
    background: var(--surface-fill);
    border-radius: var(--radius-sm);
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-toggle) var(--ease-in-out);
    }
  }
  .embedded .fill {
    inset-inline: 0;
    top: 0;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: var(--row-h);
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--ink-strong);
  }
  .row:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .tile {
    width: 26px;
    height: 26px;
  }
  .tile :global(svg) {
    width: 16px;
    height: 16px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    font: var(--type-label);
  }
  .desc {
    display: block;
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check-slot {
    display: grid;
    flex: none;
    width: 16px;
    height: 16px;
  }
  .row :global(svg.check) {
    width: 16px;
    height: 16px;
    color: var(--ink-strong);
  }
</style>
