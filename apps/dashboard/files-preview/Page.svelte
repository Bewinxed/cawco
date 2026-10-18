<script lang="ts">
  /**
   * The page the owner picks on: Files on a desk, floating over the page
   * from its item in the bar's glass group; the one decision, how the count
   * shows on that item (its two answers side by side, each with its Pick);
   * then the phone's bottom drawer, opened from Files in the phone's glass.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Frame from "./Frame.svelte";

  const STAGES = [
    { src: "stage=closed", label: "Closed" },
    { src: "stage=open", label: "Files open" },
    {
      src: "stage=picked",
      label:
        "A file chosen: Files hanging on the right, the file floating on the left",
    },
    {
      src: "stage=open&q=pricing",
      label: "Searching “pricing”: names and what is in them",
    },
    {
      src: "stage=open&q=invoice",
      label: "Searching “invoice”: nothing matches",
    },
  ] as const;

  const TAKES = [
    {
      option: "beside",
      name: "The number beside it",
      line: "As the machines show theirs: the number in the bar's own type beside the folder.",
    },
    {
      option: "mark",
      name: "A vermillion count",
      line: "A small vermillion count at the item's top, beside the folder and clear of it.",
    },
  ] as const;

  /** The bar's trailing end on a desk, and the phone's top row's. */
  const BAR_END = { x: 1020, y: 0, width: 420, height: 44 };
  const PHONE_END = { x: 190, y: 0, width: 200, height: 56 };

  const PULLS = [
    { pull: "closed", label: "Closed" },
    { pull: "open", label: "Open, from Files beside Caw" },
  ] as const;
</script>

<main class="page">
  <header class="intro">
    <h1>Files for a session</h1>
    <p>
      Every artifact and attachment of a conversation in one list, opened from
      the folder in the bar's icon group.
    </p>
  </header>

  <section aria-labelledby="desk" class="block">
    <h2 id="desk">On a desk</h2>
    <p class="aside">
      Files hangs from the icon group, one shape with it, as the machines and
      Jump do, and the conversation stays where it is. A chosen file floats
      beside Files, on its left, the two tops on one line. The conversation
      behind is today's screen.
    </p>
    <div class="desks">
      {#each STAGES as each (each.src)}
        <figure class="shot">
          <Frame
            height={900}
            src="./?frame=desk&{each.src}"
            title="Desk: {each.label}"
            width={1440}
          />
          <figcaption>{each.label}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section aria-labelledby="count" class="block">
    <h2 id="count">The count on the Files icon</h2>
    <div class="takes">
      {#each TAKES as take (take.option)}
        <article aria-labelledby="t-{take.option}" class="take">
          <div class="take-head">
            <div class="take-words">
              <h3 id="t-{take.option}">{take.name}</h3>
              <p>{take.line}</p>
            </div>
            <Button
              data-cawco-choice="files-count"
              data-option={take.option}
              label="Pick"
              size="sm"
              variant="outline"
            />
          </div>
          <figure class="shot">
            <Frame
              height={44}
              src="./?frame=bar&count={take.option}"
              title="The bar's icon group: {take.name}"
              view={BAR_END}
              width={1440}
            />
            <figcaption>
              The end of a desk's bar, enlarged where there is room
            </figcaption>
          </figure>
          <figure class="shot phone-end">
            <Frame
              height={844}
              src="./?frame=phone&pull=closed&count={take.option}"
              title="The phone's glass: {take.name}"
              view={PHONE_END}
              width={390}
            />
            <figcaption>The phone's glass, beside Caw</figcaption>
          </figure>
        </article>
      {/each}
    </div>
  </section>

  <section aria-labelledby="phone" class="block">
    <h2 id="phone">On a phone</h2>
    <p class="aside">
      The house drawer from the bottom. Files, beside Caw at the top of the
      screen, opens it; a finger drags it down to its lower stop, and on down to
      put it away. Inside, Artifacts and Attachments take turns under one
      switch, so the list on show has the drawer's whole height.
    </p>
    <div class="phones">
      {#each PULLS as each (each.pull)}
        <figure class="shot">
          <Frame
            height={844}
            src="./?frame=phone&pull={each.pull}"
            title="Phone: {each.label}"
            width={390}
          />
          <figcaption>{each.label}</figcaption>
        </figure>
      {/each}
    </div>
  </section>
</main>

<style>
  :global(html:not([data-frame])) {
    background: var(--background);
  }
  :global(html:not([data-frame]) body) {
    margin: 0;
  }
  .page {
    container-type: inline-size;
    display: grid;
    gap: var(--space-8);
    padding: var(--space-7) var(--space-6) var(--space-8) var(--space-7);
    color: var(--ink-strong);
    font: var(--type-body);
  }
  @media (max-width: 639px) {
    .page {
      padding-inline: var(--space-3);
    }
  }
  .intro {
    display: grid;
    gap: var(--space-1);

    & h1 {
      margin: 0;
      font: var(--type-title);
      letter-spacing: var(--track-title);
      text-wrap: balance;
    }
    & p {
      max-inline-size: 72ch;
      margin: 0;
      color: var(--ink-muted);
      text-wrap: pretty;
    }
  }
  .block {
    display: grid;
    gap: var(--space-4);
    min-inline-size: 0;

    & > h2 {
      margin: 0;
      font: var(--type-label);
      font-size: var(--text-body);
    }
  }
  .aside {
    max-inline-size: 72ch;
    margin: calc(-1 * var(--space-3)) 0 0;
    color: var(--ink-muted);
    font: var(--type-meta);
    text-wrap: pretty;
  }
  .desks {
    display: grid;
    gap: var(--space-6);
    max-inline-size: 1100px;
  }
  .takes {
    display: grid;
    gap: var(--space-6);
  }
  @container (width > 900px) {
    .takes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .take {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .take-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    min-block-size: calc(3lh + var(--space-1));
  }
  .take-words {
    display: grid;
    flex: 1;
    gap: var(--space-1);
    min-inline-size: 0;

    & h3 {
      margin: 0;
      font: var(--type-label);
    }
    & p {
      margin: 0;
      color: var(--ink-muted);
      font: var(--type-meta);
      text-wrap: pretty;
    }
  }
  .shot {
    display: grid;
    gap: var(--space-2);
    min-inline-size: 0;
    margin: 0;

    & figcaption {
      color: var(--ink-muted);
      font: var(--type-meta);
    }
  }
  .take .shot {
    max-inline-size: 840px;
  }
  .take .phone-end {
    max-inline-size: 400px;
  }
  .phones {
    display: grid;
    gap: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
    max-inline-size: 960px;
  }
</style>
