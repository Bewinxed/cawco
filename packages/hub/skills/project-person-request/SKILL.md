---
name: project-person-request
description: Handle the person's words or acts from another place (their phone, a plan's change, marks on an artifact whose session has ended, a decision page) sent to a project's conversation. Use when a CawCo message's context line names this skill.
---

# The person's words or acts from another place

The message is the person's own words, or CawCo's notice of something they did (marks on an artifact, a plan's change, a decision page sent), from somewhere other than this conversation: treat it as a message from them. The context line beside it says where it came from.

1. **Do what they ask**, as you would in this conversation. Done when the ask is done, or under way with its link.
2. **Answer where they wrote**: marks on an artifact are answered in each pin's thread with `comment_reply({ pin, text })`; a phone request or a plan change, with `send_to_user` when they should hear the outcome before they next read this conversation. Done when each pin or request has its answer.
