<script lang="ts">
  import {
    cardWords,
    moreWords,
    sectionWords,
  } from "@cawco/core/words/project-details";
  /**
   * More code details, at the card's foot across both columns, only for a
   * project that has code: one disclosure row (the kit's collapsible) with
   * its name, its facts while closed (the connected codebase, where big
   * files are kept), and a chevron that turns as it opens. Open, under its
   * row in place: Connected code (each codebase with its host, a link out,
   * nothing to change) beside Big file storage (Use defaults, or Custom
   * location, which opens an address, the sign-ins that can serve it, and
   * Save under itself; nothing changes until Save). Side by side from the
   * card's two columns, stacked under them. It opens by itself when the hub
   * refused a change inside it.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconArrowUpRight,
    IconChevronDown,
    IconDatabase,
    IconFolderGit,
    IconGlobe,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type {
    BigDraft,
    BigFiles,
    Codebase,
    Pending,
    Read,
    SignIn,
  } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import SignInRows from "./SignInRows.svelte";

  let {
    open = $bindable(false),
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
    /** It stands open under its row. */
    open?: boolean;
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
  /** Its facts while closed: the codebases' names, and where big files are kept. */
  const summary = $derived(
    [
      codebases.map((codebase) => codebase.name).join(", "),
      kept?.mode === "custom" ? moreWords.bigCustom : moreWords.bigDefaults,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  const canSave = $derived(
    draft.address.trim() !== "" && draft.signIn !== null && !sunk
  );
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger class="group w-full">
    {#snippet child({ props })}
      <button
        {...props}
        class="mark-line press-tint focus-inset flex w-full min-w-0 items-center gap-space-2 rounded-sm px-space-2 py-space-2 text-start can-hover:hover:bg-surface-hover"
        type="button"
      >
        <IconFolderGit
          aria-hidden="true"
          class="size-icon-md flex-none text-ink-muted"
        />
        <span class="flex-none type-label font-medium text-ink-strong"
          >{sectionWords.more.name}</span
        >
        <!-- The closed facts, only while closed: open, the same facts
             stand laid out under the row. The span keeps its room, so the
             chevron never moves. -->
        <span
          class={[
            "min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted transition-opacity duration-(--duration-control) ease-out",
            open && "opacity-0",
          ]}
          aria-hidden={open || undefined}
          title={open ? undefined : summary}>{summary}</span
        >
        <IconChevronDown
          aria-hidden="true"
          class={[
            "size-icon-sm flex-none text-ink-muted transition-transform duration-(--duration-control) ease-out",
            open && "rotate-180",
          ]}
        />
      </button>
    {/snippet}
  </Collapsible.Trigger>
  <Collapsible.Content reveal fade>
    <div
      class="grid grid-cols-1 gap-x-space-7 gap-y-space-5 px-space-2 pt-space-3 @min-details-card/card:grid-cols-2"
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
            <p class="m-0 type-meta text-pretty text-ink-muted">
              {sectionWords.code.line}
            </p>
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

      <section
        class="flex min-w-0 flex-col gap-space-3"
        data-section="big-files"
      >
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
            layout="list"
          >
            <OptionGroupItem title={moreWords.defaults.line} value="defaults">
              <OptionLine
                glyph={IconFolderGit}
                line={chosen === "defaults" && !draft.open
                  ? moreWords.defaults.line
                  : undefined}
                name={moreWords.defaults.name}
                waiting={pending?.value === "defaults" && !pending.refused}
              />
            </OptionGroupItem>
            <OptionGroupItem title={moreWords.custom.line} value="custom">
              <OptionLine
                glyph={IconGlobe}
                line={customLine}
                name={moreWords.custom.name}
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
  </Collapsible.Content>
</Collapsible.Root>
