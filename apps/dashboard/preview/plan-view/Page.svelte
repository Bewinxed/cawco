<script lang="ts">
  /**
   * The plan-view preview: what the plan panel would draw under the
   * advisor's one model, state by state, each on the desk's side card beside
   * the conversation and on the phone's bottom sheet; under the task and
   * delegate states, today's panel on the same rows; then live.
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
  import Key from "./Key.svelte";
  import LiveFrame from "./LiveFrame.svelte";
  import PhonePlan from "./PhonePlan.svelte";
  import ProposedPlan from "./ProposedPlan.svelte";
  import TodayCards from "./TodayCards.svelte";
  import TodayPlan from "./TodayPlan.svelte";

  const loaded = Date.now();

  const sections = [
    { id: "plain", head: "A session's own plan" },
    { id: "task", head: "On a task" },
    { id: "delegates", head: "Steps that delegates carry" },
    { id: "task-today", head: "Today, for comparison" },
    { id: "spec", head: "The spec" },
    { id: "live", head: "Live" },
  ];
</script>

{#snippet desk(plan: PlanFixture, caption: string, toEnd = false, fit = false)}
  <figure data-kind="desk">
    <DeskPlan {fit} {plan} {toEnd}>
      <ProposedPlan {loaded} {plan} />
    </DeskPlan>
    <figcaption>Desk · {caption}</figcaption>
  </figure>
{/snippet}

{#snippet phone(plan: PlanFixture, caption: string, toEnd = false)}
  <figure data-kind="phone">
    <PhonePlan {plan} {toEnd}>
      <ProposedPlan {loaded} {plan} />
    </PhonePlan>
    <figcaption>Phone · {caption}</figcaption>
  </figure>
{/snippet}

<main class="page">
  <header class="intro">
    <h1>The plan, redesigned</h1>
    <p class="what">
      A preview of the plan panel, on the desk beside a conversation and on the
      phone as a sheet. Nothing here is built yet. Each state is drawn as
      proposed, on the desk and on the phone; under the task and the delegates
      states, Today draws the same plan as the panel draws it now, for
      comparison.
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

  <Key />

  <section id="plain" aria-labelledby="plain-head" class="state">
    <h2 id="plain-head">A session's own plan</h2>
    <div class="frames">
      {@render desk(
        plain,
        "A session's plan: steps with sub-steps, one under way with its time counting, the done ones ticked, one to do"
      )}
      {@render phone(
        plain,
        "A session's plan: the same steps in the sheet, each row a finger's height"
      )}
    </div>
  </section>

  <section id="task" aria-labelledby="task-head" class="state">
    <h2 id="task-head">On a task</h2>
    <div class="pair">
      <p class="pair-head">Proposed, on the desk and the phone</p>
      <div class="frames">
        {@render desk(
          attempt,
          "On a task, the plan is the task's to-dos, the session's steps under them, one to-do moved to a task of its own, one proposed"
        )}
        {@render phone(
          attempt,
          "On a task: the task's to-dos, ticked from their marks, the task's name and stage under the title"
        )}
      </div>
    </div>
    <div id="task-today" class="pair">
      <p class="pair-head">
        Today, for comparison: the same task, as the panel draws it now
      </p>
      <div class="frames">
        <figure data-kind="desk">
          <DeskPlan plan={attempt} today>
            <TodayPlan plan={attempt} />
          </DeskPlan>
          <figcaption>
            Desk · Today: the same task, steps with their to-do ids in the
            words, the spec, then the to-dos again
          </figcaption>
        </figure>
        <figure data-kind="phone">
          <PhonePlan plan={attempt} today>
            <TodayPlan plan={attempt} sheet />
          </PhonePlan>
          <figcaption>
            Phone · Today: the same task as the sheet draws it now
          </figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section id="delegates" aria-labelledby="delegates-head" class="state">
    <h2 id="delegates-head">Steps that delegates carry</h2>
    <div class="pair">
      <p class="pair-head">Proposed, on the desk and the phone</p>
      <div class="frames">
        {@render desk(
          delegates,
          "The same task with its delegates out, each under the to-do it carries: one working with its steps open, Fable waiting on you, one queued for a build slot, one failed with its report",
          false,
          true
        )}
        {@render phone(
          delegates,
          "The same task with its delegates out, the sheet scrolled down to the queued and the failed one",
          true
        )}
      </div>
    </div>
    <div id="delegates-today" class="pair">
      <p class="pair-head">
        Today, for comparison: the same delegates, as the conversation and the
        panel draw them now
      </p>
      <div class="frames">
        <figure data-kind="desk">
          <DeskPlan plan={delegates} today>
            {#snippet conversation()}
              <TodayCards />
            {/snippet}
            <TodayPlan plan={delegates} />
          </DeskPlan>
          <figcaption>
            Desk · Today: the same delegates as cards in the conversation, and
            in the plan only as lines of words
          </figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section id="spec" aria-labelledby="spec-head" class="state">
    <h2 id="spec-head">The spec</h2>
    <div class="frames">
      {@render desk(specFolded, "The spec folded at the foot of the plan")}
      {@render phone(specFolded, "The spec folded at the foot of the plan")}
      {@render desk(
        specOpen,
        "The spec opened under the whole plan, the card scrolled down to it",
        true
      )}
      {@render phone(
        specOpen,
        "The spec opened under the whole plan, the sheet scrolled down to it",
        true
      )}
    </div>
  </section>

  <section id="live" aria-labelledby="live-head" class="state">
    <h2 id="live-head">Live</h2>
    <div class="frames">
      <LiveFrame {loaded} />
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
    gap: var(--space-5);
    scroll-margin-block-start: var(--space-5);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--border-hairline);

    & h2 {
      margin: 0;
      font: var(--type-body);
      font-weight: var(--weight-strong);
    }
  }
  /* A pair: the same state on the desk and the phone, named over both. */
  .pair {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    scroll-margin-block-start: var(--space-5);
  }
  .pair-head {
    margin: 0;
    font: var(--type-label);
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
  figcaption {
    max-inline-size: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* A phone's page: the frames stack at the page's width, the phone's
     sheet first; a desk frame scrolls sideways in its own box. */
  @media (width < 700px) {
    .page {
      padding: var(--space-6) 0 64px;
    }
    .intro,
    .page > :global(.key),
    .state > h2,
    .pair-head,
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
    figure[data-kind="phone"] {
      order: -1;
    }
  }
</style>
