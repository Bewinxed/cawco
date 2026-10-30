---
name: project-attempt-judgement
description: Judge an attempt's acceptance criteria for a project while Jev is off. Use when a CawCo message's context line names this skill.
---

# Judging an attempt

The attempt passed its checks and its work is in; its acceptance criteria wait for a judgement, and you did not do the work. The send lists the criteria and the attempt's report.

1. **Judge each criterion** against the report and the work itself (its commits, its diff, what it made): met, or what is missing. Done when every criterion has a verdict with its evidence.
2. **Move the task**: every criterion met, `task_update` to its done stage with a reason naming the evidence; anything missing, `task_comment` naming what is missing, then `task_update` back to its todo stage. Done when the task is in its new stage.
