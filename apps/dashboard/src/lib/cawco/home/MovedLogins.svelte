<script lang="ts">
  /**
   * Logins moved into CawCo nobody has acknowledged yet, as one group of
   * Caw's panel (B1; macOS Notification Center's app group): a head with the
   * first account's tile, how many moved and its ✕, which acknowledges them
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
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import type { MovedLogin as Moved } from "#lib/cawco/accounts/model.svelte.js";
  import { reflowsFrom, reread } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown } from "#lib/icons.js";
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

  const first = $derived(moved[0]);
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

{#snippet entry(
  one: Moved
)}
  <li data-flip>
    <MovedLogin {onchoose} ondismiss={() => ondismiss([one.id])} {one} />
  </li>
{/snippet}

<div class="group">
  <NoticeRow
    dismissLabel="Dismiss all {plural(moved.length, "moved login")}"
    label={heading}
    ondismiss={() => ondismiss(moved.map((one) => one.id))}
  >
    {#snippet lead()}
      {#if first}
        <AccountTile
          hue={first.account.hue}
          provider={first.account.provider}
          size={28}
        />
      {/if}
    {/snippet}
    <h3 class="head">{heading}</h3>
    <p class="explainer">
      Found signed in on your machines and kept as fleet accounts; any session
      can use them now.
    </p>
  </NoticeRow>
  <div class="entries">
    {#if todo.length > 0}
      <ul class="list">
        {#each todo as one (one.id)}
          {@render entry(one)}
        {/each}
      </ul>
    {/if}
    {#if done.length > 0}
      <div class="more" data-flip>
        <Button
          aria-controls="moved-done"
          aria-expanded={open}
          class="toggle"
          onclick={() => {
            open = !open;
          }}
          size="xs"
          variant="ghost"
        >
          {open ? "Hide" : "Show"}
          {done.length}
          signed in everywhere
          <IconChevronDown
            aria-hidden="true"
            class="chev"
            data-icon="inline-end"
          />
        </Button>
      </div>
      <div
        class="fold"
        data-open={open || undefined}
        id="moved-done"
        inert={!open}
        ontransitionend={settled}
      >
        <div class="fold-inner">
          <ul class="list">
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
  /* The heading of the group: label type in strong ink, its explainer in
     muted meta; the entries under it read a step lower (MovedLogin). */
  .head {
    margin: 0;
    padding-inline-end: var(--x-room);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .explainer {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* No indent: each entry is a row of the panel, its tile in the one lead
     column, its words in the one text column, its ✕ at the one trailing
     edge. */
  .entries {
    display: flex;
    flex-direction: column;
    margin-block-start: calc(-1 * var(--space-2));
    padding-block-end: var(--space-2);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The toggle in the text column, its end at the trailing edge. */
  .more {
    display: flex;
    justify-content: flex-end;
    padding-inline: calc(var(--space-3) + 28px + var(--space-3)) var(--space-3);
  }
  /* The fold (UpdateCard's notes' recipe): the grid row is the track, the
     inner box clips, fades and cross-blurs; shutting is quicker than
     opening; the chevron flips with it. */
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] {
    grid-template-rows: 1fr;
    transition-duration: var(--dur-panel);
  }
  .fold-inner {
    min-block-size: 0;
    overflow: hidden;
    opacity: 0;
    filter: blur(var(--fold-blur));
    transition:
      opacity var(--dur-exit) var(--ease-out),
      filter var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] > .fold-inner {
    opacity: 1;
    filter: blur(0);
    transition-duration: var(--dur-panel);
  }
  .more :global(.chev) {
    transition: transform var(--dur-panel) var(--ease-out);
  }
  .more :global(.chev path) {
    vector-effect: non-scaling-stroke;
  }
  .more :global(.toggle[aria-expanded="true"] .chev) {
    transform: scaleY(-1);
  }
  @media (prefers-reduced-motion: reduce) {
    .fold,
    .more :global(.chev) {
      transition: none;
    }
    .fold-inner {
      filter: none;
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
  /* A finger's 44px area (`touch-hit`) reaches 10px past the toggle: the
     row opens its gap on touch so the area stays inside the group and the
     panel never scrolls for it (The 44 Touch Rule). */
  @media (pointer: coarse) {
    .more {
      padding-block-end: var(--space-1);
    }
  }
</style>
