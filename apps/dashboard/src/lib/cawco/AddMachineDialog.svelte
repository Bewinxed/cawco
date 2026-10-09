<script lang="ts">
  /**
   * Connect a machine: the one dialog every "add a machine" entry opens,
   * mounted once in the shell.
   *
   * Two ways in, one install. SSH has the hub run its install script on the
   * machine over `ssh` and follows it step by step; Command hands over the
   * same script as a one-liner to run there by hand and waits for the machine
   * to check in. Either way the script installs Bun if needed, clones CawCo
   * and ends in `cawco binary-install agent`, and the fleet is what says it worked.
   * Both end on the same view: the title, the joined row and Close.
   */
  import type { SshJoinJob } from "@cawco/core";
  import { INSTALL_STEP_PREFIX, machineLabel } from "@cawco/core";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import { IconChevronRight, IconError, IconSuccess } from "#lib/icons.js";
  import { cawco } from "./client.svelte";
  import CheckInStatus from "./join/CheckInStatus.svelte";
  import CopyBox from "./join/CopyBox.svelte";
  import JoinedRow from "./join/JoinedRow.svelte";
  import {
    addMachine,
    CheckIn,
    installCommand,
    JOIN_WAYS,
    type JoinWay,
    joinInfo,
    sshJoin,
  } from "./join/join.svelte";
  import { macReadiness } from "./join/readiness.svelte";

  /** Under 640px the dialog is a bottom sheet (DESIGN.md, Breakpoints). */
  const phone = new MediaQuery("(max-width: 640px)");
  /** The way in shown, which every entry can name as it opens the dialog. */
  const tab = $derived(addMachine.way);
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
  /**
   * Set when the dialog closes on a joined machine, so the next opening starts
   * on the form. Cleared at that opening rather than at close, so the closing
   * dialog fades out on the row it showed.
   */
  let closedJoined = false;
  $effect.pre(() => {
    if (!addMachine.open) {
      opened = false;
      return;
    }
    if (opened) {
      return;
    }
    opened = true;
    if (closedJoined) {
      closedJoined = false;
      sshJoin.reset();
    }
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

  /** The install script's and `cawco binary-install agent`'s steps, in the order they ran. */
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

  /**
   * The machine this way in added, once the fleet has it: the SSH run that
   * finished, or the machine that checked in while the command showed.
   */
  const joined = $derived.by(() => {
    if (tab === "ssh") {
      return job?.state === "done"
        ? { machineId: job.machineId, name: joinedName(job.machineId) }
        : null;
    }
    const machine = checkIn?.joined;
    return machine
      ? { machineId: machine.machineId, name: machineLabel(machine.hostname) }
      : null;
  });

  /** The SSH form shows while nothing runs, and again after a failure so it can be fixed. */
  const view = $derived(job?.state === "running" ? "running" : "form");

  const close = () => {
    if (joined) {
      closedJoined = true;
    }
    addMachine.open = false;
  };

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
</script>

<!-- The address the machine is told to reach this hub on, the same choice on
     both tabs: the script is downloaded from it and `join` saves it. -->
{#snippet addressField(
  id: string
)}
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

<!-- What the dialog and the phone's sheet both hold. -->
{#snippet body()}
  {#if joined}
    <JoinedRow
      name={joined.name}
      readiness={macReadiness.of(joined.machineId)}
    />
  {:else}
    <Tabs
      onValueChange={(value) => {
        addMachine.way = value as JoinWay;
      }}
      value={tab}
    >
      <TabsList aria-label="How to connect the machine">
        {#each JOIN_WAYS as way (way.way)}
          <TabItem icon={way.icon} label={way.name} value={way.way} />
        {/each}
      </TabsList>
    </Tabs>

    {#if joinInfo.error}
      <Alert.Root variant="destructive">
        <Alert.Description>{joinInfo.error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if tab === "ssh"}
      {#if view === "running" && job}
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
            <pre {@attach followTail()}>{job.lines.join("\n")}</pre>
          </details>
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
                placeholder="user@host or SSH alias"
                spellcheck="false"
                bind:value={target}
              />
            </div>
            <div class="field">
              <Label for="join-port">Port</Label>
              <Input
                aria-invalid={portValid ? undefined : "true"}
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
                <pre class="tail">{failure.tail.join("\n")}</pre>
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
                  {joinInfo.value.hubHostname}
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
        <CheckInStatus />
      </div>
    {/if}
  {/if}
{/snippet}

<!-- Close dismisses; it is never the task's act, so it is never coral. -->
{#snippet actions()}
  {#if tab === "ssh" && view === "form" && !joined}
    <Button onclick={close} variant="outline">Cancel</Button>
    <Button disabled={!canStart} form="ssh-join" type="submit">
      {#if starting}
        <Spinner class="size-4" />
      {/if}
      {job?.state === "failed" ? "Retry" : "Add machine"}
    </Button>
  {:else}
    <Button onclick={close} variant="outline">Close</Button>
  {/if}
{/snippet}

{#snippet description()}
  Install the CawCo agent on a machine and it joins this fleet.
{/snippet}

{#if phone.current}
  <!-- On a phone the dialog is the kit's bottom sheet. -->
  <Drawer.Root
    noBodyStyles
    onOpenChange={(value) => {
      if (value) {
        addMachine.open = true;
      } else {
        close();
      }
    }}
    open={addMachine.open}
    shouldScaleBackground={false}
  >
    <Drawer.Content aria-label="Connect a machine">
      <!-- Leading, as the dialog's title is, so the title, row and Close share one edge. -->
      <Drawer.Header
        class="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left"
      >
        <Drawer.Title class="text-title">Connect a machine</Drawer.Title>
        {#if !joined}
          <Drawer.Description>{@render description()}</Drawer.Description>
        {/if}
      </Drawer.Header>
      <div class="sheet-body">{@render body()}</div>
      <Drawer.Footer class="flex-col-reverse">
        {@render actions()}
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Dialog.Root
    bind:open={
      () => addMachine.open,
      (value) => {
    if (value) {
      addMachine.open = true;
    } else {
      close();
    }
  }
    }
  >
    <!-- Joined, Close is the one act the dialog offers, so it is the one button. -->
    <Dialog.Content class="sm:max-w-lg" showCloseButton={!joined}>
      <Dialog.Header>
        <Dialog.Title>Connect a machine</Dialog.Title>
        {#if !joined}
          <Dialog.Description>{@render description()}</Dialog.Description>
        {/if}
      </Dialog.Header>
      {@render body()}
      <Dialog.Footer>{@render actions()}</Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  /* The sheet's body keeps the dialog body's rhythm and scrolls under its
     header and footer when the install output grows. */
  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--spacing) * 6);
    min-height: 0;
    padding-inline: 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
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
</style>
