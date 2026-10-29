# Is it readable for the person?

Before the person sees a canvas, answer four questions from the report and the graph it gives, with `interface-craft` (Design Critique) loaded:

1. **Does the ask say what to judge?** "Judge the six pairing states: pin anything that reads wrong", not "Stories".
2. **Is every frame named in plain words with its form?** Each story's doc comment is its label; `unnamed` lists the ones with none. The form (`phone 390`, `desk 1280`) comes from `parameters.viewport`.
3. **Are the frames grouped the way the person thinks about them?** A section per screen (`title: "Settings/Pairing"`, one states file each), the states of one component together, flows as its graph's moves, `edges` and `group` for the relations a grid cannot show.
4. **Can they reach any state in two moves?** The design graph beside the page holds a tab per component and its state machines (`group`); a hover previews a state on the page, a press keeps it; on a phone the graph is the drawer at the page's foot.

**The worked failure.** A surface of 49 stories of the project's screens, laid out as one wrapping row with export names as the only words, opened with no explanation: the person called it "not very navigateable". The same surface as nine states files, one section per screen, each story with a comment, an ask naming what to judge, and the graph beside it: every question answers yes.
