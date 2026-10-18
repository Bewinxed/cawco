<script lang="ts">
  /**
   * The plan-view preview: what the plan panel would draw under the
   * advisor's one model, state by state, each on the desk's side card and
   * the phone's bottom sheet, then live, then as it is drawn today.
   */
  import DeskPlan from "./DeskPlan.svelte";
  import {
    attempt,
    delegates,
    type PlanFixture,
    plain,
    specFolded,
    specOpen,
  } from "./fixtures";
  import LiveFrame from "./LiveFrame.svelte";
  import PhonePlan from "./PhonePlan.svelte";
  import ProposedPlan from "./ProposedPlan.svelte";
  import TodayPlan from "./TodayPlan.svelte";

  const loaded = Date.now();

  interface State {
    /** What the frames show, after "Desk ·" or "Phone ·". */
    caption: string;
    /** The section's head. */
    head: string;
    id: string;
    plan: PlanFixture;
  }
  const states: State[] = [
    {
      id: "plain",
      head: "A session's own plan",
      caption:
        "A session's plan: steps with sub-steps, one under way with its time counting, two done, one to do",
      plan: plain,
    },
    {
      id: "task",
      head: "On a task",
      caption:
        "On a task, the plan is the task's to-dos, the session's steps under them, one to-do moved to a task of its own and one proposed",
      plan: attempt,
    },
    {
      id: "delegates",
      head: "Steps that delegates carry",
      caption:
        "Delegates in the plan: one working with its steps open, Fable waiting on you, one queued for a build slot, one failed",
      plan: delegates,
    },
    {
      id: "spec",
      head: "The spec",
      caption: "The spec folded at the foot of the plan",
      plan: specFolded,
    },
  ];
  const sections = [
    ...states.map(({ id, head }) => ({ id, head })),
    { id: "live", head: "Live" },
    { id: "today", head: "Today, for comparison" },
  ];
</script>

<main class="page">
  <header class="intro">
    <h1>The plan, redesigned</h1>
    <p class="what">
      A preview of the plan panel, on the desk beside a conversation and on the
      phone as a sheet. Nothing here is built yet.
    </p>
    <p>
      The plan is one list of what a session is doing. Each step says its state,
      who's on it, what it's tied to, and what it waits on.
    </p>
    <p>
      On a task, the plan is the task's to-dos, with the session's own steps
      under them.
    </p>
    <nav aria-label="Sections">
      <ul>
        {#each sections as section (section.id)}
          <li><a href="#{section.id}">{section.head}</a></li>
        {/each}
      </ul>
    </nav>
  </header>

  {#each states as state (state.id)}
    <section id={state.id} aria-labelledby="{state.id}-head" class="state">
      <h2 id="{state.id}-head">{state.head}</h2>
      <div class="frames">
        <figure>
          <DeskPlan plan={state.plan}>
            <ProposedPlan {loaded} plan={state.plan} />
          </DeskPlan>
          <figcaption>Desk · {state.caption}</figcaption>
        </figure>
        <figure>
          <PhonePlan plan={state.plan}>
            <ProposedPlan {loaded} plan={state.plan} />
          </PhonePlan>
          <figcaption>Phone · {state.caption}</figcaption>
        </figure>
        {#if state.id === "spec"}
          <figure>
            <DeskPlan plan={specOpen}>
              <ProposedPlan {loaded} plan={specOpen} />
            </DeskPlan>
            <figcaption>Desk · The spec opened, read in place</figcaption>
          </figure>
          <figure>
            <PhonePlan plan={specOpen}>
              <ProposedPlan {loaded} plan={specOpen} />
            </PhonePlan>
            <figcaption>Phone · The spec opened, read in place</figcaption>
          </figure>
        {/if}
      </div>
    </section>
  {/each}

  <section id="live" aria-labelledby="live-head" class="state">
    <h2 id="live-head">Live</h2>
    <div class="frames">
      <figure>
        <LiveFrame {loaded} />
        <figcaption>
          Desk · Live: a sub-step ticks, a delegate's step arrives and opens,
          then a to-do ticks and the ring moves on
        </figcaption>
      </figure>
    </div>
  </section>

  <section id="today" aria-labelledby="today-head" class="state">
    <h2 id="today-head">Today, for comparison</h2>
    <div class="frames">
      <figure>
        <DeskPlan plan={attempt} today>
          <TodayPlan />
        </DeskPlan>
        <figcaption>
          Desk · Today: the same task's plan as the panel draws it now, steps
          then the spec then the to-dos again
        </figcaption>
      </figure>
      <figure>
        <PhonePlan plan={attempt} ring={false}>
          <TodayPlan sheet />
        </PhonePlan>
        <figcaption>
          Phone · Today: the same task's plan as the sheet draws it now
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
    & .what {
      color: var(--ink-muted);
    }
  }
  nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-block-size: 32px;
    color: var(--link-ink);
    font: var(--type-label);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-xs);
    }
  }
  .state {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    scroll-margin-block-start: var(--space-5);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--border-hairline);

    & h2 {
      margin: 0;
      font: var(--type-body);
      font-weight: var(--weight-strong);
    }
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
    max-inline-size: 390px;
    margin: 0;
  }
  figcaption {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  @media (width < 640px) {
    .page {
      padding: var(--space-6) 0 64px;
    }
    .intro,
    .state > h2,
    figcaption {
      padding-inline: var(--space-4);
    }
    .frames {
      flex-direction: column;
      gap: var(--space-7);
    }
  }
</style>
