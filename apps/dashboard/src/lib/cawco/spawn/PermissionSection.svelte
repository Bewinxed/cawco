<script lang="ts">
  import type { HarnessKind, PermissionMode } from "@cawco/core";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  /**
   * Permission-mode rows (§1.8, §2.11): sliding fill + mounted check. Every
   * pick of Full Send is asked first, under the rows (AskHere, The Open Page
   * Rule), saying what it allows beyond Bypass and what still stops; only
   * its own button applies it. The rows stay live beside it: another pick
   * there puts the question away. A Full Send restarting a running session
   * says its restart, and a refusal, in that session's feedback line, as
   * any pick does.
   */
  import Check from "~icons/solar/check-circle-bold-duotone";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
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
  const asks = new Asker<AskHereRequest>();
  function pick(mode: PermissionMode) {
    if (mode !== "fullSend" || value === "fullSend") {
      asks.dismiss();
      onchange(mode);
      return;
    }
    // Offered only where it has words (permission-modes.ts): never unread.
    const copy = fullSendCopy(harness);
    if (!copy) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: the question answers itself; a Cancel changes nothing
    void asks.ask({
      at: "fullSend",
      title: "Switch to Full Send?",
      body: restarts ? [...copy.confirm, copy.restarts] : copy.confirm,
      confirmLabel: "Switch to Full Send",
      pendingLabel: "Switching…",
      grant: true,
      // The yes is what this asks for: the change then says how it goes
      // where every pick's does (a running session's feedback line under
      // its chips), and the picker closes on it.
      run: () => {
        onchange("fullSend");
        return Promise.resolve();
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
  class="group relative grid gap-space-row rounded-md border border-border-control bg-surface-raised p-space-1 shadow-xs data-embedded:border-0 data-embedded:bg-transparent data-embedded:p-0 data-embedded:shadow-none"
  data-embedded={embedded || undefined}
  role="radiogroup"
  style:--row-h="44px"
  tabindex="-1"
  {@attach highlight({ rows: "[data-fh]" })}
>
  <span
    data-slot="fill"
    aria-hidden="true"
    class="pointer-events-none absolute top-space-1 right-space-1 left-space-1 h-(--row-h) transform-(--shift) rounded-sm bg-surface-fill opacity-(--o) group-data-embedded:top-0 group-data-embedded:inset-x-0 motion-safe:transition-[transform] motion-safe:dur-toggle motion-safe:ease-in-out"
    style:--o={rows.some((row) => row.value === value) ? 1 : 0}
    style:--shift={`translateY(calc(${index} * (var(--row-h) + 2px)))`}
  ></span>
  {#each rows as row, i (row.value)}
    {@const Icon = row.icon}
    {@const on = row.value === value}
    <!-- biome-ignore lint/a11y/useSemanticElements: the permission rows are designed tiles with a sliding fill; a native radio cannot render them -->
    <!-- literal: 10px gap, 6px 8px padding, 26px tile -->
    <button
      data-slot="row"
      aria-checked={on}
      aria-describedby={row.reason
        ? `${uid}-perm-${row.value}-reason`
        : undefined}
      class="ns-in press-tint relative flex h-(--row-h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border border-transparent bg-transparent px-(--pad-x) py-(--pad-y) text-left text-ink-strong disabled:cursor-not-allowed disabled:opacity-55"
      data-fh="1"
      data-perm={row.value}
      disabled={row.disabled}
      onclick={() => pick(row.value)}
      role="radio"
      style={`--delay:${i * 35}ms`}
      style:--gap="10px"
      style:--pad-x="8px"
      style:--pad-y="6px"
      type="button"
    >
      <span
        data-slot="tile"
        class="ns-tile size-(--tile) text-(--hue)"
        style:--hue={row.hue}
        style:--tile="26px"><Icon class="size-icon-md" /></span
      >
      <span data-slot="text" class="min-w-0 flex-1">
        <span data-slot="name" class="type-label block">{row.name}</span>
        <span class="type-meta block truncate text-ink-subtle">{row.desc}</span>
      </span>
      <!-- Every row keeps the check's slot, so the rows share one width
           whichever mode is chosen. -->
      <span aria-hidden="true" class="grid size-icon-md flex-none">
        {#if on}
          <Check class="ns-check size-icon-md text-ink-strong" />
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
<!-- Full Send's question, under the rows: they place their fill by index,
     so it stands after them, not between. -->
<AskHere asker={asks} at="fullSend" />
