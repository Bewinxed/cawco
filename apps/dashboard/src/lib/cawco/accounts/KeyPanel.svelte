<script lang="ts">
  /**
   * A key account's key, typed once and relayed by the hub to the machines
   * ticked (it never keeps it): one password field with a reveal toggle, a
   * box per machine (an offline one can't take it), and Send key. What each
   * machine made of it stands on its row; the field empties once it is sent.
   * With one machine (the account page's popover) there is nothing to tick.
   */
  import { accountsWords } from "@cawco/core";
  import { untrack } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { sendAccountKey } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { IconEye, IconEyeClosed, IconWarningTriangle } from "#lib/icons.js";
  import Check from "./Check.svelte";
  import {
    type AccountMachine,
    machineName,
    machineOnline,
  } from "./model.svelte";

  let {
    account,
    machines,
    onsent,
    primary = true,
  }: {
    /** The account's id, making it first where the setup has not yet. */
    account: () => Promise<string>;
    machines: AccountMachine[];
    /** The key landed on at least one machine. */
    onsent?: () => void;
    /** Send key is the step's primary; once a key is on a machine, Continue is. */
    primary?: boolean;
  } = $props();

  const words = accountsWords.key;
  const id = $props.id();
  let key = $state("");
  let shown = $state(false);
  let sending = $state(false);
  let problem = $state<string | null>(null);
  const ticked = new SvelteSet<string>(
    untrack(() =>
      machines.filter(machineOnline).map((machine) => machine.machineId)
    )
  );
  /** What each machine made of the last key sent there. */
  const results = new SvelteMap<
    string,
    { ok: true } | { ok: false; why: string }
  >();
  const one = $derived(machines.length === 1);
  const targets = $derived(
    machines.filter(
      (machine) =>
        machineOnline(machine) && (one || ticked.has(machine.machineId))
    )
  );

  async function send() {
    if (sending || key.trim() === "" || targets.length === 0) {
      return;
    }
    sending = true;
    problem = null;
    try {
      const accountId = await account();
      const { machines: answers } = await sendAccountKey(
        accountId,
        key.trim(),
        targets.map((machine) => machine.machineId)
      );
      key = "";
      for (const answer of answers) {
        if ("error" in answer) {
          results.set(answer.machineId, { ok: false, why: answer.error });
        } else if (answer.result.state === "signed-in") {
          results.set(answer.machineId, { ok: true });
        } else {
          results.set(answer.machineId, {
            ok: false,
            why:
              answer.result.state === "mismatch"
                ? words.otherKey
                : words.notTaken,
          });
        }
      }
      if (
        answers.some(
          (answer) => "result" in answer && answer.result.state === "signed-in"
        )
      ) {
        onsent?.();
      }
    } catch (error) {
      problem = failureWords(error);
    } finally {
      sending = false;
    }
  }
</script>

{#snippet outcome(machineId: string)}
  {@const result = results.get(machineId)}
  {#if result?.ok}
    <span class="mark-line type-meta inline-flex items-center gap-space-1 text-ink-row"><Check /><span>{words.sent}</span></span>
  {:else if result}
    <span class="mark-line type-meta inline-flex items-center gap-space-1 text-status-fail-ink"
      ><IconWarningTriangle aria-hidden="true" class="size-icon-sm flex-none" /><span>{result.why}</span></span
    >
  {/if}
{/snippet}

<form
  class="flex min-w-0 flex-col gap-space-3"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  <InputGroup.Root>
    <InputGroup.Input
      aria-label={words.label}
      autocomplete="off"
      id="{id}-key"
      placeholder={words.placeholder}
      spellcheck="false"
      type={shown ? "text" : "password"}
      bind:value={key}
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        aria-label={shown ? words.hide : words.show}
        aria-pressed={shown}
        onclick={() => {
          shown = !shown;
        }}
        size="icon-xs"
      >
        {#if shown}
          <IconEyeClosed />
        {:else}
          <IconEye />
        {/if}
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>

  {#if !one}
    <ul data-slot="machines" aria-label={words.machines} class="m-0 flex list-none flex-col p-0">
      {#each machines as machine (machine.machineId)}
        {@const online = machineOnline(machine)}
        <li
          class="flex min-h-c-btn-h flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1 not-first:border-t not-first:border-border-hairline"
        >
          <span
            data-slot="pick"
            data-off={!online || undefined}
            class="group flex min-w-0 cursor-pointer items-center gap-space-3 data-off:cursor-default"
          >
            <Checkbox
              disabled={!online}
              id="{id}-{machine.machineId}"
              bind:checked={
                () => online && ticked.has(machine.machineId),
                (on) => {
                  if (on) {
                    ticked.add(machine.machineId);
                  } else {
                    ticked.delete(machine.machineId);
                  }
                }
              }
            />
            <label
              class="type-label truncate text-ink-strong group-data-off:text-ink-muted"
              for="{id}-{machine.machineId}"
              >{machineName(machine)}</label
            >
          </span>
          <span data-slot="result" class="type-meta inline-flex items-center gap-space-1 text-ink-muted">
            {#if !online}
              <span class="type-meta inline-flex items-center gap-space-1 text-ink-muted">{words.offline}</span>
            {:else}
              {@render outcome(machine.machineId)}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <div data-slot="send" class="flex flex-wrap items-center gap-space-3">
    <Button
      disabled={key.trim() === "" || targets.length === 0}
      label={words.send}
      pending={sending}
      pendingLabel={words.sending}
      size="sm"
      type="submit"
      variant={primary ? "default" : "outline"}
    />
    {#if one && machines[0]}
      <span data-slot="result" class="type-meta inline-flex items-center gap-space-1 text-ink-muted"
        >{@render outcome(machines[0].machineId)}</span
      >
    {/if}
  </div>
  {#if problem}
    <p class="type-meta inline-flex items-center gap-space-1 text-status-fail-ink" role="alert">{problem}</p>
  {/if}
</form>
