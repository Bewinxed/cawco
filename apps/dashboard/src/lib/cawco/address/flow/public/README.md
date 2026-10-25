# Open CawCo by one word: design preview

The word-address flow (design e791c712, §4) as one static page: the tray at
its real size in Caw's Needs you (380, the row growing into it), floating over
Configure › Devices (380, from Set up), and as a 390 phone's bottom sheet, all
three driven by one flow. Above them, the two real forks (the network:
Tailscale, Headscale, NetBird; certificates already on when cawco joins, or
off) and every step and failure to jump to. The trays' own buttons move the
flow on; a waiting state moves on by itself a few seconds later, as the hub
would. Where it stands, and which trays are parked, is kept across a reload.

```sh
python3 -m http.server -d design-previews/address 8080   # any static server on this folder
bun scripts/probe-kit/run.ts address-preview              # the proof (Chromium + WebKit)
```

It is built, not written by hand: the source is
`apps/dashboard/src/lib/cawco/address/flow/` (the flow, its words, the tray,
Caw's still, the three frames and the page; its build config is
`apps/dashboard/scripts/address-preview.vite.ts`), drawn from the dashboard's own
components and stylesheet, and the kept drawing's `motion.ts`, `PhoneQr`,
`Confetti`, `Words`, `preview/AddressRow`, `preview/SettingsRow`, `NETWORKS`
and its words. To rebuild it:

```sh
bun apps/dashboard/scripts/house-faces.ts
cd apps/dashboard && bunx vite build --config scripts/address-preview.vite.ts
```

## Proposed, not in the house yet

- **The QR at 160px.** The report draws the phone step's QR at 160 (§4.2);
  the house token `--c-address-qr` is 112. The preview draws 160 through a
  preview-local value (`flow/proposed.ts`, `PROPOSED_QR`), labelled
  "proposed; the token moves to 160 if picked". With it the phone step stands
  tallest of the flow, as §4.8 has it.
- **Two button words that need WORDS.md's allowlist.** The preview uses the
  allowlisted wording; the owner picks:

  | Where | Allowlisted (drawn) | The report's (needs the verb added) |
  | --- | --- | --- |
  | Start's button | Open Tailscale sign-in | Sign in to Tailscale |
  | Headscale's refusal | Open the command | Show the command |

## Text and Caw

Every word in the tray stands at its one leading edge (`text-align: start`),
titles, lines, failure lines and Show details alike, at desk and phone; only
Caw, the illustration, is centred on the tray's axis.

## Day and night

The page switches Day and Night (the house theme). By night each still is the
same day drawing on the paper rim `assets/mascot/stills/dark-ready.png`
carries, in its colour (243, 239, 229), cut wide enough to read where Caw is
drawn: a 10px disc on the 512 canvas, over one pixel at his 64px box, round
every part of him, wing tips and props included (the drawing's alpha above
32, dilated). Made here,
not in Backlot: it is the day take, rimmed (`flow/caw/*-night.png`, by
`still.py`).

## Caw

Each pose is a Backlot edit (`backlot_edit_image`, `transparent` off) of his
open-eyed source still, `assets/mascot/stills/light-ready.png`, written the
way Qwen's edit-prompt guide asks (QwenLM/Qwen-Image-2.1,
`prompt_rewrite/prompts/system_prompt_edit.txt`): the operation first, naming
which existing part moves from where to where (a prop as Add, with its size
and place), then, verbatim, "Everything else stays exactly as in the input
image: the same character drawn the same way, his proportions, colours and
line, two wings and two feet, and the transparent background." No line
describes Caw himself. Each change is small; the report's §4.4 poses that
needed a large one (sitting, a wing shading the eyes) are drawn as the
nearest small one.

The source went in once (quantised to 64 colours, 10 KB, its error at most 63
of 255 on any channel and 1.2 on average) through a cut-out call with
`transparent: true` and no instruction, `tk_689t8aVLxt1_jA_ojCjfk`; every pose
is an edit of that take. A take that came back on an opaque ground was cut
out by a second call, `transparent: true` and no instruction.

Then two steps, both scripts beside this README:

1. **Measure, then clean** (`halo.py`). An edit can draw a pale sticker
   outline round him that the cut-out keeps. `python3 -I halo.py measure
   take.png` counts the light pixels in the edge band (figure pixels within
   6px of the clear ground); the source cut-out has 335. `python3 -I halo.py
   clean take.png clean.png --source source.png` measures both and, where the
   take's band is over the source's, floods from the clear ground through
   light pixels (and the neutral mid-grey a fringe can start with at its
   outer edge) no deeper than 12px (a pale prop keeps its inside). It then
   clears the violet ground left in small pockets (a patch under 400px of
   light pixels tinted blue over red, as between a wing and the body, or of
   violet, as a boxed edit leaves at its seam) and the soft halo under alpha
   96.
2. **Set** (`still.py clean.png caw/<pose>.png caw/<pose>-night.png`): drawn
   at 0.9 of its size so even a raised wing or a prop stands clear of the
   canvas's edges, its centre of mass on the vertical axis, its lowest pixel
   on the stills' one ground line (232 of 256), scaled to 256px; the night
   twin on its paper rim.

Every chosen take was read for anatomy (two wings at the source's size, two
feet, one beak, the large eye and the small second eye) and for its prop at
64, 80 and 230px before it was kept.

| Moment | Still | Operation | Take |
| --- | --- | --- | --- |
| Start | `start.png` | wing on the right raised in a small wave | `tk_Lh_9EsTY5NmG9VDuW635o` |
| Waiting for your sign-in | `waiting.png` | the wing on the left raised, a telescoping spyglass in its tip (two stepped sections, a dark lens ring and blue glass at the far end) pointing up and away from his face, the eyes and beak clear | `tk_-2oLr5n68t28gYo6fgxna`, cut out of `tk_XhN2KDBEDKEfb9nDKEOCd`, a boxed edit of the sixth round's `tk_ZzaAHdU-GCeRVPEpFt3dy` |
| Waiting for your admin (Headscale) | `admin.png` | a sealed envelope as tall as his legs beside his feet, both wings spread at full size | `tk_IWIJ1Ztgq5HboaC03trRI`, cut out of `tk_tPqt_rXB4bM797tfCxuCE` |
| Setup key (NetBird's Start) | `key.png` | key added crosswise in his beak tip | `tk_bUOBAwEywYVHGms25bz7N` |
| Answers (listening) | `listen.png` | head tilted, three sound lines beside it, both wings as they were | `tk_lxK6PfwZh6bIF4R5tM8-r`, cut out of `tk_Obt9H5MTRapgS4PvX3IiC` |
| Phone, waiting | `phone.png` | phone added at his chest | `tk_Zs1BxX8g0NctuJpYJV_w1` |
| Phone opened it | `phone-up.png` | the wing on the left raises the phone above his head, his beak clear | `tk_AGuufj4nk7qDf0iU-_HXS` |
| HTTPS, asking | `lock-open.png` | an open padlock as tall as his body beside him | `tk_U9eMxK3NlYZSRZBdFjRqH`, cut out of `tk_HzRcQpfvrul1MKlhfdWdr` |
| HTTPS on | `lock-shut.png` | closed padlock added, wing tip on it | `tk_SYnHNLadX95wUd32_P0m7`, cut out of `tk_737sowHFPEbZ9o--HnbW_` |
| Live | `live.png` | a pennant flag raised in the wing on the right | `tk_WuMj02mR4AaQsA96oDFfJ`, cut out of `tk_lwoaQ47LSwLB2MqL7u6Re` |

Every failure is the shrug (both wings lifted to one height, tips up) with a
prop for what went wrong; each instruction opens "Lift both wings a little
out from his sides to the same height, their vermilion tips turned up and
open, as a small shrug." and adds the prop:

| Failure | Still | Prop | Take |
| --- | --- | --- | --- |
| Client stopped | `shrug-plug.png` | a big unplugged power plug hanging on its cord from the wing tip | `tk_Y5k2WWfv5SI-13KXKyPWe`, cut out of `tk_sg27DA3pNkgrKhn8r7-Du` |
| Unsupported network | `shrug-sign.png` | a signpost with two blank arrow boards beside his feet, all in a very thick black outline | `tk_TAF1q3ykp3xLLNzvRvmUj`, cut out of `tk_tIRW0EEoY-2VK-B5yK2n1` |
| Sign-in link expired | `shrug-chain.png` | three big links from the wing tip in a hard, thick outline, spaced apart, the top one tucked behind the wing tip, the bottom one broken open with a wide gap, still on the chain | `tk_N3hxv9nhEAYxaWRn0GQs6`, cut out of `tk_fj510vmz4tlt5GLgrer2V`, boxed edits of the sixth round's `tk_74IrxdQvEPO-QVEhR6rji` (chain, then top links, then the wing tip's edge) |
| Another tailnet | `shrug-map.png` | a big unfolded map beside his feet, a vermilion dashed line winding to an X | `tk_flbuuxUg8rTWt3jYsWwsR`, cut out of `tk_etp6RHQtW8669pB0fUCC0` |
| Admin refused | `shrug-envelope.png` | admin's envelope beside his feet, clear of the wing, a vermilion cross stamped on it | `tk_QT13mHZzGIDUm11bicD9k`, cut out of `tk_uTZ7gwboimz1QN-ERb1W_` |
| Key refused | `shrug-key.png` | a big key standing beside his feet, its bow as wide as his head, the shaft snapped in two | `tk_ydDJMc4ZFhgkYcZbo4cFt`, cut out of `tk_H-UuKYR4R38YOZt_eAm8t` |
| Name taken | `shrug-tag.png` | a large torn luggage tag on a short string from the very tip of the wing, below it, the string clear of the wing | `tk_Sj5xqerS_GnmSZvuyIsx1`, cut out of `tk_ewkCmIATpfrfLPcz5QkT3` |
| Doesn't answer | `shrug-phone.png` | a telephone handset off the hook beside his feet, its coiled cord on the ground | `tk_1VummAUIzs4xJpIuKvDRZ`, cut out of `tk_iB9kgxRDuXXA8pAyOu3YK` |
| Signed out | `shrug-hourglass.png` | a run-out hourglass beside him | `tk_aJfYqQK-FZUnj2jmjQ5Z_`, cut out of `tk_EacCJXTyV-z5D0r1paf7c` |
| Certificates off | `shrug-cert.png` | a certificate with a vermilion seal beside his feet, torn halfway down | `tk_j6s5nj5fgIF3G0zRYUZVN`, cut out of `tk_g6xJgO6hx7ZPQ2OEEklbF` |

Passed over in the read: the third round's spyglass takes that hid the beak
(`tk_qZ7ulJ4sim2F6HtVe-Wt0`, `tk_0dCWGSEJuvS7IgSfOGcE0`,
`tk_dJYFgQLgQUkaXkmKKWnLR`), its phones over the head that hid the beak
(`tk_2Snx0-XuF559f3E-fwAPY`, `tk_1JekkBmlBilha9_cn1gf_`), its posts that the
canvas cut flat (`tk_M9a-RZiZkOaEwpdEHvrad`, `tk_eqChJKg-uMwN7bylIyRsO`,
`tk_KXOjxbY9f4jmVxbnnZp_P`; Live became the flag), and the other takes of each
pose. Earlier rounds (a keep-line describing Caw, `tk_cgIXBojVifk_FPQXycJiX`
and its siblings; and the second round's waiting, admin, listen, phone-up,
live, shrug, tag, padlock and hourglass, which a review found unequal wings, a
second head, a halo, a cut post and props too small at 64px) were replaced.
The fifth round passed over a plug, a chain, two keys and a map too small or
too thin at 64px (`tk_tlrLe6S1n-9oL4oiqAEFv`, `tk_polFvn6CtPthnoQkAPSGq`,
`tk_rLNqmc-aNVzHo-pJpu_Uq`, `tk_bDYh4e-U1ULWxx3GO6sym`, the map
`tk_ey_VHZ1fPj0MXibU65s5B`), keys under a plus that reads as first aid
(`tk_0px8l1cmHId13_tlSZj-T` and its siblings), maps with smaller wings
(`tk_VOTi5Cq9bWRhx4tDK7Xy0`, `tk_CwcmWVTaaOds3mBXuSKRL`), signposts that
dwarf him or cover the wing on the right (`tk_1eePob8jqmc5HHAhSGj4b`,
`tk_8D19fGOTdjF7OWBGZpus5` and their siblings), and a phone and a
certificate held over the wing on the right (`tk_aYAcoziF8yU7thqipL-qc`,
`tk_cd5L-3PiDJ2au86_PCsxP`). The plain shrug went with it: every failure now
has its own prop.

A second anatomy read sent back seven of the fifth round's stills: a
spyglass over the eye and floating free, envelopes over the chest or a wing,
a thin wing under the tag's string, wings left low or unequal under the sign,
the envelope and the phone, and a faint chain whose snapped link floated
loose. The sixth round re-made them, keeping only takes whose two wings
measure alike: the vermilion each side of the body, right over left, within
0.73 to 0.96 where the source gives 0.74 (the envelope's 1.11 counts its red
cross; waiting's 0.50 is the left wing raised and spread to hold the
spyglass, its other wing as in the source). Qwen kept the spyglass at the eye until the instruction placed the
wing tip beside the head with background between it and his face. Passed
over: the spyglasses still at the eye (`tk_AADZshMNWq45IH1hwuyAN` and its
siblings, `tk_G-jkFurQ7awpi4oa54qWM`), chains with no visible break
(`tk_dvY5__w286DNBNwodWtaO`, `tk_JDhvFcE8-7TYZVf4bp0S-`), tags on wings left
low or small (`tk_HvU87Eg5GdIivMKcSmx8I`, `tk_ev2rh5vO3Uifrvf3ksP9c`), and
every shrug whose right wing measured under 0.7 of the left.

A third read passed all seven but found two props that didn't say their
moment at 80px: the spyglass read as a rolled tube, and the chain's break
didn't show. Both were re-made as boxed edits of the kept takes (`box` on the
prop alone, so the wings, their sizes and the rest stay as read), the
spyglass's box at x 0, y 0.06, 0.36 by 0.4 and the chain's at x 0.76, y 0.54,
0.23 by 0.42. A boxed edit can leave the violet ground at its seam;
`halo.py` clears that too. Passed over: slimmer spyglasses and one with a
vermilion blot (`tk_Sc86awxgNLf340ARg30rk` and its siblings), a chain box
that cut into the wing (`tk_0ybkgwV4nIn4sdkI8c8hC` and its siblings), and the
from-source chains, whose wings measured unequal (`tk_FozmJBO0Si1P9-VvVIQuN`
and its siblings).

A fourth read found the chain's top link fading into the wing tip and the
top two links overlapping. Two more boxed edits fixed it without touching
the broken bottom link: the top two links redrawn apart in a hard outline
(box x 0.745, y 0.39, 0.2 by 0.355, feather 4, `tk_NQuohoX4pX3uaBZWCyZKV`),
then the wing tip's edge brought down over the top link (box x 0.76, y 0.39,
0.18 by 0.12, feather 4, `tk_fj510vmz4tlt5GLgrer2V`). A small feather keeps a
boxed edit's seam crisp; the default 16 is what blurred it. Passed over: the
other boxed takes, which kept a fade or added a blot, the full-chain edits of
the kept take, whose break was a hairline or whose broken link fell loose
(`tk_kVxRoBfBxxHD2rU0ew7eL`, `tk_n-LHRc6MsL4Vqf36VFUTh`), and boxed fixes of
the second link's junction, which blurred it (`tk_ifn3qylNuqYmtxdQWziFC` and
its siblings).
