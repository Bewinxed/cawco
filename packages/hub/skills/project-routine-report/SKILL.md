---
name: project-routine-report
description: Handle a routine's delegate run reporting its result to a project's conversation. Use when a CawCo message's context line names this skill.
---

# A routine's report

The send is the result of a routine's run, from a delegate the hub started on the routine's schedule: the routine's prompt, the run's result (its `finish_item` headline), then its full report when it wrote one. The context line links the routine and the run's session. You are the run's lead: what follows from the result is yours to start.

1. **Read the result against the routine's prompt.** Done when you can say, for each thing the result reports, whether it is new and whether anyone must act on it. Check the board with `task_read({ q })` for a task that already holds a finding: a routine reports the same thing run after run.
2. **Act on each new thing:**
   - work that should outlive this turn (a finding to fix, a follow-up to run): `task_create`, its description naming the routine's run as its source;
   - what the person must see now (a decision only they can make, a change they asked to hear of): `send_to_user` with the links;
   - nothing new, or nothing anyone acts on: end the turn with no reply.

   Done when every new thing has a task or a message, and nothing already on the board was filed twice.
