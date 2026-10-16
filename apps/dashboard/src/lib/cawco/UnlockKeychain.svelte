<script lang="ts">
  import type { AuthState } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
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
   * It opens under the machine's row, in the page (DESIGN.md, The Open Page
   * Rule): nothing elsewhere breaks while the password is typed, so nothing
   * else is held. Cancel or Escape puts it away.
   *
   * The password is sent, used, and dropped. It is not stored here, not kept in
   * the store, and not written anywhere on the way.
   */
  import { IconKey } from "#lib/icons.js";
  import { didntAnswer, type Machine, machineControl } from "./client.svelte";
  import MachineAuthStatus from "./MachineAuthStatus.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";
  import { unfold } from "./motion/fold.svelte";

  let {
    machine,
    open = $bindable(false),
  }: { machine: Machine; open?: boolean } = $props();

  /**
   * Where it is: the password form, the machine unlocking and checking,
   * what it answered, or the form again with why it failed.
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
   * put it away and opened it again is dropped.
   */
  let attempt = 0;
  /** The height the form's view stood at when sent, held while it works. */
  let held = $state(0);
  const id = $props.id();

  const SAID: Record<AuthState, { title: string; body: string }> = $derived({
    authenticated: {
      title: `${machine.hostname} is unlocked`,
      body: `New sessions on ${machine.hostname} can read its accounts' logins again.`,
    },
    unauthenticated: {
      title: `No account is signed in on ${machine.hostname}`,
      body: `${machine.hostname} unlocked, but no Claude account is signed in there. Add one in Configure → Accounts and sign it in there.`,
    },
    "unreadable-credentials": {
      title: `${machine.hostname} cannot read its logins`,
      body: `${machine.hostname} unlocked, but its accounts' logins still cannot be read.`,
    },
  });

  // Each opening starts from the form: the last answer is dropped.
  let shown = false;
  $effect.pre(() => {
    if (!open) {
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
      const read = await machineControl<AuthState>(
        machine.machineId,
        "unlockKeychain",
        [sent]
      );
      if (mine === attempt) {
        switch (read.kind) {
          case "answered":
            phase = { kind: "done", state: read.value };
            break;
          case "unanswered":
            phase = {
              kind: "error",
              message: didntAnswer(
                machine.machineId,
                read,
                "whether the keychain unlocked is not known"
              ),
            };
            break;
          default: {
            const unhandled: never = read;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      }
    } catch (error) {
      if (mine === attempt) {
        phase = {
          kind: "error",
          message: failureWords(error),
        };
      }
    }
  }

  const close = () => {
    open = false;
  };

  /** In view as it opens, and Escape inside it puts it away. */
  function arrive(node: HTMLElement) {
    const frame = requestAnimationFrame(() =>
      node.scrollIntoView({ block: "nearest" })
    );
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", onEscape);
    };
  }

  const view = $derived(
    phase.kind === "working" || phase.kind === "done" ? "status" : "form"
  );
</script>

{#if open}
  <section
    aria-labelledby="{id}-title"
    class="unlock"
    transition:unfold
    {@attach arrive}
  >
    <div class="tile">
      {#key view}
        <div
          class="flex flex-col gap-[var(--space-3)]"
          style:min-height={phase.kind === "working" ? `${held}px` : undefined}
          in:crossIn
          out:crossOut
        >
          {#if phase.kind === "working" || phase.kind === "done"}
            <MachineAuthStatus
              onclose={close}
              outcome={phase}
              said={SAID}
              titleId="{id}-title"
              working={{
                title: `Unlocking ${machine.hostname}…`,
                step: `Unlocking the login keychain and checking ${machine.hostname} can read its credentials`,
              }}
            />
          {:else}
            <div class="flex flex-col gap-[var(--space-1)]">
              <p class="title mark-line" id="{id}-title">
                <IconKey class="size-4 text-warning" />
                <span>Unlock {machine.hostname}</span>
              </p>
              <p class="body">
                Its login keychain is locked, so Claude Code there cannot read
                its credentials. This is the macOS login password for that
                machine.
              </p>
            </div>

            <form class="flex flex-col gap-[var(--space-2)]" onsubmit={unlock}>
              <Input
                aria-describedby={phase.kind === "error"
                  ? `${id}-error`
                  : `${id}-note`}
                aria-invalid={phase.kind === "error" ? "true" : undefined}
                aria-label="Login password for {machine.hostname}"
                autocomplete="current-password"
                placeholder="Login password for {machine.hostname}"
                type="password"
                bind:value={password}
                {@attach (node) => {
                  requestAnimationFrame(() => node.focus());
                }}
              />

              {#if phase.kind === "error"}
                <p class="fail" id="{id}-error" role="alert">
                  {phase.message}
                </p>
              {:else}
                <p class="body" id="{id}-note">
                  Sent over your tunnel to that machine, used once, and not
                  stored anywhere.
                </p>
              {/if}

              <div class="flex justify-end gap-[var(--space-2)]">
                <Button onclick={close} size="sm" type="button" variant="ghost">
                  Cancel
                </Button>
                <Button disabled={!password} size="sm" type="submit">
                  Unlock
                </Button>
              </div>
            </form>
          {/if}
        </div>
      {/key}
    </div>
  </section>
{/if}

<style>
  /* Under the machine's row, inside the list's edges: the in-page tile
     (AskHere's), the rest of the list live around it. */
  .unlock {
    min-inline-size: 0;
    padding: var(--space-1) var(--space-2);
  }
  .tile {
    position: relative;
    display: grid;
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-raised);
  }
  .title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .body {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .fail {
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
