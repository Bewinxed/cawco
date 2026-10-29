<script lang="ts">
  import { type Install, installerRan } from "@cawco/core/install";
  /**
   * Outcome: how the install ended, standing until the person acts on it
   * (Retry or Remove install); closing the window parks it in its row.
   *
   * - **Problem**: "Failed at <step>" (an assertive live region), then the
   *   error formula: why, the fix and where it is done with its command to
   *   copy, what next and what was left on the machine; the output's last
   *   lines where they hold the answer.
   * - **Lost**: the hub restarted during it; what the fleet says of the
   *   machine just now; Retry runs it all again.
   * - **Stopped**: before it signed in, before the installer ran, or while
   *   it ran, and what that left.
   * - **Joined**: the machine in the fleet, then its presence as the fleet
   *   says it, with the name it lists it by, and Open on the same line: a
   *   line shorter than Lost by more than a rung of the height ladder, as
   *   Lost turns into it on its own. A harness its harnesses step could not
   *   bring up stands under it as its block, with its press and why
   *   (HarnessBlock): the machine is in, and that is its one thing to do.
   *
   * Retry keeps every detail; a password sign-in asks for its password
   * again, which was used once and forgotten.
   */
  import { connectWords } from "@cawco/core/words/connect";
  import { Button } from "#lib/components/ui/button/index.js";
  import { barGlass } from "../bar-glass.svelte";
  import { cawco } from "../client.svelte";
  import HarnessBlock from "../HarnessBlock.svelte";
  import { machineBlocksOf } from "../harness-block.svelte";
  import { failureWords } from "../hub-read";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { connect } from "./installs.svelte";
  import MonoWell from "./MonoWell.svelte";
  import PasswordField from "./PasswordField.svelte";
  import StepMark from "./StepMark.svelte";
  import { keysLeft, machineWord, problemWords } from "./words";

  let { install }: { install: Install } = $props();

  function arrive(_node: Element) {
    const travel = motionOk.current;
    return {
      duration: dur("--dur-toggle"),
      easing: easeOut,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; transform: scale(${0.6 + 0.4 * t})`
          : `opacity: ${t}`,
    };
  }

  const name = $derived(machineWord(install));
  const words = $derived(
    install.problem && install.state === "failed"
      ? problemWords(install, install.problem)
      : null
  );
  const machine = $derived(
    cawco.machines.find((one) => one.machineId === install.machineId)
  );
  /** What its harnesses step could not bring up, standing on the machine. */
  const blocks = $derived(machine ? machineBlocksOf(machine) : []);
  const inFleet = $derived(
    cawco.machines.some(
      (one) =>
        one.machineId === install.machineId ||
        one.hostname.split(".")[0]?.toLowerCase() === name.toLowerCase()
    )
  );

  let retrying = $state(false);
  let refused = $state("");
  async function retry() {
    if (install.signIn === "password" && !connect.password) {
      refused =
        "Type the password again: it was used for one sign-in and then forgotten.";
      return;
    }
    retrying = true;
    refused = "";
    try {
      await connect.retry(install.id);
    } catch (error) {
      refused = failureWords(error);
    } finally {
      retrying = false;
    }
  }
  let removing = $state(false);
  async function remove() {
    removing = true;
    refused = "";
    try {
      connect.close();
      await connect.remove(install.id);
    } catch (error) {
      refused = failureWords(error);
    } finally {
      removing = false;
    }
  }
</script>

<div class="flex flex-col gap-space-3" data-outcome={install.state}>
  {#if install.state === "joined"}
    <div class="mark-line flex items-center gap-space-2">
      <!-- The success check lands once, from 0.6 over 160ms (as the task
           ring's does); with less motion it only fades. -->
      <span class="inline-grid" data-box in:arrive|global
        ><StepMark state="done" /></span
      >
      <p class="m-0 type-body text-ink-strong wrap-anywhere" aria-live="polite">
        {name} is in the fleet.
      </p>
    </div>
    <!-- A long name wraps Open onto a line of its own, at the end. -->
    <div class="flex flex-wrap items-center gap-space-2">
      <div class="mark-line flex min-w-0 flex-1 items-start gap-space-2">
        <span class="mark-cell type-body">
          <span
            aria-hidden="true"
            class={[
              "size-(--status-dot-size) rounded-pill",
              machine?.status === "online"
                ? "bg-presence-online"
                : "bg-presence-off",
            ]}
            data-box
          ></span>
        </span>
        <p
          data-slot="presence"
          class="m-0 type-body text-pretty text-ink-muted wrap-anywhere"
        >
          {machine?.status === "online"
            ? `Online as ${machine.hostname}.`
            : "Offline just now. This changes on its own once it is back."}
        </p>
      </div>
      <Button
        class="ms-auto max-w-full flex-none"
        onclick={() => {
          const id = install.machineId;
          connect.close();
          if (id) {
            barGlass.showMachine(id);
          }
        }}
        variant="default">Open {name}</Button
      >
    </div>
    {#if machine}
      {#each blocks as block (block.harness)}
        <HarnessBlock
          {block}
          machineId={machine.machineId}
          online={machine.status === "online"}
        />
      {/each}
    {/if}
  {:else}
    {#if install.state === "lost"}
      <div class="mark-line flex items-start gap-space-2">
        <span class="mark-cell type-body"><StepMark state="failed" /></span>
        <div class="flex flex-col gap-space-1" aria-live="assertive" data-box>
          <p class="m-0 type-body text-ink-strong wrap-anywhere">
            The hub restarted during the install and lost it.
          </p>
          <p class="m-0 type-body text-ink-muted wrap-anywhere">
            The fleet just now: {name}
            {inFleet ? "is in it, but not online." : "is not in it."}
          </p>
          <p class="m-0 type-body text-ink-muted wrap-anywhere">
            Retry runs the whole install again.
          </p>
        </div>
      </div>
    {:else if install.state === "stopped"}
      <div class="mark-line flex items-start gap-space-2">
        <span class="mark-cell type-body"><StepMark state="stopped" /></span>
        <p class="m-0 type-body text-pretty text-ink-strong wrap-anywhere">
          {#if install.route === "command"}
            Stopped. The command no longer works; nothing on the machine was
            touched unless it already ran. Retry gives a new command.
          {:else if !install.signedIn}
            Stopped before it signed in. Nothing on {name} was changed.
          {:else if installerRan(install)}
            Stopped after it signed in, while the installer ran. The install may
            be part-way in. {keysLeft(install, name)} Retry runs it again from the
            start.
          {:else}
            Stopped after it signed in, before the installer ran. {keysLeft(
              install,
              name
            ) || `Nothing on ${name} was changed.`}
          {/if}
        </p>
      </div>
      <MonoWell label="The output's last lines" lines={install.tail} rows={3} />
    {:else if words}
      <div class="flex flex-col gap-space-2">
        <div class="mark-line flex items-center gap-space-2">
          <StepMark state="failed" />
          <p
            data-slot="headline"
            class="m-0 type-label text-status-fail-ink"
            aria-live="assertive"
          >
            {words.headline}
          </p>
        </div>
        {#if words.why}
          <p
            data-slot="why"
            class="m-0 type-body text-pretty text-ink-strong wrap-anywhere"
          >
            {words.why}
          </p>
        {/if}
        {#if words.command}
          <p class="m-0 type-body text-ink-strong wrap-anywhere">
            {words.where}
          </p>
          <MonoWell
            copy={words.command}
            copyLabel="Copy {words.command}"
            label="The command that fixes it"
            lines={[words.command]}
          />
        {/if}
        {#if words.fix}
          <p class="m-0 type-body text-pretty text-ink-strong wrap-anywhere">
            {words.fix}
          </p>
        {/if}
        <p class="m-0 type-body text-pretty text-ink-muted wrap-anywhere">
          {words.next}
        </p>
      </div>
      <MonoWell label="The output's last lines" lines={install.tail} rows={3} />
    {/if}

    {#if install.signIn === "password"}
      <PasswordField
        id="connect-password-again"
        label="The machine's password, for Retry's one sign-in"
        placeholder="Its password again: it was used once and forgotten"
      />
    {/if}
    {#if refused}
      <p class="m-0 type-meta text-status-fail-ink" aria-live="polite">
        {refused}
      </p>
    {/if}
    <div class="flex items-center gap-space-2">
      {#if install.state !== "lost"}
        <Button
          data-connect-keep
          data-output-opener
          onclick={() => connect.openOutput()}
          variant="outline">{connectWords.openOutput}</Button
        >
      {/if}
      <span class="flex-1"></span>
      <Button
        label={connectWords.removeInstall}
        onclick={remove}
        pending={removing}
        pendingLabel="Removing…"
        variant="ghost"
      />
      <Button
        label="Retry"
        onclick={retry}
        pending={retrying}
        pendingLabel="Retrying…"
        variant="default"
      />
    </div>
  {/if}
</div>
