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
   * edge.
   */
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import type { TriggerKind, TriggerSetting } from "@cawco/core/triggers";
  import {
    cawSettingsWords,
    triggerKindWords,
  } from "@cawco/core/words/caw-settings";
  import type { TriggerField, TriggerKindView } from "./caw-settings";
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
    onchange: (patch: Partial<TriggerSetting>) => void;
  } = $props();

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

<li
  data-slot="trigger-row"
  data-kind={kind}
  class="col-span-full grid grid-cols-subgrid gap-y-space-2"
>
  <div class="col-span-full grid min-w-0">
    <span class="font-medium text-tx type-label">{named.name}</span>
    {#if "what" in named}
      <span class="text-pretty text-tx-2 type-meta">{named.what}</span>
    {/if}
  </div>
  <div class="col-span-full grid grid-cols-subgrid">
    <RunsAs
      columns
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
      class="col-span-full m-0 text-red type-meta"
      role="alert"
    >
      {refused}
    </p>
  {/if}
</li>
