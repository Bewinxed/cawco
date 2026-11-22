<script lang="ts">
  /**
   * Repository & Git, for a code project (its repository stands in the
   * card's head, HowItRuns `repoLink`): where its large files are kept, the view's one pick
   * (PickTiles; the custom server opening its address and key under it);
   * and where its finished code goes (WorkLands). Every
   * pick moves at the press (changes.ts `withAsked`); a refusal puts it
   * back and stands under its control (RowFault).
   */
  import {
    CONNECTION_SERVICES,
    connectionsWords,
  } from "@cawco/core/words/connections";
  import AddConnectionForm from "#lib/cawco/config/AddConnectionForm.svelte";
  import Choice from "#lib/cawco/config/Choice.svelte";
  import {
    type AppDraft,
    emptyApp,
    nameFor,
    type Service,
  } from "#lib/cawco/config/connection-form.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconFolderGit,
    IconKey,
    IconLargeFilesServer,
    IconPlus,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { StageSends } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import PickTiles from "./PickTiles.svelte";
  import { CARD_GROUP, GROUP_LABEL } from "./section-card";
  import {
    type FixtureConnection,
    LARGE_FILE_KEY_CONNECTIONS,
  } from "./tie-setup.fixture";
  import WorkLands from "./WorkLands.svelte";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
    opening = null,
  }: StageSends & {
    /** The custom large-file server's form standing open as it mounts: a states file reads it without the press. */
    opening?: "largeFiles" | null;
  } = $props();

  const uid = $props.id();
  const disabled = $derived(!record.hubReachable);

  /* ── Large files ────────────────────────────────────────────────── */

  /** The fleet's saved keys an LFS server signs in with (the stand-in's list, a key added here joining it). */
  let keys = $state<FixtureConnection[]>([...LARGE_FILE_KEY_CONNECTIONS]);

  /** The services a key signs in to, each offering only its key way (Connections' add form, as a large-file key needs it). */
  const KEY_SERVICES: Service[] = CONNECTION_SERVICES.flatMap((service) => {
    const ways = service.ways.filter((way) => way.auth === "bearer");
    return ways.length > 0 ? [{ ...service, ways }] : [];
  });
  /** Add key's form, open on the service it signs in to; null while closed. */
  let keyService = $state<Service | null>(null);
  let keyAccount = $state("");
  let keyAddress = $state("");
  let keyOrganization = $state("");
  let keySecret = $state("");
  let keyApp = $state<AppDraft>(emptyApp());
  let keyAddressProblem = $state<string | null>(null);

  function openAddKey() {
    keyService = KEY_SERVICES[0] ?? null;
    keyAccount = "";
    keyAddress = keyService?.url ?? "";
    keySecret = "";
    keyAddressProblem = null;
  }

  /** Saves the key as Connections' add form does, then picks it. */
  function saveKey(event: SubmitEvent) {
    event.preventDefault();
    const service = keyService;
    const account = keyAccount.trim();
    if (!(service && account && keySecret)) {
      return;
    }
    const id = nameFor(service.service, account);
    keys = [
      ...keys.filter((one) => one.id !== id),
      { id, name: connectionsWords.rowKey(service.label, account), account },
    ];
    lfsConnectionDraft = id;
    keyService = null;
  }

  /** The address being written: the pick moves to it at the press, the record once it is saved. */
  let declaring = $derived(opening === "largeFiles");
  let lfsAddressDraft = $derived(
    record.largeFiles.kind === "declared" ? record.largeFiles.address : ""
  );
  let lfsConnectionDraft = $derived(
    record.largeFiles.kind === "declared"
      ? record.largeFiles.connection
      : (keys[0]?.id ?? "")
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

{#snippet largeFilesGlyph(kind: "own" | "declared")}
  {#if kind === "own"}
    <IconFolderGit aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconLargeFilesServer
      aria-hidden="true"
      class="size-icon-md text-ink-muted"
    />
  {/if}
{/snippet}

<!-- Git LFS: its label over its one pick, never a heading without its control. -->
<div class={CARD_GROUP}>
  <p class={GROUP_LABEL}>{words.places.largeFilesHeading}</p>
  <PickTiles
    cols={2}
    {disabled}
    glyph={largeFilesGlyph}
    label={words.places.largeFilesGroupLabel}
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
    <!-- Its fields submit the empty form at its head (`form`), so Add key's
         own form opens among them without nesting a form in a form. -->
    <section
      aria-label={words.places.largeFilesDeclared.name}
      class={OPENED_FORM}
      transition:unfold
    >
      <form class="hidden" id="{uid}-lfs-form" onsubmit={saveLargeFiles}></form>
      <p class="m-0 type-label text-ink-strong">
        {words.places.largeFilesDeclared.name}
      </p>
      <Field id="{uid}-lfs-url" label={words.places.largeFilesAddress}>
        <Input
          id="{uid}-lfs-url"
          autocomplete="off"
          {disabled}
          face="mono"
          form="{uid}-lfs-form"
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
        <!-- The saved keys, then Add key as the last tile (the only one
             with none saved), opening Connections' add form in place. -->
        <div class="flex min-w-0 flex-wrap items-start gap-space-2">
          {#if keys.length > 0}
            <OptionGroup
              glide
              aria-labelledby="{uid}-lfs-key"
              bind:value={
                () => (lfsConnectionDraft ? [lfsConnectionDraft] : []),
                (next) => {
                  lfsConnectionDraft = next[0] ?? "";
                }
              }
              {disabled}
            >
              {#each keys as conn (conn.id)}
                <OptionGroupItem value={conn.id}>
                  <span
                    class="mark-line flex min-w-0 items-center gap-x-space-2"
                  >
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
          <button
            aria-expanded={keyService !== null}
            class={chipVariants({ variant: "option", class: "focus-inset" })}
            data-slot="add-key"
            {disabled}
            onclick={openAddKey}
            type="button"
          >
            <span
              class="mark-line flex min-w-0 items-center gap-x-space-2"
              data-box
            >
              <IconPlus
                aria-hidden="true"
                class="size-icon-sm flex-none text-ink-muted"
                data-box
              />
              <span>{words.places.addKey}</span>
            </span>
          </button>
        </div>
        {#if keyService}
          <div class="flex min-w-0 flex-col gap-space-2" transition:unfold>
            <Choice
              label={connectionsWords.signInTo}
              onchange={(next) => {
                keyService =
                  KEY_SERVICES.find((one) => one.service === next) ?? null;
                keyAddress = keyService?.url ?? "";
              }}
              options={KEY_SERVICES.map((one) => ({
                value: one.service,
                label: one.label,
              }))}
              value={keyService.service}
            />
            <AddConnectionForm
              callbackUrl=""
              class="mb-0"
              oncancel={() => {
                keyService = null;
              }}
              onsubmit={saveKey}
              onway={() => undefined}
              pending={false}
              problem={null}
              secretAskedAgain={false}
              service={keyService}
              way={keyService.ways[0] ?? null}
              bind:account={keyAccount}
              bind:address={keyAddress}
              bind:addressProblem={keyAddressProblem}
              bind:app={keyApp}
              bind:key={keySecret}
              bind:organization={keyOrganization}
            />
          </div>
        {/if}
      </div>
      {#if lfsDirty || declaring}
        <div class="flex justify-end gap-space-2">
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
                  : (keys[0]?.id ?? "");
            }}
            size="sm"
            type="button"
            variant="ghost"
          />
          <Button
            disabled={disabled ||
              lfsAddressDraft.trim().length === 0 ||
              lfsConnectionDraft.length === 0}
            form="{uid}-lfs-form"
            label={words.save}
            size="sm"
            type="submit"
          />
        </div>
      {/if}
    </section>
  {/if}
</div>

<div class={CARD_GROUP}>
  <p class={GROUP_LABEL}>{words.lands.groupLabel}</p>
  <WorkLands {onchange} {onretry} {pending} {record} {refused} />
</div>
