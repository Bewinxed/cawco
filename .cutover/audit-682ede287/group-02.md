Skills loaded via the Skill tool: `clearshot`, then `interface-craft`. I changed no files and ran no builds. I only checked out `.cutover/audit-682ede287` from `cawco-safe/484c6f7c-audit` to read the captures, and I removed that checkout afterwards. `git status --porcelain` is now empty.

## How I checked
- I read DESIGN.md whole.
- I opened the 1440 light and 390 dark capture of every entry. For the entries with a dark or phone-only problem I did not open the other two captures, so nothing here says whether those also break in 1440 dark or 390 light.
- Pixel boxes are approximate and in each capture's own pixel space.
- Desk captures are not all 1440 wide:
  - `decisions-*`, `new-session-open`, `new-session-used`, `new-session-move`, `project-new` and `session-answered`/`session-attached` are 1212-wide crops.
  - `rail-row-menu`, `project-more-menu` and `rail-sort` are tiny crops of the menu.
- Two spec mismatches with the brief:
  - **4px grid.** DESIGN L469/L635 says the spacing ladder is deliberately not a 4px grid (4, 7, 11, 14, 18, 21, 25, 32), so I did not flag 7/11/14/18 gaps.
  - **Solid-mark rule.** DESIGN.md has no solid-mark rule. L923 still requires Solar duotone status glyphs, so I held status marks to the duotone rule and the 12/16/20px sizes (L924).
- Contrast is judged by eye. I did not measure it.

## Recurring defects (IDs used in the tables)
| ID | Sev | What | DESIGN line |
|---|---|---|---|
| X1 | wrong | **Top-bar glass group is not a capsule.** At 1440 it draws as a white rectangle with square corners, about x1266–1419, y4–40 on `home-*`, `jump-*`, `no-machine-*` and `project-*`. | L755 (top bar trailing edge: capsule of panel glass, concentric) |
| X2 | wrong | **Rail "Working" / "Finished" tabs truncate** as "Worki…" / "Finish…" at the 228px rail, even though 293px (phone) shows them whole. Box about x15–170, y165–190. | L623 (Truncate Inside), L752 |
| X3 | wrong | **Rail "+ Start session" is a pill.** It is fully round, about x18–126, y229–252, in `no-machine-none` and `no-machine-rest`. | L973 (no pill buttons), L677 |
| X4 | wrong | **"Jump to latest" tag floats mid-transcript, not by the composer.** It covers text: `session-answered`-style transcripts, `project-caw` (desk about x1166–1296, y574–602; phone about x130–260, y540–565), and `no-machine-session` (desk about x542–674, y497–525; phone about x130–260, y466–492, over a subagent row's text). | L862 |
| X5 | wrong | **Review (needs-you) board column is a pink or coral wash** with coral-red head ink and a hand glyph. `project-caw`, `project-rest`, `project-details`, `project-forget*` and `project-stages` all show it, about x755–995, y128–890 at 1440. Needs you is spark yellow, and coral is never a status. | L552, L578, L580 |
| X6 | wrong | **Tool-row verb clipped to "R.." on 390.** "Read" truncates while the path stays whole; the subagent "Audit the chip row" shows as "Au…". Seen in `no-machine-session`, `session-attached` and `region-failed-tabs`. Box about x52–70, y320. | L623 (name gives way first, meta keeps a line) |
| X7 | polish | **Heavy dark outline on folder-popover buttons** ("Close", "Browse", "Copy" in `new-session-browse`, `-location`, `-machines-pair`). It is about 2px, not the 1px `border-button-outline`. | L725 |
| X8 | polish | **Coral hairline under the rail's Working/Finished tabs**, full width at y≈194. Coral is for action, selection and focus only. | L580 |
| X9 | polish | **Copy glyphs in menus and the file dialog look solid and darker than their neighbours.** In `rail-row-menu`, "Copy path" and "Copy id" are black. In `project-caw-note` the copy button is solid. Elsewhere glyphs are muted duotone. | L923 |

## Per-entry tables
S = severity; B = blocking, W = wrong, P = polish.

### decisions-graph
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x430–790, y180–780 | Graph fit at 34%: node text is about 4px and unreadable, and 70% of the canvas is empty. | L602 (meta 12px is the floor) |
| W | phone-dark | x100–285, y775–800 | The floating composer bar covers the zoom controls. | L929 |

### decisions-page
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x25–603, y140–350 and y493–645 | Grid cards stretch to the tallest neighbour, leaving 40px of dead space under short cards ("What shape", "Pricing"). | L745 |
| W | phone-dark | x18–372, y735–770 | The last card is cut by the floating bar with no scroll clearance. | L641/L643 |
| P | phone-dark | x24–60, y85–125 | The Caw avatar and ⋯ sit alone on a left-aligned row; Ask Caw and Spin off are dropped. | L633 |

### decisions-rest
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | phone-dark | x18–372, y178–530 | The meta lines "5 of 6 decided · 3 tasks" and "2 of 5 picked" are at the 12px floor but low contrast on the dark card. The small ring and tick glyphs are under 16px. | L924 |

### home-add-machine
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x488–950, y380–470 | The helper copy is meta (12px) in three dense lines under a 36px field. The Close button is raised outline with a heavy edge (X7). | L604 |

### home-connecting
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x228–1440, y44–88 | The error banner is a full-bleed square-cornered pink slab. | L832 (alert is a compact tinted row, 10px radius) |
| W | both | desk x1306–1418, y52–80; phone x256–368, y22–52 | The Retry button shows only a spinner and an empty body. | L731 (a button keeps its label cell) |
| P | phone-dark | x0–390, y0–76 | The banner stacks above the 44px bar and pushes it down. | L755 |
| — | desk | — | X1, X2, X8 also apply. | — |

### home-keychain
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x1112–1406, y92–308 | The "Unlock studio" card has its own hairline and radius inside the popover. The key glyph is a gold hue used as decoration. | L832, L959 |
| P | desk-light | x1124–1394, y185–217 | The input has a 2px ring while its own error and idle edge differ. | L738 |
| — | desk | — | X1 applies. | — |

### home-machines
Clean. Rows, presence dots, ellipsis truncation and the Add machine row all match DESIGN.

### home-reading
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | phone-dark | x378–390, y8–38 | Caw's arcs draw as a yellow dashed square bracket clipped at the screen edge. | L755 |
| — | desk | — | X1, X2, X8 apply. | — |

### home-rest
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | phone-dark | x278–360, y330–345 | The Recent count reads "8 · 2 running" on this capture and "18 · 12 running" on `home-reading`, so the data differs between captures. | — |
| — | desk | — | X1, X2, X8 apply. | — |

### home-unlock-unreadable, home-unlocked, home-unlocking
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | all three desk-light | x1124–1160, y105–135 | The warning, check and spinner glyphs are about 32px. Sizes are 12, 16 or 20. | L924 |
| P | desk-light | x1112–1406, y92–310 | The status card has a hairline border and a different height in each state, so the popover jumps. In `home-unlocking` there is about 100px of dead space between text and Close. | L832 |
| P | `home-unlocking` desk | x1348–1384, y272–290 | "Close" is a bare ghost; "Done" in the sibling states is filled coral. | L725 |

### jump-open
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x0–295, y550–830 | The composer's question card draws over the Jump list. The cards' z-order is wrong. | L703/L707 |
| P | both | e.g. desk x38–265, y150–330 | The meta line has uneven gaps ("Needs you · yours" vs "Idle  · yours" with a double space). | L602 |
| P | phone-dark | x344–360, y44–630 | The row chevrons are 12px with no visible 44px hit zone. | L929 |

### jump-peek
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x0–295, y550–830 | Same z-order overlap as `jump-open`. | L703 |
| P | phone-dark | x38–300, y25–60 | The Sleeping row wraps its meta line to two lines while the others stay at one. | L623 |

### new-session-account
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk and phone | desk y175 and y335, x255–1182; phone y157 and y437, x16–372 | Hatched vertical-tick dividers span the whole dialog. DESIGN uses hatching only in the relay bar. | L683, L772 |
| P | desk-light | x850–870, y510–525 | Probe's limit disc is light grey on white and barely visible. | L923 |
| P | desk-light | x878–1080, y500–585 | The account email and "no reading yet" lines are 11–12px low-contrast grey. | L567 |
| P | phone-dark | x34–370, y515–690 | The popover covers the model list and the dialog footer buttons are 36px tall on touch. | L929 |

### new-session-browse
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x36–362, y790–800 | The "Use this folder" primary is cut off behind the dialog footer. | L929 |
| W | phone-dark | x40–205, y465–485 | The path is set in ~16px mono. Code is 12px. | L610, L619 |
| P | desk-light | x818–900, y383–425 | "chip-tray" crumb looks bold, above weight 500. | L617 |
| P | both | desk x893–972, y340–367 | X7 applies. | — |
| P | both | — | The hatched dividers from `new-session-account` also appear here. | L683 |

### new-session-effort
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x255–1185, y680–742 | About 80px of empty model-list space under the last row. | L836 |
| P | both | — | The hatched dividers from `new-session-account` also appear here. | L683 |

### new-session-insert
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x286–312, y198–224 | The slash-menu skill glyph is amber and decorative. | L959 |
| P | both | — | The hatched dividers from `new-session-account` also appear here. | L683 |

### new-session-location
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | both | desk x883–972, y340–367; phone x272–361, y454–496 | X7 applies. | L725 |
| P | phone-dark | x60–205, y465–485 | The path is ~16px mono, outside the code role. | L610 |
| P | both | — | The hatched dividers from `new-session-account` also appear here. | L683 |

### new-session-machines-pair
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| **B** | phone-dark | x16–390, y172–390 | The first-prompt box overflows the sheet's right edge. Its border is clipped and the folder and persistence chips are gone from the row. | L645, L812 |
| W | desk-light | x268–586, y280–422 | The popover's helper text is 12px meta where body is needed. The curl row truncates with an ellipsis, which is fine. | L604 |
| P | both | — | The hatched dividers from `new-session-account` also appear here. | L683 |

### new-session-move
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x0–390, y0–385 | The move confirmation is a bare sheet with no Close or title header. | L812 |
| P | desk-light | x0–980, y0–284 | The title ellipsizes at 20px and the back chevron is tiny. | L607 |

### new-session-open
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x0–980, y100–230 | The hatched dividers from `new-session-account` appear here. | L683 |
| P | phone-dark | x16–374, y500–610 | The selected Opus row's coral text on dark brown is low contrast. | L539 |

### new-session-permission
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | both | desk x850–1170, y500–730 | The permission-option icon tiles use blue, amber and orange hues as decoration. | L959 |
| P | both | desk x1143–1156, y513–527 | The selected-row check is a small coral disc. | L580 |

### new-session-used
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x328–362, y362–396 | The "+" button drops alone to a third row at the far right. | L911 |
| P | both | desk x353–480, y245–265 | The folder chip text is mono and looks bold. | L617 |

### no-machine-none
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x562–1106, y310–425 | The two choice cards have a hairline edge and very small body text. The page itself is acceptable. | L835 |
| — | desk | — | X1, X3, X8 apply. | — |

### no-machine-rest
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x485–1182, y820–880 | The offline helper line is fine. The Dismiss button is disabled to near invisibility. | L730 |
| — | desk | — | X1, X2, X3, X8 apply. | — |

### no-machine-session
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | both | — | X4 and X6 apply. | L862, L623 |
| P | desk-light | x25–250, y800–820 | "Chip" is cut by the composer with no fade. | L641 |

### not-found-rest
Polish only. X1, X2, X8 apply.

### pairing-rest
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | both | desk x650–790, y510–545; phone x135–256, y478–520 | The code "KWG-VTN" is large mono, with a recess barely visible by day. | L610, L619 |

### pairing-start-failed
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| **B** | phone-dark | x16–390, y415–695 | The dialog overflows the right edge. The error text is cut mid-word, the Close and Copy error buttons run off-screen, and the ✕ is not visible. It should be a bottom sheet under 640px. | L645, L812 |
| W | desk-light | x408–1032, y414–475 | The error sentence is set in mono, a prose sentence outside the code role. | L610, L832 |
| P | desk-light | x854–868, y510–525 | The Copy glyph is solid (X9) and "Close" is a coral primary for a dismissal. | L580 |

### project-caw
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x758–960, y186–290 | The Review column and its card are cut at the Archived lane with no scroll fade. | L862 |
| W | desk-light | x1064–1398, y389–530 | The notice rows use dashed borders, and a stray "Open" label (x1096–1128, y453–468) stands alone. The pink error line is low contrast (about x1087–1347, y521–536). | L683 |
| W | desk-light | x1166–1296, y574–602 | X4 applies: the tag overlaps the thread. | L862 |
| W | phone-dark | x0–390, y725–750 | The last thread message is cut half-way by the composer. | L641 |
| — | both | — | X1, X2, X5 apply. | — |

### project-caw-file
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | phone-dark | x0–390, y0–80 | "cawco" appears twice: in the top bar and as the back link. | L633 |
| P | desk-light | x650–715, y128–890 | The file panel covers the Working column and the Review column vanishes. | L762 |
| — | both | — | X5 applies. | — |

### project-caw-note
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x14–376, y352–490 | A centred floating dialog on a phone. It should be a bottom sheet. | L645, L812 |
| W | phone-dark | x29–360, y430–465 | The mono text is cut at the right edge with no ellipsis or scroll cue. | L623 |
| P | desk-light | x241–1200, y381–520 | It is a flat dialog with a header hairline, not the tray-and-body dialog. The copy glyph is solid (X9). | L809 |

### project-caw-settings
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x0–390, y710–844 | The sheet has no title or Close header and 30px side inset, not 16px. | L812 |
| P | desk-light | x640–1017, y112–218 | The popover is small and tight. | L766 |

### project-details
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x254–764, y133–709 | It is a label-and-value row wall. | L507 |
| P | both | desk x392–525, y329–345; phone x42–176, y453–470 | "Declare where they live" ghost text sits 9px right of the column edge. | — |
| P | desk-light | x249–741, y95–112 | The path link has a visible grey box (hover or focus). | L714 |
| — | desk | — | X5 applies. | — |

### project-forget
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | both | desk x597–727, y679–707; phone x251–381, y746–773 | The destructive verb "Stop 17 and forget" is a solid coral fill. | L580, L729, L805 |
| W | phone-dark | x26–388, y182–780 | The tray's right edge sits 2px from the screen while its left edge is 26px in, and the floating bar covers its bottom edge. | L805, L641 |

### project-forget-reading
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | phone-dark | x297–326, y203–700 | The Working column is clipped to a 14px sliver with no fade. | L862 |
| P | desk-light | x254–265, y131–145 | The reading spinner and line are tiny. | L924 |
| — | desk | — | X5 applies. | — |

### project-more-menu
Polish only. "Other people's repositories" wraps to two lines at about x40–160, y425–465 instead of truncating. Menu items and the destructive Forget row match DESIGN.

### project-new
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x985–1160, y407–692 | The cards run 2–3 lines unevenly. | — |
| P | phone-dark | x14–376, y405–800 | Template cards are 230px tall each, so the page is a very long scroll. | — |
| P | phone-dark | x25–237, y234–352 | The suggestion chips are 30px tall. | L929 |

### project-rest
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x297–326, y178–680 | The Working column is clipped to a sliver. | L862 |
| P | phone-dark | x254–270, y245–440 | The task select boxes are 16px with no visible hit zone. | L929 |
| — | desk | — | X5 applies. | — |

### project-stages
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | both | desk x716–962, y261–600 | The stage flows use text "→" arrows and wrap with an arrow at the line start. | L923 |
| P | desk-light | x757–995, y680–890 | The Review pink fades in a gradient here but is solid elsewhere. | — |

### rail-older
Polish only. X2 applies.

### rail-rest
Polish only. X2 applies. Rows and the status dots otherwise match DESIGN.

### rail-row-hover
Polish only. The preview card (x232–551, y497–593) and ghost are fine. X2 applies.

### rail-row-menu
Polish only. X9 applies, and the "Continue in new session…" label runs within 5px of the menu's right edge at about x45–190, y110–130.

### rail-sort
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | phone-dark | x199–293, y435–610 | The sort menu is clipped by the drawer edge. "Sort sessions by" and the options are cut off with no right padding. | L766 |
| — | desk-light | — | The 193px menu is fine. | — |

### region-failed-tabs
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| **B** | phone-dark | x10–366, y10–92 | The error banner overlaps the top bar. Its text runs over the burger icon at x13–30, y20–33, and Caw's glass overlaps its right side. | L755, L832 |
| W | desk-light | x239–1428, y485–527 | The composer error is a full-bleed saturated spark-yellow slab. Spark means needs-you, and an alert is a compact tinted row. | L552, L832 |
| W | desk-light | x229–1440, y470–720 | The region has a large blank gap between the banner and the stacked transcript. | — |
| W | phone-dark | — | X6 applies. | — |

### session-answered
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| P | desk-light | x44–58, y105–122 | The answered tick is a 14px olive checkbox. | L924 |
| P | phone-dark | x52–300, y198–238 | The question text wraps at 240px with 70px empty on the right. | — |
| P | phone-dark | x340–390, y8–40 | Caw's glass is a square dark block, and the tab strip is clipped under it. | L755 |

### session-attach-menu
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| **B** | desk and phone | the whole capture | Neither capture shows the attach menu. They are 637×28 and 345×27 crops showing only a "Todo write" row and "STEP:chips". The state under audit is not visible, so this entry cannot be judged. `MANIFEST.tsv` says "matches", so the baseline is probably the same broken crop. | — |

### session-attached
| S | Capture | Region | What | DESIGN |
|---|---|---|---|---|
| W | desk-light | x251–383, y727–777 | The chip's ✕ (x368–386, y727–743) collides with the filename, and the chip floats over the code block's bottom edge. | L862 |
| W | phone-dark | x16–148, y725–770 | The chip covers transcript text ("The count badge sits after the label and is cut first") and the ✕ is under 14px. | L929 |
| — | both | — | X6 applies. | — |

## Clean entries
- Clean: `home-machines`.
- Polish only: `project-more-menu`, `rail-older`, `rail-rest`, `rail-row-hover`, `rail-row-menu`, `not-found-rest`, `pairing-rest`.

## Not run
- No build, lint or test, as briefed.
- No contrast measuring; every contrast call is by eye.
- 1440 dark and 390 light were not opened for any entry.
- No live DOM or 44px hit-area check. The hit zones (`.touch-hit`) are invisible in the captures, so "under 44px" calls are drawn-size only.
- `MANIFEST.tsv` was used only to confirm my entries exist; I did not compare against baselines.

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
1. session-attach-menu captures are broken crops: session-attach-menu desk-light is 637x28 and phone-dark 345x27 pixels, showing a Todo write row and STEP:chips text only. The attach menu is not in either capture, and MANIFEST.tsv reports them as matching, so the approved baseline is likely the same broken crop. The probe needs a re-capture with the menu open and a proper clip box.
2. Several desk captures are crops, not 1440 wide: decisions-*, session-answered, session-attached, new-session-move, new-session-open, new-session-used, project-new and the menu entries are partial crops (1212px wide or smaller). The audit's 1440 view does not cover the rail or top bar for those.
3. No solid-mark rule in DESIGN.md: The brief mentions a solid-mark rule for status marks, but the DESIGN.md supplied has none. L923 still requires Solar duotone for status glyphs, so I audited against that.
