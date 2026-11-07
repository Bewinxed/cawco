---
version: 1
slug: "src-lib-cawco-home-peeksheet-svelte"
primary_target: "src/lib/cawco/home/PeekSheet.svelte"
related_targets: ["src/lib/cawco/PeekPane.svelte"]
---

# Peek

The owner's pick for the peek (`home/PeekSheet.svelte`, `PeekPane.svelte`): Home's quick look at one session without opening it. Mode: Operate. The operator arrives from a session row's expand mark (Home's lists, the rail's rows on a touch screen) or from an ask in Needs you, often while another conversation stays open, to see what the session said, answer what it waits on, and go back.

- Peek is on desktop and iPad. On a desk it comes in from the right beside Home, `c-peek-sheet-w` wide, holding nothing (no scrim, no focus trap); on an iPad it rises from the bottom as wide as the screen, `c-peek-sheet-h` tall, its bar, tail and tray on one reading measure (`c-measure`), centred (the design review, 2026-11-07: the bar stands over the column it heads). A phone has no peek; a window narrowed to a phone's layout puts an open one away.
- Its head is one row floating over what it said (The Title Bars Follow Liquid Glass Rule, 2026-11-03; floating, 2026-11-07): the session's title by its project's folder in the project's hue, its machine's OS mark with the machine's name in its tooltip, then Open (the maximize symbol, which dives) and Close as bare symbols in glass. No path stands in it. The title takes the right-click: Open, Fork, Stop, Close. The bar is first in the reading and tab order. A risen sheet takes the focus itself as it opens, never its first control; beside the page the peek moves no focus.
- What the session said runs the sheet's whole height, under the bar and the tray, and follows new turns and the stream; its foot keeps the tray's measured height clear, and the ground fades under the tray (FootFade).
- The foot tray (Live foot, his pick, 2026-11-07): one glass float panel at the sheet's foot, capped at half the sheet (`c-peek-tray-h`), holding top to bottom: a failure as itself in the failed pair (said once: the tail ends before the same words); each ask as itself, oldest first, scrolling with faded edges when several fill the tray (a permission's words, its command whole, wrapping anywhere, Deny and Approve or Take over with its refusal; a question's own words and Answer; a sign-in's "Connect GitHub to Caw&Co", its reason and Connect); the plan row (a capsule with the house hover and a 44px touch area: ring in the project's hue, the step at work, the figure in tabular figures), whose press opens the steps upward on the step at work, capped at `c-peek-steps-h`, at least `c-peek-steps-min-h`, giving way to an ask before it; the status row (the session's mark with its state as its name and tooltip, the tool at work and its target, the context meter, drawn once the session has reported a reading), shown while it runs or its machine is out of reach, and for a session with no plan, hidden while an ask stands; a stop that did not go, with its way back.
- Bar, tail and tray share one column: the tail pads by `space-4`, and the tray's inset (`space-2`) plus a row's pad (`space-2`) puts every glyph and an ask's words on the tail's text column. Inside the tray every fill is concentric with it (`--r-inner`): rows are capsules a button high, the meter a capsule in the status row's end, focus rings inset. The context breakdown opens above the tray, never over it. The opened steps show no scrollbar; their edge fades say there is more. A truncated title shows its whole on hover.
- Its machine out of reach: the tray's rows and the bar's machine mark dim as the product's rows do (`data-stale`), and what loops in the tray holds still.
- The last turn reads whole; earlier turns are clamped.
- Its turns on their way (a read under way, or a first turn under way) hold their place with the kit Skeleton, as the session's own pane does; a read that failed is the session pane's fault block: its mark, the fault in its own words, Try again. An ended session that said nothing shows nothing.
- No labels, state words or sentences describing a thing on a line (The Screen Is Not The Record Rule).
- States: working; waiting on a permission; waiting on a question; waiting on a sign-in; waiting on several at once; a long plan opened; working with no plan; ended; failed; its machine out of reach; its turns on their way; couldn't read it. States file: `home/PeekFixture.stories.ts`; bench: `/motion/peek?state=…`.
- Widths: 400 (the desk's sheet), 1366 (iPad landscape); 390 has no peek.
- Direction: inherits DESIGN.md.
