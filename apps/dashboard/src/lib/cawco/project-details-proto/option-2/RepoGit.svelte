<script lang="ts">
  /**
   * Repository & Git, for a code project: its linked repositories as a
   * list (RowList `divided`), each by its slug in the code face, opening on
   * its host; where its large files are kept, the view's one pick
   * (PickChips; the custom server opening its address and key under it);
   * and where its finished code goes (WorkLands). Every
   * pick moves at the press (changes.ts `withAsked`); a refusal puts it
   * back and stands under its control (RowFault).
   */
  import Field from "#lib/cawco/config/Field.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconExternalLinear, IconGitRepo, IconKey } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { HrefOf, StageSends } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import PickChips from "./PickChips.svelte";
  import { CARD_GROUP, GROUP_LABEL } from "./section-card";
  import { LARGE_FILE_KEY_CONNECTIONS } from "./tie-setup.fixture";
  import WorkLands from "./WorkLands.svelte";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
    hrefOf,
    opening = null,
  }: StageSends & {
    hrefOf: HrefOf;
    /** The custom large-file server's form standing open as it mounts: a states file reads it without the press. */
    opening?: "largeFiles" | null;
  } = $props();

  const uid = $props.id();
  const disabled = $derived(!record.hubReachable);

  /* ── Large files ────────────────────────────────────────────────── */

  /** The address being written: the pick moves to it at the press, the record once it is saved. */
  let declaring = $derived(opening === "largeFiles");
  let lfsAddressDraft = $derived(
    record.largeFiles.kind === "declared" ? record.largeFiles.address : ""
  );
  let lfsConnectionDraft = $derived(
    record.largeFiles.kind === "declared"
      ? record.largeFiles.connection
      : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "")
  );
  const largeFilesShown = $derived(
    declaring ? "declared" : record.largeFiles.kind
  );
  const lfsDirty = $derived(
    record.largeFiles.kind !== "declared" ||
      lfsAddressDraft.trim() !== record.largeFiles.address ||
      lfsConnectionDraft !== record.largeFiles.connection
  );

  function pickLargeFiles(kind: "own" | "declared" | null) {
    if (kind === "own") {
      declaring = false;
      if (record.largeFiles.kind !== "own") {
        onchange({ key: "largeFiles", value: { kind: "own" } });
      }
    } else if (kind === "declared" && record.largeFiles.kind !== "declared") {
      declaring = true;
    }
  }

  function saveLargeFiles(event: SubmitEvent) {
    event.preventDefault();
    const address = lfsAddressDraft.trim();
    if (disabled || !(address && lfsConnectionDraft)) {
      return;
    }
    declaring = false;
    onchange({
      key: "largeFiles",
      value: { kind: "declared", address, connection: lfsConnectionDraft },
    });
  }

  /** The large-file choices, each by its words. */
  const LARGE_FILES = [
    { id: "own" as const, ...words.places.largeFilesOwn },
    { id: "declared" as const, ...words.places.largeFilesDeclared },
  ];
</script>

{#if record.repos.length > 0}
  <div class={CARD_GROUP}>
    <RowList divided label={words.places.repositories}>
      {#each record.repos as repo (`${repo.host}/${repo.owner}/${repo.name}`)}
        <SectionRow icon={IconGitRepo} mono name="{repo.owner}/{repo.name}">
          {#snippet trailing()}
            <Button
              aria-label="{repo.owner}/{repo.name}"
              href={repo.url}
              icon={IconExternalLinear}
              rel="noreferrer"
              size="icon-xs"
              target="_blank"
              tone="quiet"
              variant="ghost"
            />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  </div>
{/if}

<!-- Git LFS: its label over its one pick, never a heading without its control. -->
<div class={CARD_GROUP}>
  <p class={GROUP_LABEL} id="{uid}-lfs">{words.places.largeFilesHeading}</p>
  <PickChips
    {disabled}
    labelledby="{uid}-lfs"
    onpick={pickLargeFiles}
    options={LARGE_FILES}
    value={largeFilesShown}
  />
  <RowFault
    again={() => onretry("largeFiles")}
    againLabel={words.retryChange}
    reason={refused.largeFiles}
  />

  {#if largeFilesShown === "declared"}
    <form
      aria-label={words.places.largeFilesDeclared.name}
      class={OPENED_FORM}
      onsubmit={saveLargeFiles}
      transition:unfold
    >
      <p class="m-0 type-label text-ink-strong">
        {words.places.largeFilesDeclared.name}
      </p>
      <Field id="{uid}-lfs-url" label={words.places.largeFilesAddress}>
        <Input
          id="{uid}-lfs-url"
          autocomplete="off"
          {disabled}
          face="mono"
          placeholder={words.places.largeFilesAddressPlaceholder}
          spellcheck="false"
          type="url"
          bind:value={lfsAddressDraft}
        />
      </Field>
      <div class={FORM_FIELD}>
        <p class={FORM_LABEL} id="{uid}-lfs-key">
          {words.places.largeFilesKey}
        </p>
        {#if LARGE_FILE_KEY_CONNECTIONS.length === 0}
          <RowFault
            goTo={{
              href: hrefOf("connections"),
              label: words.tasks.openConnections,
            }}
            reason={words.places.largeFilesNoKey}
          />
        {:else}
          <OptionGroup
            glide="mark"
            aria-labelledby="{uid}-lfs-key"
            bind:value={
              () => (lfsConnectionDraft ? [lfsConnectionDraft] : []),
              (next) => {
                lfsConnectionDraft = next[0] ?? "";
              }
            }
            {disabled}
          >
            {#each LARGE_FILE_KEY_CONNECTIONS as conn (conn.id)}
              <OptionGroupItem value={conn.id}>
                <span class="mark-line flex min-w-0 items-center gap-x-space-2">
                  <IconKey
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-ink-muted"
                  />
                  <span>{conn.name}</span>
                </span>
              </OptionGroupItem>
            {/each}
          </OptionGroup>
        {/if}
      </div>
      {#if lfsDirty || declaring}
        <div class="flex flex-wrap items-center gap-space-2">
          <Button
            disabled={disabled ||
              lfsAddressDraft.trim().length === 0 ||
              lfsConnectionDraft.length === 0}
            label={words.save}
            size="sm"
            type="submit"
            variant="outline"
          />
          <Button
            label={words.cancel}
            onclick={() => {
              declaring = false;
              lfsAddressDraft =
                record.largeFiles.kind === "declared"
                  ? record.largeFiles.address
                  : "";
              lfsConnectionDraft =
                record.largeFiles.kind === "declared"
                  ? record.largeFiles.connection
                  : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "");
            }}
            size="sm"
            variant="ghost"
          />
        </div>
      {/if}
    </form>
  {/if}
</div>

<div class={CARD_GROUP}>
  <p class={GROUP_LABEL} id="{uid}-lands">{words.lands.groupLabel}</p>
  <WorkLands
    labelledby="{uid}-lands"
    {onchange}
    {onretry}
    {pending}
    {record}
    {refused}
  />
</div>
