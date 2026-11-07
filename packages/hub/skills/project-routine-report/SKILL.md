---
name: project-routine-report
description: Handle a routine's delegate run reporting its result to a project's conversation. Use when a CawCo message's context line names this skill.
---

# A routine's report

The send is the result of a routine's run, from a delegate the hub started on the routine's schedule: the routine's prompt, the run's result (its `finish_item` headline), then its full report when it wrote one. The context line links the routine and the run's session. You are the run's lead. The routine's prompt is the person's word for this run's work, and only that: whatever else the result raises is a **proposal**.

1. **Read the result against the routine's prompt.** Done when you can say, for each thing the result reports, whether it is new and whether anyone must act on it. Check the board with `task_read({ q })` for a task that already holds a finding: a routine reports the same thing run after run.
2. **Act on each new thing:**
   - work the prompt asks for that should outlive this turn (a finding it asks to have fixed, a follow-up it names): `task_create` in a todo stage, its description naming the routine's run as its source;
   - a proposal (a lead to chase, a draft to write, a fix the prompt never asked for): one `ask` (`blocks: false`, options Do it and Not now, `meanwhile` saying it waits for them). Their answer wakes you: Do it is their word, so file it then;
   - what the person must see now (a decision only they can make, a change they asked to hear of): `send_to_user` with the links;
   - nothing new, or nothing anyone acts on: end the turn with no reply.

   Done when every new thing the prompt asks for has a task or a message, every other one is an ask, and nothing already on the board was filed or asked twice.
