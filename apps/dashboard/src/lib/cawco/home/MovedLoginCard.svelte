<script lang="ts">
  /**
   * A machine's own Claude Code login, moved into CawCo, left on Home until
   * it is dismissed: whose login, from which machine, and where the account
   * still needs signing in, with Configure → Accounts one click away. The
   * card recipe is UpdateCard's.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { type MovedLogin, machineList } from "../accounts/model.svelte";

  let { moved, ondismiss }: { moved: MovedLogin; ondismiss: () => void } =
    $props();

  const email = $derived(moved.account.email ?? "the account");
</script>

<article aria-label="Login moved into CawCo" class="card" data-flip="box">
  <p class="line">
    Moved {email}’s login from {moved.from}’s Claude Code into CawCo.
    {#if moved.missing.length > 0}
      <a class="link" href="/config/accounts"
        >Sign it in on {machineList(moved.missing)} from Configure → Accounts to
        use it there.</a
      >
    {/if}
  </p>
  <div class="actions">
    <Button onclick={ondismiss} size="sm" variant="secondary">Dismiss</Button>
  </div>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .line {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-row);
    overflow-wrap: anywhere;
  }
  .link {
    border-radius: var(--radius-xs);
    color: var(--link-ink);
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .link:hover {
      color: var(--link-hover);
    }
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
</style>
