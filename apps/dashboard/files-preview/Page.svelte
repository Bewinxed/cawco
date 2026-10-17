<script lang="ts">
  /**
   * The page the owner picks on: Files on a desk, floating over the page
   * from its item in the bar's glass group; the one decision, how the count
   * shows on that item (its two answers side by side, each with its Pick);
   * then the phone's drawer from the right and the session card's Files
   * chip.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { filesOf } from "./fixtures";
  import Frame from "./Frame.svelte";
  import SessionCard from "./SessionCard.svelte";

  const files = filesOf("typical");
  const count = files.artifacts.length + files.attachments.length;

  const STAGES = [
    { src: "stage=closed", label: "Closed" },
    { src: "stage=open", label: "Files open" },
    {
      src: "stage=picked",
      label: "A file chosen: Files hanging on the right, the file floating on the left",
    },
    {
      src: "stage=open&q=pricing",
      label: "Searching “pricing”: names and what is in them",
    },
    { src: "stage=open&q=invoice", label: "Searching “invoice”: nothing matches" },
  ] as const;

  const TAKES = [
    {
      option: "mark",
      name: "A count on the icon",
      line: "A small count on the folder's corner, smaller than the icon.",
    },
    {
      option: "none",
      name: "No count",
      line: "The icon alone. The count is in its name, read out and shown on hover, and in the panel's heads.",
    },
  ] as const;

  const PULLS = [
    { pull: "closed", label: "Closed" },
    { pull: "open", label: "Open, from the card's Files chip" },
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
      Jump do, and the conversation stays where it is. A chosen file floats on
      the left, so the conversation shows between the two. The conversation
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
              width={420}
            />
            <figcaption>The end of the bar, enlarged where there is room</figcaption>
          </figure>
        </article>
      {/each}
    </div>
  </section>

  <section aria-labelledby="phone" class="block">
    <h2 id="phone">On a phone</h2>
    <p class="aside">
      The house drawer from the right. The session card's Files chip opens it;
      a finger drags it back out to the right to put it away.
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

  <section aria-labelledby="card" class="block">
    <h2 id="card">The session card</h2>
    <p class="aside">
      A Files chip joins its settings. It opens Files and puts the card away.
    </p>
    <SessionCard {count} />
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
  .take .shot {
    max-inline-size: 840px;
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
  .phones {
    display: grid;
    gap: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
    max-inline-size: 960px;
  }
</style>
