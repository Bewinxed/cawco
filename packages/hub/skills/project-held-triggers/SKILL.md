---
name: project-held-triggers
description: Decide what to do with the triggers a project held while nothing could start for them (its triggers off, past its spend cap, or none of its machines online), now that a session can start (comments, task moves, routine runs and results, inbound events). Use when a CawCo message's context line names this skill.
---

# What waited while nothing could start

Your brief lists everything that happened to the project's things while nothing could start for them (its triggers were off, it was past its spend cap, or none of its machines was online), grouped by thing, oldest first. A trigger whose thing was gone by the time you started is not on it. Nothing was started for any of it. Each entry says what happened, who did it and when, and what changed.

1. **Read each thing as it stands now** (`task_read({ id })` for a task, `artifact_read` for a page, `find` for the rest). Done when you know, for each thing, whether what was held still matters: a comment someone already answered, a run a later one superseded, or an event on a pull request since merged does not.
2. **Decide per thing** and act once:
   - still needed and small: do it now, as that trigger's own skill says (the task-input, task-move, routine-run, routine-report or inbound-event skill);
   - still needed and real work: start it with `task_start`, or file it with `task_create` in a todo stage;
   - needs the person: one `ask`, or one decision card when it is a choice;
   - no longer matters: leave it.
   Done when every thing in the list is acted on, started, asked or left.
3. **Write what you did on each thing you acted on**: a task's comments with `task_comment`, a pin's thread with `comment_reply`. Never post to the project's Caw conversation. Done when the person can read on each thing what came of it.
