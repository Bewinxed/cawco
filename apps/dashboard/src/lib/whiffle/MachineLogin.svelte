<script lang="ts">
  import type { AuthState } from "@whiffle/core";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  /**
   * Logs a machine in from here.
   *
   * The machine opens no browser and shows no prompt: the daemon builds the
   * authorisation URL, the reader authorises in *their* browser wherever they
   * are, and pastes the code back. What lands on the machine is a token in
   * `~/.claude/.credentials.json` — the file Claude Code reads — so a Mac whose
   * login keychain is locked stops being a problem rather than being worked
   * around.
   */
  import { IconExternal, IconKey } from "$lib/icons";
  import { type Machine, machineControl } from "./client.svelte";
  import { dur } from "./motion/curves.svelte";

  let {
    machine,
    open: dialogOpen = $bindable(false),
  }: { machine: Machine; open?: boolean } = $props();

  let url = $state<string | null>(null);
  let code = $state("");
  let busy = $state(false);
  let failed = $state<string | null>(null);
  /** What the machine said once the login went through, shown in place. */
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
    authenticated: "is logged in",
    unauthenticated: "saved the token, but still reports nobody logged in",
    "unreadable-credentials":
      "saved the token, but cannot read its credentials",
  };

  /**
   * Driven by `open` itself, not by `onOpenChange`.
   *
   * The dialog is opened by setting the bound value from a menu item, and a
   * bound write does not run the change callback — so the request for a link
   * never went out and the box sat on "Asking…" for good. The state is the
   * trigger; the callback is only the reader closing it.
   */
  let asked = $state(false);
  $effect(() => {
    if (!dialogOpen) {
      asked = false;
      return;
    }
    if (asked) {
      return;
    }
    asked = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget; `begin` reports through `failed`/`busy` state, not its promise
    void begin();
  });

  /** Asked for as the dialog opens, so the reader never waits on a blank box. */
  async function begin() {
    busy = true;
    failed = null;
    try {
      const challenge = await machineControl<{ url: string }>(
        machine.machineId,
        "beginLogin",
        []
      );
      ({ url } = challenge);
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function finish(event: SubmitEvent) {
    event.preventDefault();
    if (!code.trim() || busy) {
      return;
    }
    busy = true;
    failed = null;
    try {
      const state = await machineControl<AuthState>(
        machine.machineId,
        "completeLogin",
        [code.trim()]
      );
      code = "";
      // The button's check and the machine's answer stand for --dur-hold,
      // then the dialog closes on its own.
      result = `${machine.hostname} ${SAID[state] ?? "is logged in"}.`;
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
    if (next) {
      return;
    }
    clearTimeout(closeTimer);
    url = null;
    code = '';
    failed = null;
    result = null;
  }}
  bind:open={dialogOpen}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <IconKey class="size-4" />
        Log in {machine.hostname}
      </Dialog.Title>
      <Dialog.Description>
        Authorise in your browser here, then paste the code back. Nothing needs
        to be typed on that machine.
      </Dialog.Description>
    </Dialog.Header>

    <form class="flex flex-col gap-[var(--space-4)]" onsubmit={finish}>
      {#if url}
        <a
          class="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-primary px-3 py-2 text-label
                 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <IconExternal class="size-4" />
          Open the authorisation page
        </a>
      {:else if !failed}
        <p class="text-label text-muted-foreground">
          Asking {machine.hostname} for a login link…
        </p>
      {/if}

      <Input
        aria-invalid={failed ? 'true' : undefined}
        aria-label="Authorisation code"
        autocomplete="off"
        class="font-mono"
        disabled={busy || !url || result !== null}
        placeholder="Paste the code from that page"
        spellcheck="false"
        bind:value={code}
      />

      {#if failed}
        <p class="text-meta text-destructive">{failed}</p>
      {:else if result}
        <p class="text-meta text-muted-foreground" role="status">{result}</p>
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
          disabled={!(code.trim() && url) && result === null}
          failed={failed !== null}
          label="Log in"
          pending={busy && url !== null}
          pendingLabel="Finishing…"
          type="submit"
        />
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
