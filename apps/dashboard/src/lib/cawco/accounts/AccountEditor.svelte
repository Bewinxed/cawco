<script lang="ts">
  /**
   * One account: its nickname (empty, it goes by its email), its colour,
   * where it is signed in, and its limits: whether a strategy may fall back
   * to it, and the share of its week past which no new work is placed on
   * it. Save writes what changed; Remove signs it out everywhere first, and
   * a refusal (a session still on it, a machine away) is the hub's sentence.
   */
  import type { Account } from "@cawco/core";
  import { untrack } from "svelte";
  import { deleteAccount, patchAccount } from "#lib/cawco/client.svelte.js";
  import { keepDraft } from "#lib/cawco/config/drafts.svelte.js";
  import EditorFrame from "#lib/cawco/config/EditorFrame.svelte";
  import EditorSection from "#lib/cawco/config/EditorSection.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import TitleInput from "#lib/cawco/config/TitleInput.svelte";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconKey, IconPalette, IconUsage } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import AccountName from "./AccountName.svelte";
  import AccountTile from "./AccountTile.svelte";
  import { hueVar, nameOf, planOf } from "./model.svelte";
  import SigninChips from "./SigninChips.svelte";
  import Swatches from "./Swatches.svelte";

  let { account }: { account: Account } = $props();

  interface Fields {
    hue: Account["hue"];
    neverBackup: boolean;
    nickname: string;
    /** The field's text: empty is no reserve. */
    reserve: string;
  }
  const saved = (): Fields => ({
    nickname: account.label ?? "",
    hue: account.hue,
    neverBackup: account.neverBackup,
    reserve: account.reservePct === null ? "" : String(account.reservePct),
  });
  let fields = $state<Fields>(untrack(saved));
  const dirty = $derived(JSON.stringify(fields) !== JSON.stringify(saved()));
  const kept = keepDraft(
    page.url.pathname,
    () => (dirty ? $state.snapshot(fields) : null),
    (stored: Fields) => {
      fields = stored;
    }
  );

  /** The reserve as the hub takes it: a whole percentage, or null. */
  const reservePct = $derived.by(() => {
    const text = fields.reserve.trim();
    if (text === "") {
      return null;
    }
    const n = Number(text);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : undefined;
  });

  const preview = $derived({
    id: account.id,
    email: account.email,
    label: fields.nickname.trim() || null,
  });

  let saving = $state(false);
  let deleting = $state(false);
  let refused = $state<string | undefined>(undefined);

  async function save() {
    if (saving || reservePct === undefined) {
      return;
    }
    saving = true;
    refused = undefined;
    try {
      await patchAccount(account.id, {
        label: fields.nickname.trim() || null,
        hue: fields.hue,
        neverBackup: fields.neverBackup,
        reservePct,
      });
      kept.drop();
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }

  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/accounts");
  }

  async function askRemove() {
    await confirm({
      title: `Remove ${nameOf(account)}?`,
      body: "Each machine signed in to it signs it out with Claude Code's own logout and forgets it. New sessions stop being placed on it.",
      confirmLabel: "Remove account",
      destructive: true,
      pendingLabel: "Removing…",
      run: async () => {
        deleting = true;
        try {
          await deleteAccount(account.id);
          kept.drop();
          await goto("/config/accounts");
        } finally {
          deleting = false;
        }
      },
    });
  }
</script>

<EditorFrame
  canSave={dirty && reservePct !== undefined}
  deleteLabel="Remove account"
  {deleting}
  failed={refused !== undefined}
  oncancel={cancel}
  ondelete={askRemove}
  onsubmit={save}
  saveLabel="Save changes"
  {saving}
  title={nameOf(account)}
>
  {#snippet header()}
    <TitleInput
      label="Nickname"
      placeholder={account.email ?? "Nickname"}
      bind:value={fields.nickname}
    />
    <p class="note">
      {planOf(account)}
      ·
      {fields.nickname.trim()
        ? `Nicknamed; its email is ${account.email ?? "not known until it signs in"}`
        : "Goes by its email. Type a nickname for a shorter name."}
    </p>
    {#if refused}
      <p class="problem" role="alert" in:appear>{refused}</p>
    {/if}
  {/snippet}

  <EditorSection hue={hueVar(fields.hue)} icon={IconPalette} label="Looks">
    <div class="preview">
      <AccountTile hue={fields.hue} size={28} />
      <AccountName account={preview} />
    </div>
    <Swatches bind:value={fields.hue} />
  </EditorSection>

  <EditorSection hue="var(--hue-cyan-500)" icon={IconKey} label="Sign-ins">
    <p class="note">
      Each machine signs it in with Claude Code's own login. A hollow chip signs
      it in there.
    </p>
    <NsPopoverGroup><SigninChips {account} /></NsPopoverGroup>
  </EditorSection>

  <EditorSection hue="var(--hue-amber-500)" icon={IconUsage} label="Limits">
    <SwitchField
      hint="Only a pick or a pin starts sessions on it; no strategy falls back to it."
      id="never-backup"
      label="Never use as a backup"
      bind:checked={fields.neverBackup}
    />
    <div class="reserve">
      <label for="reserve">Stop placing new work past</label>
      <Input
        aria-describedby="reserve-line"
        aria-invalid={reservePct === undefined ? "true" : undefined}
        class="field"
        id="reserve"
        inputmode="numeric"
        placeholder="—"
        bind:value={fields.reserve}
      />
      <span>% of the week</span>
    </div>
    <p
      class={["note", reservePct === undefined && "problem"]}
      id="reserve-line"
    >
      {reservePct === undefined
        ? "A reserve is a whole number from 0 to 100. Empty it for none."
        : "Empty: no reserve. Sessions already on it keep running past it."}
    </p>
  </EditorSection>
</EditorFrame>

<style>
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    align-self: flex-start;
    min-width: 0;
    max-width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }
  .reserve {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding-block-start: var(--space-2);
    color: var(--ink-row);
  }
  .reserve :global(.field) {
    flex: none;
    width: 64px;
    height: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
