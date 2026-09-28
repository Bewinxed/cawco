<script lang="ts">
  import type { AuthState } from "@whiffle/core";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
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
  import { IconKey } from "$lib/icons";
  import { type Machine, machineControl } from "./client.svelte";
  import { dur } from "./motion/curves.svelte";

  let {
    machine,
    open: dialogOpen = $bindable(false),
  }: { machine: Machine; open?: boolean } = $props();

  let password = $state("");
  let busy = $state(false);
  let failed = $state<string | null>(null);
  /** What the machine said once it unlocked, shown in place of the note. */
  let result = $state<string | null>(null);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(closeTimer));
  // A close by the bound value runs no `onOpenChange`, so the last answer is
  // dropped as the dialog opens again, before it is drawn.
  $effect.pre(() => {
    if (dialogOpen) {
      result = null;
    }
  });

  const SAID: Record<string, string> = {
    authenticated: "is logged in again",
    unauthenticated: "unlocked, but nobody has logged in there yet",
    "unreadable-credentials":
      "unlocked, but its credentials still cannot be read",
  };

  async function unlock(event: SubmitEvent) {
    event.preventDefault();
    if (!password || busy) {
      return;
    }
    busy = true;
    failed = null;
    try {
      const state = await machineControl<AuthState>(
        machine.machineId,
        "unlockKeychain",
        [password]
      );
      // Cleared the moment it has been used, whatever the answer was.
      password = "";
      // The button's check and the machine's answer stand for --dur-hold,
      // then the dialog closes on its own.
      result = `${machine.hostname} ${SAID[state] ?? "unlocked"}.`;
      closeTimer = setTimeout(() => {
        dialogOpen = false;
      }, dur("--dur-hold"));
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root
  onOpenChange={(next) => {
    if (!next) {
      clearTimeout(closeTimer);
      password = '';
      failed = null;
      result = null;
    }
  }}
  bind:open={dialogOpen}
>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <IconKey class="size-4 text-warning" />
        Unlock {machine.hostname}
      </Dialog.Title>
      <Dialog.Description>
        Its login keychain is locked, so Claude Code there cannot read its
        credentials. This is the macOS login password for that machine.
      </Dialog.Description>
    </Dialog.Header>

    <form class="flex flex-col gap-[var(--space-3)]" onsubmit={unlock}>
      <Input
        aria-describedby={failed ? 'unlock-error' : 'unlock-note'}
        aria-invalid={failed ? 'true' : undefined}
        aria-label="Login password for {machine.hostname}"
        autocomplete="current-password"
        disabled={busy || result !== null}
        placeholder="Login password for {machine.hostname}"
        type="password"
        bind:value={password}
      />

      {#if failed}
        <p class="text-label text-destructive" id="unlock-error">{failed}</p>
      {:else if result}
        <p
          class="text-meta text-muted-foreground"
          id="unlock-note"
          role="status"
        >
          {result}
        </p>
      {:else}
        <p class="text-meta text-muted-foreground" id="unlock-note">
          Sent over your tunnel to that machine, used once, and not stored
          anywhere.
        </p>
      {/if}

      <div class="flex justify-end gap-[var(--space-2)]">
        <Button
          disabled={busy}
          onclick={() => {
            dialogOpen = false;
          }}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={!password && result === null}
          failed={failed !== null}
          label="Unlock"
          pending={busy}
          pendingLabel="Unlocking…"
          type="submit"
        />
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
