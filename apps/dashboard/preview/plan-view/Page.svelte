<script lang="ts">
  /**
   * The plan-view preview: three ways to draw the plan, one section each,
   * every one from the same plan (a session building a booking page with
   * four delegates out), with a Pick on each. Today, as the panel draws it
   * now, stands at the foot for comparison.
   */
  import DeskPlan from "./DeskPlan.svelte";
  import { plan } from "./fixtures";
  import PhonePlan from "./PhonePlan.svelte";
  import { CHOICE } from "./Pick.svelte";
  import TodayPlan from "./TodayPlan.svelte";
  import Variation from "./Variation.svelte";

  const loaded = Date.now();

  const names = { a: "One ledger", b: "Lanes", c: "Crew first" };
</script>

<main class="page">
  <header class="intro">
    <h1>The plan, three ways</h1>
    <p>
      The plan is the side panel that lists what a session is doing: its steps,
      the delegates working on them, and what each step waits on.
    </p>
    <p>
      Below are three ways to draw it from the same plan; pick one, and say what
      to change in its notes.
    </p>
    <nav aria-label="Sections">
      <ul>
        <li><a href="#variation-a">{names.a}</a></li>
        <li><a href="#variation-b">{names.b}</a></li>
        <li><a href="#variation-c">{names.c}</a> · recommended</li>
        <li><a href="#today">Today, for comparison</a></li>
      </ul>
    </nav>
  </header>

  <div class="choice" data-cawco-choice={CHOICE}>
    <Variation
      differs={[
        "One list. A delegate is one row under the to-do it carries, with its progress line; its steps and report wait behind its fold.",
        'A step that waits on others says so in a chip, "after Date picker · Deposit ↑", which points at them. No lines are drawn.',
      ]}
      line="The least new: one list, delegates nested under their to-do, dependencies as a chip."
      live="A finished delegate's line fills and its sweep stops; the to-do's tile ticks; the waiting step's hourglass turns to working as its chip fades."
      {loaded}
      name={names.a}
      {names}
      variation="a"
    />
    <Variation
      differs={[
        "The panel draws the graph: steps that can run side by side stand in two lanes, and a line runs from each step to the ones that start after it.",
        "A delegate sits under its step, and the line down to it pulses while it works.",
        "On a phone a step opens on a page of its own, since the lanes leave no room to open it in place.",
      ]}
      line="Draws the dependencies: two lanes and lines between steps, pulsing to a working delegate."
      live="The line to a working delegate pulses; when the date picker and the deposit are both done their lines meet at the step that waited on them, and it starts."
      {loaded}
      name={names.b}
      {names}
      variation="b"
    />
    <Variation
      differs={[
        "Two groups. On it: one flat row per delegate, its problem and its progress line, working first. Then the to-dos, flat, each with small tiles saying who is on it.",
        "A step that waits shows the chip, and one straight line runs from each step it waits on down the tiles.",
        "On a phone a step or a delegate opens on a page of its own.",
      ]}
      line="Your stack: which delegate is on which problem, with its progress, above a quiet to-do list."
      live="The stack reorders as delegates finish, a finished one folds into the count under it, and its small tile leaves the to-do."
      {loaded}
      name={names.c}
      {names}
      recommended
      variation="c"
    />
  </div>

  <section aria-labelledby="today-head" class="today" id="today">
    <h2 id="today-head">Today, for comparison</h2>
    <p class="today-line">The same plan, as the panel draws it now.</p>
    <div class="frames">
      <figure data-kind="desk" data-phone="hide">
        <DeskPlan fit {plan} today>
          <TodayPlan {plan} />
        </DeskPlan>
        <figcaption>
          Desk · Today: the steps with their to-do ids in the words, the spec,
          then the to-dos again
        </figcaption>
      </figure>
      <figure data-kind="phone">
        <PhonePlan {plan} today>
          <TodayPlan {plan} sheet />
        </PhonePlan>
        <figcaption>
          Phone · Today: the same plan as the sheet draws it now
        </figcaption>
      </figure>
    </div>
  </section>
</main>

<style>
  .page {
    --safe-bottom: 0px;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-inline-size: 1600px;
    margin-inline: auto;
    padding: var(--space-8) var(--space-7) 96px;
    color: var(--ink-strong);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-inline-size: 72ch;

    & h1 {
      margin: 0 0 var(--space-1);
      font: var(--type-title);
      text-wrap: balance;
    }
    & p {
      margin: 0;
      font: var(--type-body);
      text-wrap: pretty;
    }
  }
  nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-block-size: 32px;
    color: var(--link-ink);
    text-decoration: none;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-xs);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    nav a:hover {
      text-decoration: underline;
    }
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .today {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    scroll-margin-block-start: var(--space-5);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--border-hairline);

    & h2 {
      margin: 0;
      font: var(--type-title);
    }
  }
  .today-line {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .frames {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    gap: var(--space-8);
  }
  figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    max-inline-size: 780px;
    margin: 0;
  }
  figure[data-kind="phone"] {
    inline-size: min(390px, 100%);
  }
  figcaption {
    max-inline-size: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  @media (width < 700px) {
    .page {
      padding: var(--space-6) 0 64px;
    }
    .intro,
    .today > h2,
    .today-line,
    figcaption {
      padding-inline: var(--space-4);
    }
    .frames {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-7);
    }
    figure {
      inline-size: 100%;
      max-inline-size: 100%;
    }
    figure[data-phone="hide"] {
      display: none;
    }
  }
</style>
