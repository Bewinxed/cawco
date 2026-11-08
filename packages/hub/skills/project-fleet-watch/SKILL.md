---
name: project-fleet-watch
description: Handle fleet watch's nudge about a stuck session of a project. Use when a CawCo message's context line names this skill.
---

# Fleet watch's nudge

Fleet watch judged a session of the project as stuck (looping, idle on a wait, or off its brief): one you started, or one with no parent of its own, for which the hub started you as its handler. Fleet watch never tells a session about itself; steering it is yours.

1. **Read the session's work**: its brief, its newest turns, what it waits on. Done when you know whether it is stuck and why.
2. **Steer it**: `handoff` with what it needs, `interrupt_delegate` to cut a loop, `stop_delegate` when its work is done or pointless, or leave it when it is making progress. Done when the session has its next step.
