<script lang="ts">
  /**
   * One account: its tile and nickname (empty, it goes by its email), where
   * it is signed in, its colour, and, where CawCo reads its provider's
   * limits, whether a strategy may fall back to it and the share of its
   * week past which no new work is placed on it. Save writes what changed;
   * Remove signs it out everywhere first, and a refusal (a session still on
   * it, a machine away) is the hub's sentence.
   */
  import { type Account, accountsWords as words } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    cawco,
    deleteAccount,
    patchAccount,
  } from "#lib/cawco/client.svelte.js";
  import { keepDraft } from "#lib/cawco/config/drafts.svelte.js";
  import { EditorQuestion } from "#lib/cawco/config/EditorFooter.svelte";
  import EditorFrame from "#lib/cawco/config/EditorFrame.svelte";
  import EditorSection from "#lib/cawco/config/EditorSection.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import TitleInput from "#lib/cawco/config/TitleInput.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconPalette, IconServer, IconUsage } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import AccountMachines from "./AccountMachines.svelte";
  import {
    harnessWords,
    hueVar,
    machineName,
    machinesFor,
    nameOf,
    providerLimits,
    signinState,
  } from "./model.svelte";
  import ProviderMark from "./ProviderMark.svelte";
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
  const limits = $derived(providerLimits(account.provider));

  /** The reserve as the hub takes it: a whole percentage, or null. */
  const reservePct = $derived.by(() => {
    const text = fields.reserve.trim();
    if (text === "") {
      return null;
    }
    const n = Number(text);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : undefined;
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
        ...(limits ? { neverBackup: fields.neverBackup, reservePct } : {}),
      });
      kept.drop();
    } catch (error) {
      refused = failureWords(error);
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
    // The machines signed in to it are what the removal reaches: named.
    const signins = cawco.accounts?.signins ?? [];
    const on = machinesFor(account.provider)
      .filter(
        (machine) =>
          signinState(signins, account.id, machine.machineId) === "signed-in"
      )
      .map(machineName);
    await question.ask({
      title: words.editor.removeTitle(nameOf(account)),
      body: words.editor.removeBody(on, harnessWords(account.provider)),
      confirmLabel: words.editor.remove,
      destructive: true,
      pendingLabel: words.editor.removing,
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

  /** Remove asks in this editor's own footer. */
  const question = new EditorQuestion();
</script>

<EditorFrame
  canSave={dirty && reservePct !== undefined}
  deleteLabel={words.editor.remove}
  {deleting}
  failed={refused !== undefined}
  oncancel={cancel}
  ondelete={askRemove}
  onsubmit={save}
  {question}
  saveLabel={words.editor.save}
  {saving}
  title={nameOf(account)}
>
  {#snippet tile()}
    <ProviderMark provider={account.provider} />
  {/snippet}
  {#snippet header()}
    <TitleInput
      label={words.editor.nickname}
      placeholder={account.label ? words.editor.nickname : nameOf(account)}
      bind:value={fields.nickname}
    />
    {#if refused}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {refused}
      </p>
    {/if}
  {/snippet}

  <EditorSection
    hue="var(--hue-cyan-500)"
    icon={IconServer}
    label={words.editor.machines}
  >
    <AccountMachines {account} />
  </EditorSection>

  <EditorSection
    hue={hueVar(fields.hue)}
    icon={IconPalette}
    label={words.editor.looks}
  >
    <Swatches bind:value={fields.hue} />
  </EditorSection>

  {#if limits}
    <EditorSection
      hue="var(--hue-amber-500)"
      icon={IconUsage}
      label={words.editor.limits}
    >
      <SwitchField
        id="never-backup"
        label={words.editor.neverBackup}
        bind:checked={fields.neverBackup}
      />
      <div
        class="flex flex-wrap items-center gap-space-3 pt-space-2 text-ink-row"
      >
        <label for="reserve">{words.editor.reserve}</label>
        <!-- The figure and its unit hold together on one line. -->
        <!-- literal: 64px -->
        <span
          class="inline-flex flex-none items-center gap-space-3 whitespace-nowrap"
          style:--field-w="64px"
        >
          <Input
            data-field
            aria-describedby={reservePct === undefined
              ? "reserve-line"
              : undefined}
            aria-invalid={reservePct === undefined ? "true" : undefined}
            class="num h-c-btn-h-sm w-(--field-w) flex-none px-space-2 text-center"
            id="reserve"
            inputmode="numeric"
            bind:value={fields.reserve}
          />
          <span>{words.editor.reserveUnit}</span>
        </span>
      </div>
      {#if reservePct === undefined}
        <p class="type-meta text-status-fail-ink" id="reserve-line" in:appear>
          {words.editor.reserveInvalid}
        </p>
      {/if}
    </EditorSection>
  {/if}
</EditorFrame>
