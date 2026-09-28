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
  import MachineAuthStatus from "./MachineAuthStatus.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  let {
    machine,
    open: dialogOpen = $bindable(false),
  }: { machine: Machine; open?: boolean } = $props();

  /**
   * Where the dialog is: the code form, the machine working on the code it
   * was sent, what it answered, or the form again with why it failed.
   */
  type Phase =
    | { kind: "code" }
    | { kind: "working" }
    | { kind: "done"; state: AuthState }
    | { kind: "error"; message: string };

  let phase = $state<Phase>({ kind: "code" });
  let url = $state<string | null>(null);
  let code = $state("");
  /**
   * Which submit an answer belongs to. The reader can close the dialog while
   * the machine is still working and open it again; the first call's answer
   * then lands on a dialog that has moved on, and is dropped.
   */
  let attempt = 0;
  /** The height the form's view stood at when sent, held while it works. */
  let held = $state(0);

  const SAID: Record<AuthState, { title: string; body: string }> = $derived({
    authenticated: {
      title: `${machine.hostname} is logged in`,
      body: `New sessions on ${machine.hostname} will use this login.`,
    },
    unauthenticated: {
      title: `${machine.hostname} is not logged in`,
      body: `${machine.hostname} saved the token, but still reports nobody logged in.`,
    },
    "unreadable-credentials": {
      title: `${machine.hostname} cannot read its login`,
      body: `${machine.hostname} saved the token, but cannot read its credentials.`,
    },
  });

  /**
   * Driven by `open` itself, not by `onOpenChange`.
   *
   * The dialog is opened by setting the bound value from a menu item, and a
   * bound write does not run the change callback — so the request for a link
   * never went out and the box sat on "Asking…" for good. The state is the
   * trigger; the callback is only the reader closing it. Everything from the
   * last time is dropped as it opens, before it is drawn.
   */
  let asked = false;
  $effect.pre(() => {
    if (!dialogOpen) {
      asked = false;
      return;
    }
    if (asked) {
      return;
    }
    asked = true;
    attempt += 1;
    phase = { kind: "code" };
    url = null;
    code = "";
    // biome-ignore lint/complexity/noVoid: fire-and-forget; `begin` reports through `phase`, not its promise
    void begin(attempt);
  });

  /** Asked for as the dialog opens, so the reader never waits on a blank box. */
  async function begin(mine: number) {
    try {
      const challenge = await machineControl<{ url: string }>(
        machine.machineId,
        "beginLogin",
        []
      );
      if (mine === attempt) {
        ({ url } = challenge);
      }
    } catch (error) {
      if (mine === attempt) {
        phase = { kind: "error", message: messageOf(error) };
      }
    }
  }

  async function finish(
    event: SubmitEvent & { currentTarget: HTMLFormElement }
  ) {
    event.preventDefault();
    if (!(code.trim() && url)) {
      return;
    }
    attempt += 1;
    const mine = attempt;
    // The form's parent is the view the status replaces.
    held = (event.currentTarget.parentElement as HTMLElement).offsetHeight;
    phase = { kind: "working" };
    try {
      const state = await machineControl<AuthState>(
        machine.machineId,
        "completeLogin",
        [code.trim()]
      );
      if (mine === attempt) {
        code = "";
        phase = { kind: "done", state };
      }
    } catch (error) {
      if (mine === attempt) {
        phase = { kind: "error", message: messageOf(error) };
      }
    }
  }

  const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  const close = () => {
    dialogOpen = false;
  };

  /** The form and its error are one view; waiting and answered are another. */
  const view = $derived(
    phase.kind === "working" || phase.kind === "done" ? "status" : "form"
  );
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <div class="relative flex flex-col">
      {#key view}
        <div
          class="flex flex-col gap-6"
          style:min-height={view === 'status' ? `${held}px` : undefined}
          in:crossIn
          out:crossOut
        >
          {#if phase.kind === 'working' || phase.kind === 'done'}
            <MachineAuthStatus
              onclose={close}
              outcome={phase}
              said={SAID}
              working={{
                title: `Logging in ${machine.hostname}…`,
                steps: [
                  'Exchanging the code',
                  `Checking ${machine.hostname} can use the new login`,
                ],
              }}
            />
          {:else}
            <Dialog.Header>
              <Dialog.Title class="flex items-center gap-2">
                <IconKey class="size-4" />
                Log in {machine.hostname}
              </Dialog.Title>
              <Dialog.Description>
                Authorise in your browser here, then paste the code back.
                Nothing needs to be typed on that machine.
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
              {:else if phase.kind === 'code'}
                <p class="text-label text-muted-foreground">
                  Asking {machine.hostname} for a login link…
                </p>
              {/if}

              <Input
                aria-describedby={phase.kind === 'error' ? 'login-error' : undefined}
                aria-invalid={phase.kind === 'error' ? 'true' : undefined}
                aria-label="Authorisation code"
                autocomplete="off"
                class="font-mono"
                disabled={!url}
                placeholder="Paste the code from that page"
                spellcheck="false"
                bind:value={code}
                {@attach (node) => {
                  if (phase.kind === 'error' && url) {
                    node.focus();
                  }
                }}
              />

              {#if phase.kind === 'error'}
                <p class="text-meta text-destructive" id="login-error">
                  {phase.message}
                </p>
              {/if}

              <div class="flex justify-end gap-[var(--space-2)]">
                <Button onclick={close} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={!(code.trim() && url)} type="submit">
                  Log in
                </Button>
              </div>
            </form>
          {/if}
        </div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>
