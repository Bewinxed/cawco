# Project paths

A research and decision page for the projects redesign (October 2026), and the
animated mockups made for it. Every mockup is a standalone fragment, so the
same pieces can go into launch videos, the landing page (`site/`) and docs.

- `index.html` — the built page. Open it in a browser. Inside a claude.ai
  artifact, picks save to the artifact; opened from disk they stay in the
  browser's local storage.
- `page.tpl.html` — the page source, with `{{MK:<name>}}` and `{{DG_<name>}}`
  placeholders.
- `mockups/<name>.html` — one animated mockup each (see the list below).
- `diagrams.json` — the vertical diagrams the page reuses.
- `base.css` — the page's tokens and shared classes, for previewing and
  recording a mockup on its own.
- `caw/` — Caw stills as small WebP files, light and dark, cut from
  `assets/mascot/stills/`.
- `CONTRACT.md` — the rules every mockup follows (tokens only, motion only
  while on screen, a complete still state, reduced motion respected).

## Rebuild

```sh
python3 mocks/project-paths/build.py
```

## Preview or record one mockup

Both use the repo's `playwright-core`. Set `CHROMIUM` to a Chromium binary if
Playwright cannot find one.

```sh
bun mocks/project-paths/preview.mjs board            # PNGs at 1000px light and 360px dark, in out/
bun mocks/project-paths/preview.mjs board --reduced  # the still state
bun mocks/project-paths/record.mjs board --seconds 12 --size 1080x1080 --scale 2
bun mocks/project-paths/record.mjs xphone --dark --size 1080x1920
```

`record.mjs` writes `out/<name>-<light|dark>.webm`: the mockup centred on the
page background, playing its loop from the start. Convert with ffmpeg for the
landing page or an editor, for example
`ffmpeg -i out/board-light.webm -c:v libx264 -pix_fmt yuv420p board.mp4`.
`out/` and the `_preview-*` / `_record-*` harness files are scratch.

## Using a mockup elsewhere

A mockup is a `<style>`, one root `<div class="mk mk-<name>">` and an optional
`<script>`. It needs the colour and font tokens from `base.css` (the same
values as `design/tokens/cawco.tokens.json`) and the shared `.mkf`, `.mkchip`
and `.mkphone` classes. It animates only while its root has `is-live`; add
that class (and dispatch `mk:live`) when it scrolls into view, as `index.html`
does with an IntersectionObserver.

## Mockups

| Name | Shows |
| --- | --- |
| places | One project, many places: checkouts, workspace, hub folder |
| board | Task board; a task lands and unblocks the next |
| attempts | Task drawer; continue a warm session or start a new attempt |
| thread | Talking to Caw, the project lead, in a thread |
| fleet | Fleet watch: detector, triage, needs-you row |
| delegates | Delegate group, landing queue, one report |
| roles | Interactive: the tools each session role sees |
| memory | Curator proposals into project memory |
| brandkit | A knowledge project's brand kit being read |
| routines | Routines with countdown and run history |
| inbound | Inbound events, matched or dropped |
| telegram | Project topics on a phone (Telegram is pending) |
| skills | `/to-tickets` output becoming linked tasks |
| scope | Project skills reaching every place |
| xsetup | X example: setting up a project by talking to Caw |
| xvoice | X example: "which sounds like you?" voice rounds |
| xboard | X example: posts crossing the board |
| xphone | X example: approving drafts in the iOS app |
| xreply | X example: replies only to mentions, drafter cannot post |
| xloop | X example: weekly recap to playbook to next draft |
| pdelegates | Project delegate types as files; Jev routes a task to a type |
| stages | Project stages on fixed kinds: board, calendar and pipeline views |
| canvas | Design canvas: variants from any tool, a pin to the session, a pick |
| bridge | Choices and dials inside a preview, kept in the hub and read by the session |
| threads | Comment threads on a preview: pin, send, the session changes code and resolves |
