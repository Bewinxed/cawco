<script lang="ts" module>
  import type { Component } from "svelte";
  import {
    IconComment,
    IconConnection,
    IconRepeat,
    IconTaskList,
  } from "#lib/icons.js";

  /** Each kind's glyph, in its row's lead column. */
  const GLYPHS: Record<TriggerKind, Component> = {
    comments: IconComment,
    "routine-results": IconRepeat,
    "task-moves": IconTaskList,
    "inbound-events": IconConnection,
  };
</script>

<script lang="ts">
  /**
   * One kind of trigger's row in Caw's settings: what reaches it, and what
   * its short sessions start as, every picker on the row and pressable at
   * rest (RunsAs: account where its harness has accounts, harness and
   * model, mode). Each picker shows the value in effect; one the row does
   * not set itself is muted, with the word for where it comes from ("your
   * chat", "fleet", "each project"). A pick sets that field alone, and a
   * field the row sets carries a small reset that sets it back to what it
   * inherits. The row's words lead, the pickers under them from the same
   * edge; under the phone line the pickers and the refusal take the row's
   * whole width, from the glyph's edge, so its pickers keep one line.
   */
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import type { TriggerKind } from "@cawco/core/triggers";
  import {
    cawSettingsWords,
    triggerKindWords,
  } from "@cawco/core/words/caw-settings";
  import type {
    TriggerField,
    TriggerKindView,
    TriggerLayer,
  } from "./caw-settings";
  import RunsAs from "./RunsAs.svelte";

  const words = cawSettingsWords;

  let {
    kind,
    view,
    level = "project",
    machineId,
    machineName,
    installed,
    readonly = false,
    refused = null,
    onchange,
  }: {
    kind: TriggerKind;
    /** The kind as the hub answers it: its own layer and what runs. */
    view: TriggerKindView;
    /**
     * Whose layer the row sets: a project's (inheriting the fleet's
     * default, then your chat's) or the fleet's (inheriting each project's
     * own Caw, its values unknown here).
     */
    level?: "project" | "fleet";
    machineId: string;
    machineName: string;
    installed: HarnessKind[];
    /** No change can be asked now (the hub is away). */
    readonly?: boolean;
    /** The hub refused this kind's last change, in its words. */
    refused?: string | null;
    /** A change to the row's own layer: only what it changes, null back to inherited. */
    onchange: (patch: Partial<TriggerLayer>) => void;
  } = $props();

  const Glyph = $derived(GLYPHS[kind]);
  const named = $derived(triggerKindWords[kind]);

  const FIELDS: TriggerField[] = ["harness", "model", "mode", "account"];
  /** Each field the row does not set, in the words its chip says for where its value comes from. */
  const from = $derived.by(() => {
    const said: Partial<Record<TriggerField, string>> = {};
    for (const field of FIELDS) {
      const { from: source } = view.inEffect[field];
      if (source === "default") {
        said[field] = words.from.default;
      } else if (source !== "project" && source !== level) {
        said[field] =
          level === "fleet" ? words.from.eachCaw : words.from[source];
      }
    }
    return said;
  });
  /** A field holding the triggers' own default says so in its tooltip. */
  const tips = $derived(
    view.inEffect.mode.from === "default"
      ? { mode: words.triggerModeDefault }
      : {}
  );
  const effect = $derived(view.inEffect);
</script>

<!-- mark-line: the glyph stands in the row's lead column, centred on the
     name's first line by a box one label line tall, not beside the words. -->
<li
  data-slot="trigger-row"
  data-kind={kind}
  class="grid grid-cols-mark-fluid items-start gap-x-space-2 gap-y-space-2 border-border-hairline py-space-3 not-last:border-b"
>
  <span aria-hidden="true" class="flex h-lh items-center type-label">
    <Glyph class="size-icon-md flex-none text-ink-muted" />
  </span>
  <div class="grid min-w-0">
    <span class="type-label font-medium text-ink-strong">{named.name}</span>
    <span class="type-meta text-ink-muted text-pretty">{named.what}</span>
  </div>
  <div
    class="col-start-2 min-w-0 max-phone:col-span-full max-phone:col-start-1"
  >
    <RunsAs
      account={effect.account.value}
      {from}
      harness={effect.harness.value}
      id={`trigger-${kind}`}
      {installed}
      {machineId}
      {machineName}
      mode={effect.mode.value}
      model={effect.model.value}
      {tips}
      {onchange}
      onreset={(fields) =>
        onchange(Object.fromEntries(fields.map((field) => [field, null])))}
      {readonly}
      tight
      resetLabel={(field) =>
        level === "fleet"
          ? words.resetFleet(words.fields[field])
          : words.reset(words.fields[field])}
    />
  </div>
  {#if refused}
    <p
      data-slot="refused"
      class="col-start-2 m-0 type-meta text-error-11 max-phone:col-span-full max-phone:col-start-1"
      role="alert"
    >
      {refused}
    </p>
  {/if}
</li>
