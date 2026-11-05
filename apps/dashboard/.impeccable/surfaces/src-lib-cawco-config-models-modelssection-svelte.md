---
version: 1
slug: "src-lib-cawco-config-models-modelssection-svelte"
primary_target: "src/lib/cawco/config/models/ModelsSection.svelte"
related_targets: []
---

# Models CawCo uses

Configure › Models CawCo uses (`/config/models`, `ModelsSection.svelte`): the models the hub itself talks to. Mode: Operate. The operator arrives to change how Jev is reached, to switch fleet watch, or to choose where `generate_image` makes an image when a call names no provider.

Regions, in one SectionFrame: OpenRouter, Jev, Fleet watch, Images. Widths: 390, 680, 1440, 2529 (the card caps the content at about 930px from 1440 up).

## Images (`ImageDefault.svelte`)

- The providers are a one-pick list (house OptionGroup, `list`): ChatGPT, Gemini through Antigravity, Gemini API, each with its mark, what it runs on and its standing across the machines ("Ready on 2 of 4 machines"). The standing's warning takes the attention hue only on the provider calls go to; the others say it in muted ink.
- The chosen provider's detail stands beside the list on a desk (container `images`, 44rem) and under it below: the Gemini API's models as option chips (its default first, marked "default", saved as no model), then every machine with its OS mark, its name, and Ready or what it lacks, with the way to put that right at the trailing edge (Accounts, the account's page, CLI tools).
- A pick saves at once, as the page's switches do; the head says Saving… then Saved. A refusal puts the hub's choice back and stands under the group in the hub's words, then what calls still go to.
- Readiness is read from what the hub already holds (core `imageReadiness`): ChatGPT logins signed in on each machine and their plan, the Antigravity CLI's tool status and sign-in, Gemini API keys signed in. What only the request can tell (a token that won't renew, the Google AI plan, billing on a key) is not shown.
- States: nothing set (ChatGPT), each provider chosen, a model chosen, not ready on some or every machine, no machine joined (the Machines blank state), saving, saved, refused in the hub's words, a save that never reached the hub.

## Verdict

Streamline: the page's structure serves its tasks; Images joins it as the fourth group. Prior picks kept: one card, one group per model the hub talks to, saves on change.
