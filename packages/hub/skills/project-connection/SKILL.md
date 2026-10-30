---
name: project-connection
description: Handle a connection the person signed in for a project, when its service pushes events and the project has no relay for it. Use when a CawCo message's context line names this skill.
---

# A connection that needs a relay

The service pushes its events instead of being polled, so none reach the project until it has a relay: a public webhook path for that provider.

1. **Ask the person** whether to open one, as a decision page with one card (the decision-page skill). Done when the card is in front of them.
2. **On yes**, call `relay_create({ provider })` with the provider the send names: the opening goes in front of them as an Approve card. Then tell them what to register at the service. Done when they have the URL to register.
3. **On no**, leave it: the connection works as it is.
