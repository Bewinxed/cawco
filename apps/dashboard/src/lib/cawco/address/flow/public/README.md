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
carries: its alpha dilated 4px at 512 (the width that matches dark-ready's
rim best, intersection over union 0.986 against light-ready's) filled with
the rim's own colour (243, 239, 229), the day drawing laid over it
(`flow/caw/*-night.png`). Made here, not in Backlot: it is the day take, rimmed.

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
out by a second call, `transparent: true` and no instruction. Each chosen
still is moved sideways so his body's centre of mass stands on the image's
centre, then scaled to 256px (`flow/caw/`). Every chosen take was read for
anatomy (two wings, two feet, one beak, two eyes) before it was kept.

| Moment | Still | Operation | Take |
| --- | --- | --- | --- |
| Start | `start.png` | wing on the right raised in a small wave | `tk_Lh_9EsTY5NmG9VDuW635o` |
| Waiting for your sign-in | `waiting.png` | eye and beak turned up, far off | `tk_6zq-7V8OSdazXXQXDQRA8`, cut out of `tk_xZq25__jh1FzKwGg4TQWS` |
| Waiting for your admin (Headscale) | `admin.png` | envelope added at his feet, head down to it | `tk_yUlIbqRJw6oM4IuSfK8xW`, cut out of `tk_cF3LTriba7kAWW4o2vNrO` |
| Setup key (NetBird's Start) | `key.png` | key added crosswise in his beak tip | `tk_bUOBAwEywYVHGms25bz7N` |
| Answers (listening) | `listen.png` | wing on the left cupped behind his head | `tk__JarFKdwBni4TyFNcbzxL` |
| Phone, waiting | `phone.png` | phone added at his chest | `tk_Zs1BxX8g0NctuJpYJV_w1` |
| Phone opened it | `phone-up.png` | both wings up holding the phone over his head | `tk_dbecEl2XJEgPbnloaFqQ3`, cut out of `tk_CnlUfCe15R1piBlZBBtSy` |
| HTTPS, asking | `lock-open.png` | open padlock added by his feet | `tk_dUAkjGG-IHWzDboeGSlnt`, cut out of `tk_lFRloYd59d6l3A-QCqvkO` |
| HTTPS on | `lock-shut.png` | closed padlock added, wing tip on it | `tk_SYnHNLadX95wUd32_P0m7`, cut out of `tk_737sowHFPEbZ9o--HnbW_` |
| Live | `live.png` | round post added under his feet, chest out | `tk_NHuDRrZls0P0UDPZoUYub`, cut out of `tk_cIpJuWABOJeLZes_g91vX` |
| Failure | `shrug.png` | wing on the right lifted in a small shrug | `tk_PA0KPZLdqW4Xl917CbARP` |
| Name taken | `shrug-tag.png` | the shrug, a torn luggage tag at his feet | `tk_s97dlUwBXk6HWVwlsBTDj` |
| Signed out | `shrug-hourglass.png` | the shrug, a run-out hourglass at his feet | `tk_XXlG3e5ZQsp8RlNwaQmrd`, cut out of `tk_s81RYHdOVKfhgmUl7Zn0K` |

Passed over in the read: `tk_Qj_odSi8knD6SmR5hTey3` (beak hidden),
`tk_po_BW9xz-0XCMoo5r1F9j` (wing merged into the beak),
`tk_IVQq6fxKr5ZCCaXUo9Gpl` (a brow read as a second beak),
`tk_RxH-IUGlJo1kSw5fq4Q4f` (no beak), `tk_TLca-6JZFcKv8F35tsJ-D` (three
wings), `tk_jYMLTfeF89aKUv07xOdaU` (no beak), `tk_Kpioxs6YI7lP02febuKC2`
(stray boxes), `tk_kEedpi7VSZWv6XzRMN5V6` (opaque ground), and the second take
of the rest. An earlier round written with a keep-line describing Caw
(`tk_cgIXBojVifk_FPQXycJiX` and its siblings) was replaced whole. Each still
has its night version beside it (Day and night, above).
