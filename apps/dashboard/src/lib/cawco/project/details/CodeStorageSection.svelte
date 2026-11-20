<script lang="ts">
  import {
    cardWords,
    moreWords,
    sectionWords,
  } from "@cawco/core/words/project-details";
  /**
   * Codebases and big files, the card's last section across both columns,
   * only for a project that has code, open like the others: its head and
   * one line, then Connected code (each codebase with its host, a link out,
   * nothing to change) beside Big file storage (Use defaults, or Custom
   * location, which opens an address, the sign-ins that can serve it, and
   * Save under itself; nothing changes until Save). Side by side from the
   * card's two columns, stacked under them.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconArrowUpRight,
    IconDatabase,
    IconFolderGit,
    IconGlobe,
    IconServerSquare,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { cardForms } from "./card-layout";
  import type {
    BigDraft,
    BigFiles,
    Codebase,
    Pending,
    Read,
    SignIn,
  } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import Section from "./Section.svelte";
  import SignInRows from "./SignInRows.svelte";

  let {
    codebases,
    bigFiles,
    signIns,
    pending,
    draft = $bindable({ open: false, address: "", signIn: null }),
    sunk = false,
    onsave,
    ondefaults,
    ontry,
  }: {
    codebases: Codebase[];
    bigFiles: Read<BigFiles>;
    signIns: SignIn[];
    pending?: Pending;
    draft?: BigDraft;
    sunk?: boolean;
    /** Save: the address and the sign-in for it. */
    onsave: (address: string, signIn: string) => void;
    ondefaults: () => void;
    ontry: () => void;
  } = $props();

  const kept = $derived(bigFiles.state === "read" ? bigFiles.value : null);
  const chosen = $derived(kept?.mode ?? null);
  /** Custom location's line: its address while it is the kept pick, what it does while it is being set, else none. */
  const customLine = $derived.by(() => {
    if (draft.open) {
      return moreWords.custom.line;
    }
    return kept?.mode === "custom" ? kept.address : undefined;
  });
  const id = $props.id();
  const forms = cardForms();
  /** In a column of its own: its parts stacked, big files' two options as tiles side by side. */
  const compact = $derived(forms().storage === "compact");
  const canSave = $derived(
    draft.address.trim() !== "" && draft.signIn !== null && !sunk
  );
</script>

<Section
  hue="var(--color-mark-2)"
  icon={IconServerSquare}
  key="storage"
  line={sectionWords.storage.line}
  name={sectionWords.storage.name}
>
  <div
    class={[
      "grid grid-cols-1 gap-x-space-7",
      compact
        ? "gap-y-space-3"
        : "gap-y-space-5 @min-details-card/card:grid-cols-2",
    ]}
    {id}
  >
    {#if codebases.length > 0}
      <section class="flex min-w-0 flex-col gap-space-3" data-section="code">
        <header class="flex flex-col gap-space-1">
          <SectionHeader
            hue="var(--color-mark-3)"
            icon={IconFolderGit}
            label={sectionWords.code.name}
            level={4}
          />
        </header>
        <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each codebases as codebase (codebase.url)}
            <li
              class="mark-line flex min-w-0 items-center gap-space-2 rounded-sm border border-border-hairline bg-surface-recess px-space-3 py-space-2"
            >
              <IconFolderGit
                aria-hidden="true"
                class="size-icon-md flex-none text-ink-muted"
              />
              <span
                class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                >{codebase.name}</span
              >
              <span class="flex-none type-meta text-ink-muted"
                >{codebase.host}</span
              >
              <Button
                href={codebase.url}
                icon={IconArrowUpRight}
                aria-label={moreWords.openOn(codebase.name, codebase.host)}
                rel="noreferrer"
                size="icon-xs"
                target="_blank"
                variant="ghost"
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="flex min-w-0 flex-col gap-space-3" data-section="big-files">
      <header class="flex flex-col gap-space-1">
        <SectionHeader
          hue="var(--color-mark-6)"
          icon={IconDatabase}
          label={sectionWords.bigFiles.name}
          level={4}
        />
        <p class="m-0 type-meta text-pretty text-ink-muted">
          {sectionWords.bigFiles.line}
        </p>
      </header>
      {#if bigFiles.state === "reading"}
        <Skeleton height="item" />
        <Skeleton height="item" />
      {:else if bigFiles.state === "failed"}
        <RowFault
          again={ontry}
          reason="{cardWords.couldntRead} {bigFiles.reason}"
        />
      {:else}
        <OptionGroup
          aria-label={sectionWords.bigFiles.name}
          bind:value={
            () => [draft.open ? "custom" : (chosen ?? "defaults")],
            (next) => {
              if (next[0] === "custom") {
                draft = { ...draft, open: true };
              } else if (next[0] === "defaults") {
                draft = { ...draft, open: false };
                if (chosen !== "defaults") {
                  ondefaults();
                }
              }
            }
          }
          disabled={sunk}
          glide
          layout={compact ? "tiles" : "list"}
          style={compact
            ? "--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: minmax(0, 1fr)"
            : undefined}
        >
          <OptionGroupItem title={moreWords.defaults.line} value="defaults">
            <OptionLine
              glyph={IconFolderGit}
              line={chosen === "defaults" && !draft.open
                ? moreWords.defaults.line
                : undefined}
              name={moreWords.defaults.name}
              tile={compact}
              waiting={pending?.value === "defaults" && !pending.refused}
            />
          </OptionGroupItem>
          <OptionGroupItem title={moreWords.custom.line} value="custom">
            <OptionLine
              glyph={IconGlobe}
              line={customLine}
              name={moreWords.custom.name}
              tile={compact}
              waiting={pending?.value === "custom" && !pending.refused}
            />
          </OptionGroupItem>
        </OptionGroup>
        {#if draft.open}
          <form
            class="flex flex-col gap-space-3 ps-c-details-option-text"
            onsubmit={(event) => {
              event.preventDefault();
              if (canSave && draft.signIn) {
                onsave(draft.address.trim(), draft.signIn);
              }
            }}
            transition:unfold
          >
            <label class="flex flex-col gap-space-1">
              <span class="type-meta font-medium text-ink-muted"
                >{moreWords.address}</span
              >
              <Input
                autocomplete="off"
                disabled={sunk}
                face="mono"
                placeholder="https://files.example.com/acme/hyucksfield.git/info/lfs"
                spellcheck="false"
                text="meta"
                bind:value={
                  () => draft.address,
                  (address) => {
                    draft = { ...draft, address: address ?? "" };
                  }
                }
              />
            </label>
            <div class="flex flex-col gap-space-1">
              <span
                class="type-meta font-medium text-ink-muted"
                id="{id}-signin">{moreWords.signInFor}</span
              >
              {#if signIns.length === 0}
                <p class="m-0 type-meta text-pretty text-ink-muted">
                  {moreWords.noSignIn}
                </p>
              {:else}
                <SignInRows
                  chosen={draft.signIn}
                  label={moreWords.signInFor}
                  onchoose={(signIn) => {
                    draft = { ...draft, signIn };
                  }}
                  {signIns}
                  {sunk}
                />
              {/if}
            </div>
            {#if pending?.value === "custom" && pending.refused}
              <RowFault
                again={() =>
                  draft.signIn && onsave(draft.address.trim(), draft.signIn)}
                reason={pending.refused}
              />
            {/if}
            <div class="flex justify-end">
              <Button
                disabled={!canSave}
                pending={pending?.value === "custom" && !pending.refused}
                size="sm"
                type="submit">{moreWords.save}</Button
              >
            </div>
          </form>
        {/if}
      {/if}
    </section>
  </div>
</Section>
