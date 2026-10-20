## Scope and method
- Opened the 1440 light and 390 dark capture of each of the 44 entries in `group-00.txt`, plus `bench-delegate-tray-rest` desk-dark. Not opened: the other 1440 dark and 390 light files, so the theme findings below come from the dark files I opened.
- Board, popover and dialog captures are element crops (boards 1212×856, popovers about 320 wide). Regions are approximate x,y boxes in each file's own pixels. Contrast figures are visual estimates, not measured.
- `config-accounts-key-sent` is not in group 00. My `grep -w` matched it through `config-accounts-key`. I glanced at it but did not audit it.
- DESIGN.md lines 469 and 635 say the spacing ladder (4, 7, 11, 14, 18, 21, 25, 32) is deliberately not a 4px grid. I checked spacing against that ladder, not the 4px grid in the brief.
- The brief's solid, at-least-16px status-mark rule is not in DESIGN.md. Line 923 still says duotone and hue-tinted, and line 924 allows 12px beside meta text. I list small marks as polish (S5) and flag the contradiction under findings.
- No files changed and nothing was built. I unstaged and deleted the fetched `.cutover/` captures from the workspace, so it is clean.

## Shared findings
Cited by id in the tables. S1–S3 appear on every desk capture that has the shell (rail plus top bar).

| id | Sev | Region | What I see | Rule broken |
|---|---|---|---|---|
| S1 | wrong | Top-bar group, x1250–1420, y4–40 on artifact captures; x1298–1420 elsewhere | The trailing group is a flat, square-cornered white slab, not a capsule. | Line 755, Top bar's trailing edge. |
| S2 | wrong | Search glyph, x1313–1327, y15–29; also the model-picker search field | The search icon draws as a solid grey disc with no handle. The folder and machines marks read as one heavy layer. | Line 923, Solar Duotone Rule. |
| S3 | wrong | Rail work tabs, x17–170, y165–190 | "Worki…" and "Finish…" are cut to an ellipsis at the default 228px rail. At 390 the same widget shows "Working" and "Finished" in full. | Lines 603 and 623. |
| S4 | polish | 390 top bar, x372–390, y8–40 | The Caw head is clipped by the screen edge and the attention arcs draw a square yellow dashed box. | Line 755. |
| S5 | polish | Marks about 10–14px: board-card hand/✓, "Failed" badge glyph, "Key sent" tick, notice ✕ | Status marks well under 16px, thin outline ticks. | The brief's solid ≥16px rule; line 924 conflicts. |
| S6 | wrong | `bench-delegate-tray-rest` desk-dark and phone-dark, `bench-session-limit-rest` phone-dark, `bench-usage-limits-rest` phone-dark | The "dark" files show the light palette. | Line 461. |

## Entries

### artifact-comments
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | artifact-comments-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x1155–1413, y108–270 | The Comments popover covers the artifact's title ("Three ways a lon…") and half the first buttons. | Line 885. |

### artifact-in-session
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | artifact-in-session-desk-light.png | shell | S1, S2, S3 | |
| polish | artifact-in-session-phone-dark.png | x7–383, y336–780 | The preview well is an inset boxed card inside the drawer, not on the drawer surface with "no card of its own". | Line 812. |
| polish | same | x340–390, y8–40 | S4 | |

### artifact-pin
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | artifact-pin-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x1092–1370, y130–290 | The pin card covers the page text it is pinned to. | Line 887. |

### artifact-place-pick
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | artifact-place-pick-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x932–1156, y117–315 | The Comments popover sits over the Machine and Folder fields; the title reads "Pick a machine and folde…". | Line 885. |

### artifact-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | artifact-rest-desk-light.png | x1141–1420, y14–42 | The head controls are tiny glyphs at about 22px pitch with a text "Comments" label. | Line 879. |
| polish | artifact-rest-phone-dark.png | x215–375, y12–36 | The head icons are about 14px and 38px apart, with a very low-contrast Close. | Lines 879 and 924. |

### bench-button-pending-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-button-pending-rest-desk-light.png | shell | S1, S2, S3 | |
| polish | same | rows y155–340 | Buttons of mixed heights (24 / 30 / 36 / 44px) sit in uneven rows. Row gaps run from 6px to 50px (y87 to y169). | Line 724 and the spacing ladder. |
| polish | bench-button-pending-rest-phone-dark.png | x25–340, y155–745 | The same mix at 390. "Save key" (24px) sits beside 36px buttons. | Same. |

### bench-caw-notices-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-caw-notices-rest-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x1387–1405, y306–410 | The notice ✕ glyphs are 7–8px, under the 12/16/20 icon sizes, on every row. | Lines 710 and 924. |
| polish | same | x1046–1411, y76–143 | The first ask has a hard 2px vermillion outline that hugs the row edge (likely a focus ring). | Line 927. |
| polish | bench-caw-notices-rest-phone-dark.png | x8–382, y40–608 | The panel's leading margin is about 8px, not 12px. | Line 705. |

### bench-caw-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-caw-rest-desk-light.png | shell | S1, S2, S3 | |
| polish | bench-caw-rest-phone-dark.png | x172–220, y408–446 | "needs-you" breaks at the hyphen across two lines. Loose captions float with no mascot drawn. | Line 843. |

### bench-chosen-hover-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-chosen-hover-rest-desk-light.png | x258–500, y76–125 | The setting chips ("Persistent", "studio") have no chip surface, edge or 30px height. Their chevrons wrap onto a second line, so each chip is about 55px tall. | Line 911. |
| wrong | same | x872–1220, y117–310 | The Preview well's text "Well" has no padding and touches the left edge at x876. | Lines 856 and 886. |
| polish | same | x768–915, y730–890 | The Comments panel has no raised surface or edge. | Line 885. |
| wrong | bench-chosen-hover-rest-phone-dark.png | x28–300, y76–128 | The same chevron wrap on "Persistent" and "studio". | Line 911. |
| polish | same | x39–350, y315–500 | "Well" with no padding against the left edge. | Same. |

### bench-delegate-tray-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-delegate-tray-rest-desk-dark.png | whole image | S6 | Line 461. |
| wrong | bench-delegate-tray-rest-phone-dark.png | whole image | S6 | Line 461. |
| polish | bench-delegate-tray-rest-desk-light.png | x360–1080, y800–830 | The tray chips truncate hard ("Restore …", "Bake the… queued for th…") and are about 25px tall with irregular widths. | Line 623. |
| polish | same | whole image | There is no shell, and user bubbles run the full 1394px width. | Line 641. |

### bench-echo-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-echo-rest-desk-light.png | shell | S1, S2, S3 only. The fixture is otherwise clean. | |
| polish | bench-echo-rest-phone-dark.png | x340–390, y8–40 | S4 | |

### bench-finder-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | bench-finder-rest-desk-light.png | x1366–1426, y12–30 | "Jump ⌘K" is plain text with no keycap. | Line 755. |
| wrong | bench-finder-rest-phone-dark.png | x46–344, y774–826 | The composer is inset about 46px each side. Under 900px it should be full width with 11px margins. | Line 643. |
| polish | same | x216–336, y783–818 | Attach and Send are text buttons, not 34px icon squares. | Lines 392 and 866. |

### bench-folder-proof-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-folder-proof-rest-desk-light.png | x58–680, y232–248 | The Taper, Subtle and Thickness sliders are native browser-blue range inputs. | Line 463; Reserved Hue Rule. |
| wrong | bench-folder-proof-rest-phone-dark.png | x59–215, y185–248 | The same blue sliders. | Same. |
| wrong | bench-folder-proof-rest-desk-light.png | x484–690, y36–60 and y146–170 | Unchosen tab titles are faint grey on the shelf, about 2.5:1 by my estimate. | Lines 585 and 697. |
| polish | bench-folder-proof-rest-phone-dark.png | x322–345, y40–62 | The "+" overlaps the clipped tab text ("Fix tray chip ov+"). | Line 691. |
| wrong | desk | shell | S3 | |

### bench-head-tint-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-head-tint-rest-desk-light.png | x44–58, y160–205 and y395–440 | Tool glyphs (Searched, Read, Edited, bash) all draw neutral grey, not their family hues. | Line 860; lines 575–576. |
| polish | same | x1360–1410, y190, y400, y837 | "1 lines" is a wrong plural, and "+0 −0" is a meaningless diff. | WORDS.md copy. |
| wrong | bench-head-tint-rest-phone-dark.png | x52–300, y243 and y522 | The tool name is cut to "R…" while its long argument stays whole. | Line 623. |

### bench-lift-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-lift-rest-desk-light.png | shell | S1, S2, S3 only. Rows are even at about 43px. | |

### bench-mac-readiness-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | bench-mac-readiness-rest-desk-light.png | x7–847, y7–31 | The fixture state chips are fully round pills. | Line 973. |
| polish | same | x0–1440 behind the dialog | The scrim blur looks much heavier than 2px. | Line 664. |
| polish | same | x887–952, y488–524 | Close is a 36px bottom button, not the 30px ghost icon button at the corner. | Line 809. |
| polish | bench-mac-readiness-rest-phone-dark.png | x7–368, y7–88 | The fixture chips wrap over the top bar. | Line 645. |

### bench-new-session-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-new-session-rest-desk-light.png | x255–1183, y170–181 and y328–341 | Two full-width hatched tick rules (vertical stripes) sit under "First prompt" and above "Model". No hairline recipe draws them. | Lines 683 and 911. |
| wrong | bench-new-session-rest-phone-dark.png | x16–372, y150–163 and y430–443 | The same hatched rules. | Same. |
| polish | same | x343–377, y72–106 | A coral focus ring around Close on open. | Line 927. |

### bench-overlays-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-overlays-rest-desk-light.png | shell | S1, S2, S3 only. | |

### bench-recall-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-recall-rest-desk-light.png | x474–1194, y851–897 | The composer sits about 3px above the bottom edge and is cut off. It should dock 14px above. | Line 643. |
| wrong | bench-recall-rest-phone-dark.png | x11–379, y795–842 | The composer sits about 2px above the bottom edge. | Line 643. |
| wrong | desk | shell | S1, S2, S3 | |

### bench-seed-tabs-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-seed-tabs-rest-desk-light.png | x228–1440, y44–900 | The page is blank: no tab strip, content, skeleton or empty state. | Lines 685 and 841. |
| wrong | bench-seed-tabs-rest-phone-dark.png | x0–390, y44–844 | The same blank page. | Same. |

### bench-session-limit-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-session-limit-rest-phone-dark.png | whole image | S6 | Line 461. |
| wrong | bench-session-limit-rest-desk-light.png | x703–750, y95–105 and x906–970, y95–105 | The Context bar (62% used) and the 5-hour bar (62% left) fill in coral/vermillion as ordinary data. | Lines 580 and 790. |

### bench-traffic-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | bench-traffic-rest-desk-light.png | x246 vs x253, y60–290 | The page head sits at x246 but the empty-state block at x253. | Lines 633 and 835. |
| polish | same | x253–740, y190–290 | The empty state has no action. | Line 839. |
| wrong | desk | shell | S1, S2, S3 | |
| polish | bench-traffic-rest-phone-dark.png | x18–260, y177–205 | The fixture toolbar chips wrap unevenly. | Line 724. |

### bench-updates-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-updates-rest-desk-light.png | x437–455, y350–364; x729–745, y660–673 | The "fleet follows …" tick is a blue disc. | Line 578. |
| wrong | same | x423–1245, y788–825 | The table header reads "Machine / Running / Update" in 12px sentence case on a raised white band. It should be the column-head role (uppercase 13px, 0.06em) on `surface-band`. | Lines 370–376 and 609. |
| wrong | bench-updates-rest-phone-dark.png | x20–390, y105–425 and y445–770 | The outer "Channel cards" container's right edge is off screen. It overflows 390. | Line 645. |
| wrong | same | x56–68, y372–386 | The tick disc is blue. | Line 578. |

### bench-usage-limits-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | bench-usage-limits-rest-phone-dark.png | whole image | S6 | Line 461. |
| polish | bench-usage-limits-rest-desk-light.png | x619–1050, y228–500 | The account cards are recess blocks inside a raised page card (card-in-card). | Line 669. |
| wrong | desk | shell | S1, S2, S3 | |

### bench-usage-relay-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | bench-usage-relay-rest-desk-light.png | x23–116, y762–792 | The "Open usage" label reads tight ("Openusage"). | Line 789. |
| polish | same | x884–1432, y50–74 | The fixture chips are pill-rounded. | Line 973. |
| polish | bench-usage-relay-rest-phone-dark.png | x30–360, y470–506 | "bewinxed @gmail" and "opencode / Go" wrap. | Line 777. |
| polish | same | whole image | The fixture sits on its own Light theme toggle, so the "dark" file is light. | Line 461. |

### board-archive
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-archive-desk-light.png | x527–767, y83–845 | The Review (needs you) column is tinted pink-red with a coral/red heading. Needs you is spark yellow; coral is never a status. | Lines 552, 580, 590. |
| wrong | same | x778–840 | The Done column and the expanded Archived column overlap, and "Done" is clipped with no ellipsis. | Lines 623, 639, 645. |
| polish | same | x36–72, y120–128 | Column sub-labels ("to do", "active", "needs you") are set in JetBrains Mono, which is for code. | Lines 610 and 619. |
| polish | same | x170–230, y240–260; y196–226 | The Failed badge glyph is about 10px; the hand and tick marks are tiny. | Line 750; S5. |
| wrong | board-archive-phone-dark.png | x25–60, y83–122 | The black crow art sits on a near-black page and is almost invisible. | Line 547. |
| polish | same | x25–91, y83–110 | The Ask Caw and Spin off buttons are gone, leaving a lone mascot and ⋯. | Line 633. |

### board-bulk
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-bulk-desk-light.png | x527–767, y83–845 | The same pink Review column. | Lines 552, 580. |
| polish | same | x1148–1190, y83–845 | The collapsed Archived column sets rotated text sideways, and Dropped slides under it. | Line 639. |
| polish | same | x254–730, y799–838 | The selection bar is a near-pill 38px strip with borderless text actions. | Line 973. |

### board-drop
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | board-drop-desk-light.png | x0–320, y0–119 | The ask tile has a title, field and verb but no consequence line and no visible Cancel. The input edge reads as an error. | Line 805. |

### board-filter
Clean. The search field, label and type selects and field/value row match the Select trigger recipe (line 742).

### board-label
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-label-desk-light.png | x12–177, y12–48 | The label control is a native `<select>` with the browser's black ▼ caret. It should be the kit select with its sort-vertical glyph. | Line 742. |
| polish | same | x6–40, y80–160 | The option list is bare text rows with no menu-item look. | Line 791. |

### board-new-task
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-new-task-desk-light.png | x527–767, y83–845 | The pink Review column. | Lines 552, 580. |
| polish | board-new-task-phone-dark.png | x296–315, y145–180 | The next column peeks in with its heading cut mid-letter and no edge fade. | Line 691. |
| polish | same | x25–60, y83–122 | The crow art is nearly invisible on the dark page. | Line 547. |
| polish | same | x258–270, y202–516 | The checkboxes are drawn 16px; I can't see their 44px touch area in the capture. | Line 929. |

### board-rest
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-rest-desk-light.png | x527–767, y83–845 | The pink Review column. | Lines 552, 580. |
| polish | same | x36–72, y120–128 | The mono column sub-labels. | Lines 610, 619. |
| wrong | board-rest-phone-dark.png | x25–60, y83–122 | The crow art is nearly invisible. | Line 547. |
| polish | same | x296–315, y145–180 | The cut-off Working column peek. | Line 691. |

### board-stages-ask
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | board-stages-ask-desk-light.png | x193–293, y776–789 | The verb button of the "Use the Outreach stages?" ask tile is cut by the bottom of the capture. | Line 805. |
| polish | same | x18–300, y85–490 | The seven stage sets are arrow-text chains, not drawn. | Line 507. |

### board-stages
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | board-stages-desk-light.png | x18–300, y85–490 | The same arrow-text chains, with 11–14px gaps between blocks. | Line 507. |

### catch-up-switch
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | catch-up-switch-desk-light.png | x1071–1204, y2–30 | The ink tooltip ("4 need you · 1 notice") is jammed at the top edge and its arrow is cut off. | Line 802. |
| polish | same | x550–665, y255–290 | "Catching up…" is centred mid-screen with a black dot, not at the transcript foot with a live dot. | Line 862. |

### caw-on-decisions
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | caw-on-decisions-desk-light.png | x25–201, y288–378 | The empty state's one action is a 176px tile where the text wraps over four lines, not a button. | Lines 835 and 839. |
| polish | same | x836–1097, y83–104 | The thread row has a dashed outline. | Line 683. |
| polish | same | x1022–1190, y750–825 | The Caw composer has a hard 2px vermillion ring. | Line 927. |
| polish | caw-on-decisions-phone-dark.png | x17–279, y178–197 | The dashed thread row. | Line 683. |

### caw-on-panel
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | caw-on-panel-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x253–800, y150–320 | The empty state has no action beyond the head's Ask Caw. | Line 839. |
| polish | same | x1064–1325, y127–148 | The dashed thread row. | Line 683. |
| polish | caw-on-panel-phone-dark.png | x17–279, y222–242 | The dashed thread row. | Line 683. |

### caw-on-rest
The desk-light capture is pixel-identical to caw-on-panel desk-light, so it has the same findings (S1–S3 and the empty-state and dashed-row rows). The phone-dark differs only in the drawer title row. Its one finding is the same dashed thread row at x17–279, y222–242 (line 683).

### caw-panel-open
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| polish | caw-panel-open-desk-light.png | x57–190, y395–436 | "Runs / Through / Tool" are three label-and-value text rows. | Line 507. |
| polish | same | x57–360, y447–521 | The code block is cut at the right edge with no ellipsis or edge fade. | Line 623. |
| polish | same | x0–155, y548–575 | A white tab with a chevron overlaps the panel's bottom-left. | Line 703. |
| polish | caw-panel-open-phone-dark.png | x57–360, y452–522 | The same cut-off code block. | Line 623. |

### caw-panel-peek
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | caw-panel-peek-desk-light.png | x0–1064, y0–900 | The page behind the peek is washed and heavily blurred, well beyond the 2px scrim. | Lines 505 and 664. |
| wrong | same | x1114–1172, y85–101 | "Needs you" is red text with a red mark. Needs you is attn spark, not crimson. | Lines 552 and 846. |
| polish | same | x1072–1424, y121–204 | The ask band is a saturated square-cornered full-bleed yellow slab. | Lines 832 and 837. |
| polish | same | x1088–1184, y330–343 | "AskUserQuestion" is set in Figtree. Tool names take the code role. | Line 610. |

### config-accounts-account
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | config-accounts-account-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x253–471, y100–125 | Nav rows are about 38px apart, not 40px. | Line 399. |
| polish | same | x664–692, y313–341 | The picked swatch's ring is the swatch's own blue, not the coral selection colour. | Lines 541 and 580. |
| polish | same | x516–643, y860–882 | "Remove account" is plain muted ink, not destructive error-11 text. | Line 729. |
| polish | same | x704–768, y433–463 | The "% of the week" input is empty with no placeholder. | Line 737. |
| polish | config-accounts-account-phone-dark.png | x268–382, y797–833 | The footer buttons overhang the card's right edge by about 10px. | Lines 633 and 643. |

### config-accounts-device-sign-in
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | config-accounts-device-sign-in-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x1051–1389, y209–295 | The popover covers the second machine row's Sign in action. | Line 766. |
| polish | config-accounts-device-sign-in-phone-dark.png | x9–373, y216–303 | The popover covers the "Looks" heading and has unequal side margins (9px / 17px). | Line 645. |
| polish | same | x268–382, y797–833 | The footer overhang. | Lines 633 and 643. |

### config-accounts-fill-first
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | config-accounts-fill-first-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x522–953, y395–508 | The Pinned card leaves about 115px of empty body because the row is equal height. | Line 820. |
| polish | same | x1295–1378, y630–646 | The "resets 1h 13m" highlight is a muddy tan chip, about 4:1. | Line 556. |
| polish | config-accounts-fill-first-phone-dark.png | x277–382, y797–833 | The footer overhang. | Lines 633 and 643. |

### config-accounts-key
| Sev | File | Region | What I see | Rule |
|---|---|---|---|---|
| wrong | config-accounts-key-desk-light.png | shell | S1, S2, S3 | |
| polish | same | x1325–1397, y72–108 vs title y84 | The title and the Cancel button centre about 6px apart. | Line 633. |
| polish | same | x730–1397, y129–377 | A recess card sits on the raised page. | Line 669. |
| polish | config-accounts-key-phone-dark.png | x51–181, y139–156 | The steps "Provider" and "Name it" are unlabelled dots, and the ✓ is about 14px. | Line 590; S5. |

## Clean beyond the shared findings
- `bench-echo-rest`: S1–S4 only.
- `bench-lift-rest`: S1–S3 only.
- `bench-overlays-rest`: S1–S3 only.
- `board-filter`.
- `board-drop` has one polish row and `bench-seed-tabs-rest` is blank, so neither is clean.

## Skills loaded
- `clearshot`
- `interface-craft`

## Not run
- The 1440 dark and 390 light captures, except `bench-delegate-tray-rest` desk-dark.
- No measured contrast.
- No builds.

Nothing pushed: this item lands none.

Commits:
````
(none)
````

Diffstat:
````
(no changes)
````

Findings:
1. DESIGN.md and the brief disagree on status marks: DESIGN.md line 923 (The Solar Duotone Rule) says every status glyph keeps its hue at the default 0.5 duotone, and line 924 allows 12px beside meta text. The brief's new solid, at-least-16px status-mark rule is not in DESIGN.md, so a leaf cannot cite it by line. The doc needs the new rule written in, or the audit rule should be dropped.
2. Brief's 4px grid check conflicts with DESIGN.md: DESIGN.md lines 469 and 635 say the ladder (4, 7, 11, 14, 18, 21, 25, 32) is deliberately not a 4px grid. I audited spacing against that ladder, not a 4px grid.
