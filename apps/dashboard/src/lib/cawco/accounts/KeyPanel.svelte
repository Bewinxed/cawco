<script lang="ts">
  /**
   * A key account's key, typed once and relayed by the hub to the machines
   * ticked (it never keeps it): one password field with a reveal toggle, a
   * box per machine (an offline one can't take it), and Send key. What each
   * machine made of it stands on its row; the field empties once it is sent.
   * With one machine (the account page's popover) there is nothing to tick.
   */
  import { untrack } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { sendAccountKey } from "#lib/cawco/client.svelte.js";
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
                ? "That's a different key from this account's; it was taken back off."
                : "The machine didn't take the key.",
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
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }
</script>

{#snippet outcome(
  machineId: string
)}
  {@const result = results.get(machineId)}
  {#if result?.ok}
    <span class="ok"><Check />Key sent</span>
  {:else if result}
    <span class="bad"
      ><IconWarningTriangle aria-hidden="true" />{result.why}</span
    >
  {/if}
{/snippet}

<form
  class="keys"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  <InputGroup.Root>
    <InputGroup.Input
      aria-label="API key"
      autocomplete="off"
      id="{id}-key"
      placeholder="Paste the key"
      spellcheck="false"
      type={shown ? "text" : "password"}
      bind:value={key}
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        aria-label={shown ? "Hide key" : "Show key"}
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
    <ul aria-label="Machines" class="machines">
      {#each machines as machine (machine.machineId)}
        {@const online = machineOnline(machine)}
        <li class="mrow">
          <span class="pick" class:off={!online}>
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
            <label class="mname" for="{id}-{machine.machineId}"
              >{machineName(machine)}</label
            >
          </span>
          <span class="result">
            {#if !online}
              <span class="muted">Offline</span>
            {:else}
              {@render outcome(machine.machineId)}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="send">
    <Button
      disabled={key.trim() === "" || targets.length === 0}
      label="Send key"
      pending={sending}
      pendingLabel="Sending…"
      size="sm"
      type="submit"
      variant={primary ? "default" : "outline"}
    />
    {#if one && machines[0]}
      <span class="result">{@render outcome(machines[0].machineId)}</span>
    {/if}
  </div>
  {#if problem}
    <p class="bad" role="alert">{problem}</p>
  {/if}
</form>

<style>
  .keys {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .machines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .mrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1) var(--space-3);
    min-height: var(--c-btn-h);
  }
  .mrow + .mrow {
    border-block-start: 1px solid var(--border-hairline);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    cursor: pointer;
  }
  .pick.off {
    cursor: default;
  }
  .mname {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .off .mname {
    color: var(--ink-muted);
  }
  .send {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .result,
  .ok,
  .bad,
  .muted {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .ok {
    color: var(--ink-row);
  }
  .bad {
    color: var(--status-fail-ink);
  }
  .bad :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
  }
</style>
