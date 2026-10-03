<script lang="ts">
  import type { AuthState } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  /**
   * Unlocks a Mac's login keychain from here.
   *
   * macOS binds the login keychain to the Aqua session. When it is locked, every
   * credential read on that machine fails with `errSecInteractionNotAllowed`,
   * the daemon reports `unreadable-credentials`, and every turn on that machine
   * answers "Not logged in". The fix is one command — but a fleet tool whose
   * answer is "go and open a terminal on the other machine" has stopped being a
   * fleet tool, so it is asked for here and relayed down the tunnel.
   *
   * The password is sent, used, and dropped. It is not stored here, not kept in
   * the store, and not written anywhere on the way.
   */
  import { IconKey } from "#lib/icons.js";
  import { type Machine, machineControl } from "./client.svelte";
  import MachineAuthStatus from "./MachineAuthStatus.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  let {
    machine,
    open: dialogOpen = $bindable(false),
  }: { machine: Machine; open?: boolean } = $props();

  /**
   * Where the dialog is: the password form, the machine unlocking and
   * checking, what it answered, or the form again with why it failed.
   */
  type Phase =
    | { kind: "password" }
    | { kind: "working" }
    | { kind: "done"; state: AuthState }
    | { kind: "error"; message: string };

  let phase = $state<Phase>({ kind: "password" });
  let password = $state("");
  /**
   * Which submit an answer belongs to: an answer that lands after the reader
   * closed the dialog and opened it again is dropped.
   */
  let attempt = 0;
  /** The height the form's view stood at when sent, held while it works. */
  let held = $state(0);

  const SAID: Record<AuthState, { title: string; body: string }> = $derived({
    authenticated: {
      title: `${machine.hostname} is unlocked`,
      body: `${machine.hostname} is logged in again. New sessions there can read its credentials.`,
    },
    unauthenticated: {
      title: `${machine.hostname} is not logged in`,
      body: `${machine.hostname} unlocked, but nobody has logged in there yet.`,
    },
    "unreadable-credentials": {
      title: `${machine.hostname} cannot read its login`,
      body: `${machine.hostname} unlocked, but its credentials still cannot be read.`,
    },
  });

  // A close by the bound value runs no `onOpenChange`, so the last answer is
  // dropped as the dialog opens again, before it is drawn.
  let shown = false;
  $effect.pre(() => {
    if (!dialogOpen) {
      shown = false;
      return;
    }
    if (shown) {
      return;
    }
    shown = true;
    attempt += 1;
    phase = { kind: "password" };
    password = "";
  });

  async function unlock(
    event: SubmitEvent & { currentTarget: HTMLFormElement }
  ) {
    event.preventDefault();
    if (!password) {
      return;
    }
    attempt += 1;
    const mine = attempt;
    // The form's parent is the view the status replaces.
    held = (event.currentTarget.parentElement as HTMLElement).offsetHeight;
    phase = { kind: "working" };
    const sent = password;
    // Cleared the moment it has been sent, whatever the answer will be.
    password = "";
    try {
      const state = await machineControl<AuthState>(
        machine.machineId,
        "unlockKeychain",
        [sent]
      );
      if (mine === attempt) {
        phase = { kind: "done", state };
      }
    } catch (error) {
      if (mine === attempt) {
        phase = {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const close = () => {
    dialogOpen = false;
  };

  const view = $derived(
    phase.kind === "working" || phase.kind === "done" ? "status" : "form"
  );
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <div class="relative flex flex-col">
      {#key view}
        <div
          class="flex flex-col gap-6"
          style:min-height={view === "status" ? `${held}px` : undefined}
          in:crossIn
          out:crossOut
        >
          {#if phase.kind === "working" || phase.kind === "done"}
            <MachineAuthStatus
              onclose={close}
              outcome={phase}
              said={SAID}
              working={{
                title: `Unlocking ${machine.hostname}…`,
                steps: [
                  "Unlocking the login keychain",
                  `Checking ${machine.hostname} can read its credentials`,
                ],
              }}
            />
          {:else}
            <Dialog.Header>
              <Dialog.Title class="flex items-center gap-2">
                <IconKey class="size-4 text-warning" />
                Unlock {machine.hostname}
              </Dialog.Title>
              <Dialog.Description>
                Its login keychain is locked, so Claude Code there cannot read
                its credentials. This is the macOS login password for that
                machine.
              </Dialog.Description>
            </Dialog.Header>

            <form class="flex flex-col gap-[var(--space-3)]" onsubmit={unlock}>
              <Input
                aria-describedby={phase.kind === "error"
                  ? "unlock-error"
                  : "unlock-note"}
                aria-invalid={phase.kind === "error" ? "true" : undefined}
                aria-label="Login password for {machine.hostname}"
                autocomplete="current-password"
                placeholder="Login password for {machine.hostname}"
                type="password"
                bind:value={password}
                {@attach (node) => {
                  if (phase.kind === "error") {
                    node.focus();
                  }
                }}
              />

              {#if phase.kind === "error"}
                <p class="text-label text-destructive" id="unlock-error">
                  {phase.message}
                </p>
              {:else}
                <p class="text-meta text-muted-foreground" id="unlock-note">
                  Sent over your tunnel to that machine, used once, and not
                  stored anywhere.
                </p>
              {/if}

              <div class="flex justify-end gap-[var(--space-2)]">
                <Button onclick={close} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={!password} type="submit">Unlock</Button>
              </div>
            </form>
          {/if}
        </div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>
