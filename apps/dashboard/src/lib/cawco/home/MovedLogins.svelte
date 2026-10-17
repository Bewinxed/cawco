<script lang="ts">
  /**
   * Logins moved into CawCo nobody has acknowledged yet, as one group of
   * Caw's panel (B1; macOS Notification Center's app group): a head led by
   * the group glyph (the accounts' own, in muted ink, as a section's head is
   * led: the entries wear the account tiles, so a tile on the head made it
   * read as one of them), how many moved and its ✕, which acknowledges them
   * all; one line saying what happened and what it means; then each login
   * as an entry in the text column with its own ✕ (MovedLogin), the head's
   * count falling with it.
   *
   * The logins still to sign in on some machine stand open: they are what
   * there is to do. The ones signed in everywhere fold behind one toggle
   * (the update's notes' fold, transitions-dev Accordion expand), so the
   * group never outgrows the panel with nothing to do in it: five open
   * entries and two asks were 696px against the panel's 560.
   */
  import type { MovedLogin as Moved } from "#lib/cawco/accounts/model.svelte.js";
  import { reflowsFrom, reread } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconAccounts, IconChevronDown } from "#lib/icons.js";
  import { plural } from "../updates/model";
  import MovedLogin from "./MovedLogin.svelte";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    moved,
    ondismiss,
    onchoose,
  }: {
    moved: Moved[];
    /** These logins were acknowledged. */
    ondismiss: (ids: string[]) => void;
    onchoose: () => void;
  } = $props();

  const heading = $derived(`${plural(moved.length, "login")} moved into CawCo`);
  /** Still to sign in on some machine: always shown. */
  const todo = $derived(moved.filter((one) => one.missing > 0));
  /** Signed in everywhere: folded behind the toggle. */
  const done = $derived(moved.filter((one) => one.missing === 0));
  let open = $state(false);

  /** The fold moved the rows after it: every `reflow` around reads them again. */
  function settled(event: TransitionEvent): void {
    if (
      event.target === event.currentTarget &&
      event.propertyName === "grid-template-rows"
    ) {
      reread(reflowsFrom((event.currentTarget as HTMLElement).parentElement));
    }
  }
</script>

{#snippet entry(one: Moved)}
  <li data-flip>
    <MovedLogin {onchoose} ondismiss={() => ondismiss([one.id])} {one} />
  </li>
{/snippet}

<div data-slot="group">
  <NoticeRow
    dismissLabel="Dismiss all {plural(moved.length, 'moved login')}"
    label={heading}
    ondismiss={() => ondismiss(moved.map((one) => one.id))}
  >
    {#snippet lead()}
      <!-- The group's glyph in the lead column, as a section head's is: 16px
           (`icon-md`) in muted ink, centred in the 28px column. -->
      <span data-slot="glyph" class="grid place-items-center text-ink-muted"
        ><IconAccounts aria-hidden="true" class="size-icon-md" /></span
      >
    {/snippet}
    <!-- The heading of the group: label type in strong ink, its explainer in
         muted meta; the entries under it read a step lower (MovedLogin). -->
    <h3
      data-slot="head"
      class="m-0 pe-(--x-room) type-label text-ink-strong"
    >
      {heading}
    </h3>
    <p data-slot="explainer" class="m-0 type-meta text-ink-muted">
      Found signed in on your machines and kept as fleet accounts; any session
      can use them now.
    </p>
  </NoticeRow>
  <!-- No indent: each entry is a row of the panel, its tile in the one lead
       column, its words in the one text column, its ✕ at the one trailing
       edge. The heading and its explainer stand apart from the entries by
       space as well as type: the head's own foot (`space-3`) and the first
       entry's (`space-1`), 15px, against the 8px between two entries. -->
  <div data-slot="entries" class="flex flex-col pb-space-2">
    {#if todo.length > 0}
      <ul data-slot="list" class="m-0 flex list-none flex-col p-0">
        {#each todo as one (one.id)}
          {@render entry(one)}
        {/each}
      </ul>
    {/if}
    {#if done.length > 0}
      <!-- The toggle in the text column, its chevron's ink on the trailing
           edge: it hangs past the edge by the kit's 1px transparent border,
           its inline-end padding (the xs size's 6px beside an icon) and the
           12px chevron's side bearing (its stroke ends at 19.75 of 24), so its
           box keeps its size. -->
      <!-- literal: 28px -->
      <div
        data-slot="more"
        class="flex justify-end ps-(--text-column) pe-space-3 coarse:pb-space-1"
        data-flip
        style:--hang="calc(-1 * (1px + 6px + 12px * 4.25 / 24))"
        style:--text-column="calc(var(--space-3) + 28px + var(--space-3))"
      >
        <!-- Open, it says so in its words and its flipped chevron, not in the
             kit ghost's expanded fill, which would stand hung past the
             trailing edge (UpdateCard's toggle, the same). The hover fill
             stays. -->
        <Button
          data-toggle
          aria-controls="moved-done"
          aria-expanded={open}
          class="me-(--hang) aria-expanded:bg-transparent hover:aria-expanded:bg-surface-hover"
          onclick={() => {
            open = !open;
          }}
          size="xs"
          variant="ghost"
        >
          <span
            >{open ? "Hide" : "Show"}
            {done.length}
            signed in everywhere</span
          >
          <IconChevronDown
            data-chev
            aria-hidden="true"
            class="transition-[transform] dur-panel ease-out group-aria-expanded/button:-scale-y-100 motion-reduce:transition-none"
            data-icon="inline-end"
          />
        </Button>
      </div>
      <!-- The fold (UpdateCard's notes' recipe): the grid row is the track,
           the inner box clips, fades and cross-blurs; shutting is quicker than
           opening; the chevron flips with it. -->
      <div
        data-slot="fold"
        class="group grid transition-[grid-template-rows] dur-exit ease-out data-open:dur-panel motion-reduce:transition-none"
        data-open={open || undefined}
        id="moved-done"
        inert={!open}
        ontransitionend={settled}
      >
        <div
          data-slot="fold-inner"
          class="min-h-0 overflow-hidden opacity-0 transition-[opacity,filter] dur-exit ease-out group-data-open:opacity-100 group-data-open:dur-panel motion-reduce:transition-[opacity] motion-reduce:dur-fade motion-reduce:ease-out motion-reduce:group-data-open:dur-panel"
        >
          <ul data-slot="list" class="m-0 flex list-none flex-col p-0">
            {#each done as one (one.id)}
              {@render entry(one)}
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* residual: foreign-dom */
  [data-slot="more"] :global([data-chev] path) {
    vector-effect: non-scaling-stroke;
  }
  /* residual: unmapped */
  [data-slot="fold"] {
    grid-template-rows: 0fr;
  }
  [data-slot="fold"][data-open] {
    grid-template-rows: 1fr;
  }
  [data-slot="fold-inner"] {
    filter: blur(var(--fold-blur));
  }
  [data-slot="fold"][data-open] > [data-slot="fold-inner"] {
    filter: blur(0);
  }
  @media (prefers-reduced-motion: reduce) {
    [data-slot="fold-inner"] {
      filter: none;
    }
  }
</style>
