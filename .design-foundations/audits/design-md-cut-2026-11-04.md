# DESIGN.md cut, 2026-11-04

DESIGN.md now holds only what spans screens: the principles, what the tokens mean, and the kit's recipes. A decision about one screen moved to that screen's surface brief under `apps/dashboard/.impeccable/surfaces/`; an agent's description of what the code does was deleted. `scripts/design-budget-check.ts` (in `bun run check`) holds the body to 8,000 words and 800 characters a paragraph.

Body before: 44,586 words. Body after: 7,900 words, the longest paragraph 717 characters (after the follow-up of the same day).

Sizes are the section's own text, its subsections apart. "Whole brief" is the brief's word count, shared by every section that fed it.

| Section (old file) | Before (words, chars) | Fate | After |
| --- | --- | --- | --- |
| ## Overview | 386, 2313 | stayed, tightened | 194 words, 1132 chars |
| ### Motion grammar | 3878, 23177 | stayed, tightened; Springs folded into The Interruptible Rule; Pages, Theme switch and the beats list deleted (the code holds them); the Stay In Context flows (forget, Caw off, account move) and the Add machine modal moved | 1219 words, 7407 chars + `apps-dashboard-src-lib-cawco-stoptray-svelte.md` (150 words, whole brief) + `rc-lib-cawco-connect-connectwindow-svelte-3a562f6a.md` (85 words, whole brief) |
| ### Sound and touch | 268, 1495 | rule stayed; the composer's list of moments deleted (agent's description) | 105 words, 588 chars |
| ## Colors | 20, 122 | stayed | 35 words, 248 chars |
| ### Primary: the coral action | 321, 2023 | stayed, tightened; Ink-solid and Brand moments merged into it; contrast figures deleted (the token-contrast check measures them) | 147 words, 1062 chars |
| ### Ink-solid | 29, 181 | merged into Primary | 0 |
| ### Brand moments | 55, 351 | merged into Primary | 0 |
| ### Tertiary: status | 369, 2267 | stayed, tightened; the owner's quote on the yellow card became the plain rule "a mark, never a surface" | 138 words, 830 chars |
| ### Neutral | 388, 2521 | stayed, tightened into frame, content, edges and inks | 123 words, 1006 chars |
| ### Identity | 166, 983 | stayed; accounts' hues added from the usage section | 106 words, 710 chars |
| ### Named Rules (Colors) | 335, 1948 | stayed, tightened | 295 words, 1700 chars |
| ## Typography | 217, 1455 | stayed, tightened | 121 words, 761 chars |
| ### Hierarchy | 492, 3098 | stayed, tightened | 128 words, 852 chars |
| ### Named Rules (Typography) | 809, 4467 | stayed, tightened | 297 words, 1719 chars |
| ## Layout | 1353, 7676 | stayed, tightened; owner quotes on title bars became plain rules; Fleet board deleted (no such ledger in the code); Transcript columns and Composer column deleted (agent's description) | 406 words, 2226 chars |
| ## Elevation & Depth | 84, 488 | stayed | 73 words, 427 chars |
| ### Shadow Vocabulary | 248, 1544 | stayed, tightened | 137 words, 968 chars |
| ### Stacking | 177, 1082 | stayed, tightened (the role list is the `layer` tokens) | 70 words, 424 chars |
| ### Materials | 72, 498 | stayed | 64 words, 441 chars |
| ### Named Rules (Elevation & Depth) | 112, 617 | stayed, tightened | 96 words, 528 chars |
| ## Shapes | 6685, 37211 | radii, Concentric, Measured Exception, borders, Whole Pixel stayed; folder tabs and HangCard kept as short kit recipes; session tabs, rim, rim taper, session card, tab hang and tab drag moved; Caw's panel and the glass's cards moved; Caw's panel contents (Needs you, Notices, rows, logins) moved; Focus outline merged into The One Ring Rule | 367 words, 2304 chars + `d-src-lib-cawco-workspace-panetabs-svelte-2873f1ea.md` (388 words, whole brief) + `apps-dashboard-src-lib-cawco-glasscard-svelte.md` (172 words, whole brief) + `apps-dashboard-src-lib-cawco-home-cawpanel-svelte.md` (132 words, whole brief) |
| ## Components | 103, 606 | stayed | 83 words, 480 chars |
| ### Buttons | 558, 3357 | stayed, tightened | 160 words, 1079 chars |
| ### Inputs and fields | 214, 1268 | stayed | 144 words, 865 chars |
| ### Cards and the stat tile | 131, 764 | stayed; Needs-you tile deleted (agent's description) | 57 words, 332 chars |
| ### Badges and state chips | 144, 848 | stayed as "Badges, chips and pills" with the setting, option and inline chips; Work tab count moved | 150 words, 913 chars + `apps-dashboard-src-lib-cawco-home-worktabs-svelte.md` (46 words, whole brief) |
| ### Navigation, menus and floating surfaces | 5801, 32573 | kit recipes stayed (popover, submenu, motion, menu item, ghost and pill, limit bar, ticks); Top bar's trailing edge moved; Files moved; Usage popover: the owner's dial-wall pick moved, the rest deleted | 169 words, 1033 chars + `apps-dashboard-src-lib-cawco-glasscard-svelte.md` (172 words, whole brief) + `oard-src-lib-cawco-files-filesface-svelte-57bb2d21.md` (194 words, whole brief) + `apps-dashboard-src-lib-cawco-usagemeter-svelte.md` (71 words, whole brief) |
| ### Segmented controls and tabs | 486, 2788 | stayed; Tab drag moved | 117 words, 749 chars + `d-src-lib-cawco-workspace-panetabs-svelte-2873f1ea.md` (388 words, whole brief) |
| ### Tooltip | 38, 224 | stayed | 31 words, 180 chars |
| ### Asking in the page | 153, 918 | stayed | 94 words, 564 chars |
| ### Dialog, sheet and drawer | 682, 3740 | stayed, tightened; Peek moved | 148 words, 822 chars + `apps-dashboard-src-lib-cawco-home-peeksheet-svelte.md` (33 words, whole brief) |
| ### Toast | 168, 944 | stayed, tightened | 66 words, 365 chars |
| ### Channel cards | 127, 775 | deleted: no owner trace (c180d65d3, an agent's update-screens commit); the code holds it | 0 |
| ### Update notice | 506, 2877 | moved: the owner's picks (fold in the row, no Home card) to Caw's panel brief; the rest deleted | `apps-dashboard-src-lib-cawco-home-cawpanel-svelte.md` (132 words, whole brief) |
| ### Update toast | 458, 2461 | moved | `lib-cawco-updates-update-toast-svelte-ts-ff939e87.md` (50 words, whole brief) |
| ### Alert | 36, 239 | stayed | 33 words, 218 chars |
| ### Empty, loading and skeleton states | 722, 4070 | stayed, tightened; the owner's quotes became plain rules | 268 words, 1516 chars |
| ### Status displays | 743, 4208 | session status, live dot, task ring stayed; Activity dot deleted (contradicts Live work breathes and the Status dot); Thinking indicator and Thinking steps deleted (agent's description); Tab icon moved | 192 words, 1101 chars + `src-lib-cawco-tab-icon-tab-icon-svelte-ts-074ac392.md` (37 words, whole brief) |
| ### Transcript | 1400, 7783 | moved: the notice row pick; the rest deleted (agent's description) | `rc-lib-cawco-transcript-transcript-svelte-eb603024.md` (45 words, whole brief) |
| ### Composer | 1788, 9721 | moved: The Composer Layer Rule and the plan ring's dot; The Composer Touch Rule deleted (The 44 Touch Rule's `.hit-under` holds it); the rest deleted | `src-lib-cawco-transcript-composer-svelte-596aa151.md` (118 words, whole brief) |
| ### Artifact panel, canvas and ink | 7853, 43323 | moved: the owner's picks, The One Target Rule and the 11-03 rail and thread-card picks; the rejected Comments rail layout (old line 998) and thread-card head (line 999) deleted; the rest deleted (PRD §5.10 and the code hold it) | `src-lib-cawco-preview-previewpane-svelte-46fef32e.md` (949 words, whole brief) |
| ### Browser view | 912, 5461 | deleted: no owner trace (24d887554); PRD §5.11, `words/browser.ts` and BrowserView.svelte hold it | 0 |
| ### Permission gate | 648, 3690 | The Peer Rule and The Consequential Grant Rule stayed as "Answering a permission"; option chips stayed as a kit recipe; the decision page card moved; the card's recipe deleted | 208 words, 1212 chars + `c-lib-cawco-decisions-decisionpage-svelte-298d85ca.md` (87 words, whole brief) |
| ### Effort chip | 160, 834 | deleted: no owner trace (2e6658e1c) | 0 |
| ### New-session popover | 181, 1038 | setting chip and icon tile stayed as kit recipes; the rest deleted (its holding nothing is The Open Page Rule) | 0 |
| ### Identity marks and tiles | 1178, 6359 | stayed, tightened; the plan ring's dot moved | 206 words, 1188 chars + `src-lib-cawco-transcript-composer-svelte-596aa151.md` (118 words, whole brief) |
| ### Icons | 237, 1404 | stayed; the owner's quote became the plain rule | 129 words, 778 chars |
| ### Focus and hit areas | 624, 3683 | stayed, tightened | 202 words, 1259 chars |
| ## Voice | 434, 2633 | stayed; The Should It Exist Rule added (the owner asked for the clean-copy skill in it, 2026-11-04) | 607 words, 3555 chars |
| ## Do's and Don'ts | 0, 1 | stayed | 0 words, 1 chars |
| ### Do: | 619, 3445 | stayed, cut to six lines that point at the rules | 98 words, 510 chars |
| ### Don't: | 459, 2548 | stayed, cut to six lines | 117 words, 650 chars |

## Surface briefs written

- `apps/dashboard/.impeccable/surfaces/src-lib-cawco-preview-previewpane-svelte-46fef32e.md`: 949 words
- `apps/dashboard/.impeccable/surfaces/d-src-lib-cawco-workspace-panetabs-svelte-2873f1ea.md`: 388 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-glasscard-svelte.md`: 172 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-home-cawpanel-svelte.md`: 132 words
- `apps/dashboard/.impeccable/surfaces/lib-cawco-updates-update-toast-svelte-ts-ff939e87.md`: 50 words
- `apps/dashboard/.impeccable/surfaces/oard-src-lib-cawco-files-filesface-svelte-57bb2d21.md`: 194 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-usagemeter-svelte.md`: 71 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-home-peeksheet-svelte.md`: 33 words
- `apps/dashboard/.impeccable/surfaces/src-lib-cawco-tab-icon-tab-icon-svelte-ts-074ac392.md`: 37 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-home-worktabs-svelte.md`: 46 words
- `apps/dashboard/.impeccable/surfaces/rc-lib-cawco-connect-connectwindow-svelte-3a562f6a.md`: 85 words
- `apps/dashboard/.impeccable/surfaces/src-lib-cawco-transcript-composer-svelte-596aa151.md`: 118 words
- `apps/dashboard/.impeccable/surfaces/rc-lib-cawco-transcript-transcript-svelte-eb603024.md`: 45 words
- `apps/dashboard/.impeccable/surfaces/c-lib-cawco-decisions-decisionpage-svelte-298d85ca.md`: 87 words
- `apps/dashboard/.impeccable/surfaces/apps-dashboard-src-lib-cawco-stoptray-svelte.md`: 150 words

## Contradictions in the old file (line numbers of `git show origin/main:DESIGN.md`)

1. 517 vs 999: a comment card pouring out of its pin opens on `--ease-goo`; the thread card grows over `--dur-pop` on `--ease-out`. The new file keeps 517's recipe binding; the artifact panel's brief says only that it grows out of the pill.
2. 517: "Two recipes" names three things (the skeleton, the folder tab, the comment card), two on `--ease-crossfade` and one on `--ease-goo`.
3. 523 vs 527: a flight is `--dur-lift` (340ms) in the Fast Exit Rule and 280ms in the One Object Rule (also 1011's Dock flight). The new file says `--dur-lift` and the drawer curve, no figure.
4. 514 vs 909: floating surfaces move on the drawer curve, yet the dialog enters "on ease-out rising 6px"; 525 makes every rise `--pop-rise` (8px).
5. 525 vs 902, 955/970, 1015: the Enter Rule's `--pop-scale` (0.92) against the tooltip's, the floating tags' and the stroke icon's 0.96.
6. 743 vs 1037: the permission card takes `shadow-stat` in the vocabulary and "hairline shadow" in its recipe; 1037's "240ms" is no duration token.
7. 561 and 951 vs 953: the Working glyph breathes on `--breath` (2s), yet the Activity dot's Working "pulses on the 1.2s loop" in info blue, and its Needs you is "warning amber with a ping" where 621 makes Needs you a spark mark. The Activity dot was deleted.
8. 649 vs 804 and 858: coral marks the action and selection only, yet Caw's panel and Files part their sections with a 1px `brand-solid` rule. The second is the owner's pick ("separate them with vermillion"), kept in the Files brief; the new Coral Action line names "a vermillion section rule" among `brand-solid`'s uses.
9. 734 and 912 vs 1051: "the new-session dialog" against "the New-session popover".
10. 713 vs 726: a 44px top bar against "a 55px toolbar zone (with 32px toolbar controls on the fleet board only)"; 728's fleet ledger is not in the code.
11. 998 vs the owner's pin of 2026-11-03 on title-bars-close: the rail's own Close, its full-width search row and its two-line empty state, all rejected; 999's thread-card head band rejected in the same thread.

## Clauses not placed: for the owner to rule

- The Comments rail's layout and the thread card from the 11-03 pin are written in the artifact panel's brief as he said them, but main's code is the old layout: the change lives on the title-bars branch.
- Two cards stand open on the title-bars-close page: where the phone sheet's Close stands, and what names an artifact at the top of its panel while its slug is its only name.
- comment-card-sizing left open where a comment opens on a tablet with the rail open (his note: a compact rail the comments grow out of).
- Sections deleted with no owner trace in the clause or its commit, which he may want back as a screen's rule: Browser view, Channel cards, Effort chip, the usage popover's detail beyond the dial wall, the recall wheel and queued edit, the transcript's rows and compaction divider, the thinking indicator, the canvas's tool rail and pen rules (the PRD §5.10 keeps their intent).
- Token descriptions in `design/tokens/*.tokens.json` (and the generated `Tokens.swift`, the decision-page kit's `tokens.css`) still name sections that moved ("DESIGN.md, The Comments rail", "DESIGN.md Effort chip"); the brief kept the tokens as they are.

## How each contradiction ended (follow-up, 2026-11-04)

1. Goo vs ease-out: the code opens the comment card on `--dur-pop` and `--ease-out` (PinFloat.svelte); `--ease-goo` runs only on the `/dev/pin-goo` bench. DESIGN.md now says so.
2. "Two recipes": the two on `--ease-crossfade` are named as two, and `--ease-goo` stands apart as the bench's.
3. Flight duration: `motion/share` flies on `--dur-panel`; `--dur-lift` is the lifted message's (lift.svelte.ts). Both rules now say which.
4. Dialog motion: `kit-dialog-in` rises `--pop-rise` over `--dur-panel` on ease-out. The Enter Rule and the Dialog recipe now say that; the Drawer curve names popovers, not every floating surface.
5. Tooltip: it fades in over `--dur-fade` settling 2px toward its trigger and leaves at once (tooltip-content.svelte). The Enter Rule names it as the one exception, under The Frequency Rule.
6. Permission card shadow: the ask stands inside the composer's grown shape, which carries `shadow-drop`; `shadow-stat` is the stat tile's alone. The vocabulary now says so.
7. Activity dot: deleted in the cut; gone.
8. Vermillion section rule: Files and Caw's panel draw it (`border-brand-solid`). The Coral Is Where You Act Rule now lists it.
9. New-session "dialog" vs "popover": DESIGN.md no longer names the surface; Breakpoints says dialogs become bottom sheets.
10. Toolbar zone and fleet ledger: gone in the cut; the 44px bar is the one bar height.
11. The 11-03 rail: gone in the cut.
