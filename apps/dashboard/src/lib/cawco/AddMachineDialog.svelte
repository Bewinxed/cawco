<script lang="ts">
  /**
   * Connect a machine: the one dialog every "add a machine" entry opens,
   * mounted once in the shell.
   *
   * Two ways in, one install. SSH has the hub run its install script on the
   * machine over `ssh` and follows it step by step; Command hands over the
   * same script as a one-liner to run there by hand and waits for the machine
   * to check in. Either way the script installs Bun if needed, clones CawCo
   * and ends in `cawco join`, and the fleet is what says it worked.
   */
  import type { SshJoinJob } from "@cawco/core";
  import { INSTALL_STEP_PREFIX, machineLabel } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { TabItem, Tabs, TabsList } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconChevronRight,
    IconError,
    IconServer,
    IconSuccess,
    IconTerminal,
  } from "#lib/icons.js";
  import { cawco } from "./client.svelte";
  import CheckInStatus from "./join/CheckInStatus.svelte";
  import CopyBox from "./join/CopyBox.svelte";
  import {
    addMachine,
    CheckIn,
    installCommand,
    joinInfo,
    sshJoin,
  } from "./join/join.svelte";

  let tab = $state<"ssh" | "command">("ssh");
  let target = $state("");
  let port = $state("");
  let hubUrl = $state("");
  let keyOpen = $state(false);
  let checkIn = $state<CheckIn | null>(null);
  let starting = $state(false);

  /**
   * Everything that belongs to one opening is set as it opens: the hub's
   * addresses are read again, the watcher starts from the fleet as it is now,
   * and the address picks up Tailscale unless one is already chosen. Driven
   * by `open` itself because the entries open it by setting it.
   */
  let opened = false;
  $effect.pre(() => {
    if (!addMachine.open) {
      opened = false;
      return;
    }
    if (opened) {
      return;
    }
    opened = true;
    checkIn = new CheckIn();
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the address list renders from joinInfo when it lands
    void joinInfo.refresh();
  });

  const addresses = $derived(joinInfo.value?.addresses ?? []);
  $effect.pre(() => {
    if (!addresses.some((address) => address.url === hubUrl)) {
      hubUrl = addresses[0]?.url ?? "";
    }
  });

  const job = $derived(sshJoin.job);

  /** Once a second while the dialog is open and the install is still going. */
  $effect(() => {
    if (!(addMachine.open && job?.state === "running")) {
      return;
    }
    const timer = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: each read updates sshJoin.job, which this dialog renders
      void sshJoin.poll();
    }, 1000);
    return () => clearInterval(timer);
  });

  /** The install script's and `cawco join`'s steps, in the order they ran. */
  const stepsOf = (run: SshJoinJob): string[] =>
    run.lines
      .filter((line) => line.startsWith(INSTALL_STEP_PREFIX))
      .map((line) => line.slice(INSTALL_STEP_PREFIX.length));

  const portNumber = $derived(port.trim() === "" ? undefined : Number(port));
  const portValid = $derived(
    portNumber === undefined ||
      (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65_535)
  );
  const canStart = $derived(
    target.trim() !== "" && hubUrl !== "" && portValid && !starting
  );

  async function start(event: SubmitEvent) {
    event.preventDefault();
    if (!canStart) {
      return;
    }
    starting = true;
    try {
      await sshJoin.start({
        target: target.trim(),
        hubUrl,
        ...(portNumber === undefined ? {} : { port: portNumber }),
      });
    } finally {
      starting = false;
    }
  }

  const joinedName = (machineId: string | null): string => {
    const row = cawco.machines.find((entry) => entry.machineId === machineId);
    return row ? machineLabel(row.hostname) : (machineId ?? "The machine");
  };

  /** The SSH form shows while nothing runs, and again after a failure so it can be fixed. */
  const view = $derived.by(() => {
    if (job?.state === "running") {
      return "running";
    }
    return job?.state === "done" ? "done" : "form";
  });

  /** `ssh`'s "host" in the run's target, for the host-key fix. */
  const hostOf = (value: string): string => value.split("@").at(-1) ?? value;

  /**
   * A failed run, said with the error formula: what happened, why, how to fix
   * it, what next. The key and the output ride along where they are the fix.
   */
  const failure = $derived.by(() => {
    if (job?.state !== "failed") {
      return null;
    }
    const where = job.target;
    const { problem } = job;
    if (!problem) {
      return { text: sshJoin.refused ?? "", tail: [] as string[] };
    }
    switch (problem.kind) {
      case "key":
        return {
          text: `${where} refused this hub's SSH key. Add the key below to ~/.ssh/authorized_keys on that machine, then Retry.`,
          tail: [],
        };
      case "host-key":
        return {
          text: `${where} answered with a different SSH host key than this hub saw before, so the hub stopped. If the machine was reinstalled, remove the old key on the hub with ssh-keygen -R ${hostOf(where)}, then Retry.`,
          tail: [],
        };
      case "unreachable":
        return {
          text: `${where} did not answer on port ${job.port ?? 22} (${problem.detail}). Check the address and that SSH is running there, then Retry.`,
          tail: [],
        };
      case "download":
        return {
          text: `SSH got into ${where}, but it could not download the install script from ${job.hubUrl}. Pick a hub address that machine can reach, then Retry.`,
          tail: job.lines.slice(-20),
        };
      case "step":
        return {
          text: `The step "${problem.step}" failed on ${where}. Its last output is below. Fix what it names, then Retry.`,
          tail: job.lines.slice(-20),
        };
      case "unregistered":
        return {
          text: `CawCo installed on ${where}, but the machine never came online on this hub. Its last output is below. Check that it can reach ${job.hubUrl}, then Retry.`,
          tail: job.lines.slice(-20),
        };
      default:
        return null;
    }
  });

  $effect.pre(() => {
    if (job?.problem?.kind === "key") {
      keyOpen = true;
    }
  });

  /** Keeps the newest output in view while it streams. */
  const followTail = (node: HTMLElement) => {
    $effect(() => {
      if (job?.lines.length) {
        node.scrollTop = node.scrollHeight;
      }
    });
  };
</script>

<!-- The address the machine is told to reach this hub on, the same choice on
     both tabs: the script is downloaded from it and `join` saves it. -->
{#snippet addressField(id: string)}
  <div class="field">
    <Label for={id}>Hub address this machine should use</Label>
    <NativeSelect.Root
      class="w-full"
      disabled={addresses.length === 0}
      {id}
      bind:value={hubUrl}
    >
      {#each addresses as address (address.url)}
        <NativeSelect.Option value={address.url}
          >{address.label}
          · {address.url}</NativeSelect.Option
        >
      {/each}
    </NativeSelect.Root>
    <span class="hint">
      The machine downloads the install script from here, so it has to be able
      to reach it.
    </span>
  </div>
{/snippet}

<Dialog.Root
  bind:open={() => addMachine.open, (value) => { addMachine.open = value; }}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Connect a machine</Dialog.Title>
      <Dialog.Description>
        Install the CawCo agent on a machine and it joins this fleet.
      </Dialog.Description>
    </Dialog.Header>

    <Tabs
      onValueChange={(value) => { tab = value as 'ssh' | 'command'; }}
      value={tab}
    >
      <TabsList aria-label="How to connect the machine">
        <TabItem icon={IconServer} label="SSH" value="ssh" />
        <TabItem icon={IconTerminal} label="Command" value="command" />
      </TabsList>
    </Tabs>

    {#if joinInfo.error}
      <Alert.Root variant="destructive">
        <Alert.Description>{joinInfo.error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if tab === 'ssh'}
      {#if view === 'running' && job}
        {@const steps = stepsOf(job)}
        <div class="flex flex-col gap-[var(--space-3)]">
          <p class="text-body text-[var(--ink-muted)]">
            Adding {job.target}. It keeps installing if you close this.
          </p>
          <ol aria-live="polite" class="steps">
            {#each steps as step, index (index)}
              <li class:current={index === steps.length - 1}>
                {#if index === steps.length - 1}
                  <Spinner class="size-4" />
                {:else}
                  <IconSuccess aria-hidden="true" class="size-4 done" />
                {/if}
                <span>{step}</span>
              </li>
            {:else}
              <li class="current">
                <Spinner class="size-4" /><span>Connecting over SSH</span>
              </li>
            {/each}
          </ol>
          <details class="output">
            <summary>
              <IconChevronRight aria-hidden="true" class="chev size-4" />Output
            </summary>
            <pre {@attach followTail}>{job.lines.join('\n')}</pre>
          </details>
        </div>
      {:else if view === 'done' && job}
        <div class="joined">
          <IconSuccess aria-hidden="true" class="size-5" />
          <p class="text-body">{joinedName(job.machineId)} joined the fleet.</p>
        </div>
      {:else}
        <form
          class="flex flex-col gap-[var(--space-4)]"
          id="ssh-join"
          onsubmit={start}
        >
          <div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-[var(--space-3)]">
            <div class="field">
              <Label for="join-target">SSH target</Label>
              <Input
                autocapitalize="off"
                autocomplete="off"
                id="join-target"
                placeholder="user@host, or a Host from ~/.ssh/config"
                spellcheck="false"
                bind:value={target}
              />
            </div>
            <div class="field">
              <Label for="join-port">Port</Label>
              <Input
                aria-invalid={portValid ? undefined : 'true'}
                id="join-port"
                inputmode="numeric"
                placeholder="22"
                bind:value={port}
              />
            </div>
          </div>
          {@render addressField("join-address-ssh")}

          {#if failure}
            <div class="flex flex-col gap-[var(--space-2)]" role="alert">
              <Alert.Root variant="destructive">
                <IconError aria-hidden="true" />
                <Alert.Description>{failure.text}</Alert.Description>
              </Alert.Root>
              {#if failure.tail.length > 0}
                <pre class="tail">{failure.tail.join('\n')}</pre>
              {/if}
            </div>
          {:else if sshJoin.refused}
            <Alert.Root role="alert" variant="destructive">
              <IconError aria-hidden="true" />
              <Alert.Description>{sshJoin.refused}</Alert.Description>
            </Alert.Root>
          {/if}

          <details class="output" bind:open={keyOpen}>
            <summary>
              <IconChevronRight aria-hidden="true" class="chev size-4" />
              This hub's SSH key
            </summary>
            <div class="flex flex-col gap-[var(--space-2)] pt-[var(--space-2)]">
              {#if joinInfo.value?.sshPublicKey}
                <p class="hint">
                  The machine has to accept this key: it goes in
                  ~/.ssh/authorized_keys for the user you sign in as.
                </p>
                <CopyBox
                  label="This hub's SSH public key"
                  text={joinInfo.value.sshPublicKey}
                />
              {:else if joinInfo.value}
                <p class="hint">
                  This hub has no SSH key yet. Create one on
                  {joinInfo.value
                    .hubHostname}
                  with ssh-keygen -t ed25519, then reopen this.
                </p>
              {/if}
            </div>
          </details>
        </form>
      {/if}
    {:else}
      <div class="flex flex-col gap-[var(--space-3)]">
        {@render addressField("join-address-command")}
        <p class="text-body text-[var(--ink-muted)]">
          Run this on the machine you want to add. It installs Bun if needed,
          clones CawCo and starts the agent.
        </p>
        {#if hubUrl}
          <CopyBox label="Install command" text={installCommand(hubUrl)} />
        {/if}
        {#if checkIn}
          <CheckInStatus {checkIn} />
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      {#if tab === 'ssh' && view === 'form'}
        <Button onclick={() => { addMachine.open = false; }} variant="outline"
          >Cancel</Button
        >
        <Button disabled={!canStart} form="ssh-join" type="submit">
          {#if starting}
            <Spinner class="size-4" />
          {/if}
          {job?.state === 'failed' ? 'Retry' : 'Add machine'}
        </Button>
      {:else if tab === 'ssh' && view === 'done'}
        <Button onclick={() => sshJoin.reset()} variant="outline"
          >Add another machine</Button
        >
        <Button onclick={() => { addMachine.open = false; }}>Close</Button>
      {:else}
        <Button onclick={() => { addMachine.open = false; }} variant="outline"
          >Close</Button
        >
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    color: var(--ink-strong);
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .steps li span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .steps li.current {
    color: var(--ink-strong);
  }
  .steps :global(.done) {
    flex: none;
    color: var(--status-done-ink);
  }
  .output summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: var(--type-label);
    color: var(--ink-muted);
    cursor: pointer;
    list-style: none;
    border-radius: var(--radius-xs);
  }
  .output summary::-webkit-details-marker {
    display: none;
  }
  @media (hover: hover) {
    .output summary:hover {
      color: var(--ink-strong);
    }
  }
  .output :global(.chev) {
    flex: none;
    transition: transform var(--dur-control) var(--ease-out);
  }
  .output[open] :global(.chev) {
    transform: rotate(90deg);
  }
  pre {
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    font-size: var(--text-meta);
    line-height: 1.5;
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--surface-hover);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
  }
  .output pre {
    max-height: 14rem;
    margin-top: 8px;
  }
  .tail {
    max-height: 12rem;
  }
  .joined {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--status-done-bg);
    color: var(--status-done-ink);
    border-radius: var(--radius-md);
  }
</style>
