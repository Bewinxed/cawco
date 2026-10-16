# Probe review page

How pixel baselines that differ reach the owner: one phone page of a few
decisions, never crops in a folder. `index.html` is backlot's
`scripts/probe-review/index.html`, unchanged; it reads `manifest.json` beside it.

## Make one

```sh
bun scripts/probe-kit/run.ts web tab-strip --review .probe-review/tab-strip
```

When a capture differs from its approved baseline, `--review <dir>` writes
`<dir>/index.html`, `<dir>/manifest.json` and `<dir>/img/`, and prints, per
decision, the `--approve` command its "New look" pick runs. `.probe-review/`
is in `.gitignore`. The parent opens the folder with
`artifact_create(kind: "preview", dir)` and reads the picks with `artifact_read`.

- **One decision per surface**: a capture's name less its viewport and theme
  (`session-card-desk-dark` and `session-card-phone-light` are one surface).
- **Two candidates**: "Approved look" (`keep`, the baseline today) and "New
  look" (`approve`, this run's capture). `recommended` is unset: the owner decides.
- **The same pictures for each**: one per viewport and theme, cut to the region
  that changed with room round it, made jpg for a phone with ffmpeg
  (`scale='min(1024,iw)':-2`, `-q:v 3`). Hold a "New look" picture to see the
  approved one.

## manifest.json

```json
{
  "id": "tab-strip-1760600000000",
  "title": "Tab strip: pixels that changed",
  "decisions": [
    {
      "id": "tab-strip:rest",
      "question": "Tab strip at rest: keep the approved look or take the new one?",
      "approve": { "spec": "tab-strip", "entries": ["rest-light", "rest-dark"] },
      "candidates": [
        {
          "id": "keep",
          "label": "Approved look",
          "result": "What the baseline holds today; the new drawing fails the check until it changes back.",
          "items": [{ "label": "Light", "before": "img/tab-strip-rest-light-approved.jpg", "after": "img/tab-strip-rest-light-approved.jpg" }]
        },
        {
          "id": "approve",
          "label": "New look",
          "result": "What the code draws now; picking it makes this the approved look.",
          "items": [{ "label": "Light", "before": "img/tab-strip-rest-light-approved.jpg", "after": "img/tab-strip-rest-light-new.jpg" }]
        }
      ]
    }
  ]
}
```

`approve` is the probe kit's own field (the page ignores it): the entries a
"New look" pick approves, as `--approve <spec>:<entry>,…` names them.
