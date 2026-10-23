# Probe review page

How captures that differ from their approved baselines reach the owner: one
page, every surface on it, never crops in a folder. `index.html` reads
`manifest.json` beside it.

## Make one

```sh
bun scripts/probe-kit/run.ts web <spec> --review <dir>
```

A capture that differs from its approved baseline FAILs the run. With
`--review <dir>` the run also writes:

- `<dir>/candidates/web/<spec>/<entry>.png`: each new capture at full size, the
  candidate baseline, laid out as `scripts/probe-kit/baselines/` is. The
  approved set is not touched.
- `<dir>/img/`: per capture, the approved baseline, the new capture and
  pixelmatch's picture of what changed, all cut to the same region with room
  round it, made jpg with ffmpeg (`scale='min(720,iw)':-2`, `-q:v 5`).
- `<dir>/candidates/style-snapshot/<surface>.json.gz`: each surface's style
  snapshot as the dashboard reads it now, written by the style snapshot's own
  approve into the candidate folder:
  `PROBE_BASELINES=<dir>/candidates bun scripts/probe-kit/run.ts style-snapshot --approve style-snapshot`,
  then `bun scripts/probe-kit/review.ts <dir>` (the manifest's `style`).
- `<dir>/changed.json`: the run's record, and `<dir>/manifest.json` from it.
- `<dir>/index.html`: this page.

A state with no approved baseline yet is a NOTE in the run and an entry on the
page with no baseline to hold it to.

Which commits on main made each surface's change are the reviewer's finding:
write `<dir>/commits.json`,
`{ "<spec>:<surface>": [{ "sha": "…", "subject": "…", "states": ["rest", …] }] }`,
then `bun scripts/probe-kit/review.ts <dir>` writes the manifest again with them.
A state's candidates are the commits on its files:
`scripts/probe-kit/style-snapshot-coverage.json` lists the states that render
each `.svelte` file (`style-snapshot --coverage`), and
`git log <baseline's commit>..<base> -- <those files>` names what touched them.

The parent opens the folder with `artifact_create(kind: "preview", dir)`.

## The page

- **One section per surface** (the catalogue's surface, `surfaces/catalogue.ts`),
  with every commit that changed it and the states each one changed.
- **Each capture**: approved baseline, new capture, what changed. Hold the new
  capture to see the approved one in its place.
- **One Approve or Reject per surface**: a `data-cawco-choice="<spec>:<surface>"`
  with `data-option="approve"` and `"reject"`, which the CawCo overlay keeps on
  the hub, so `artifact_read` answers the picks in its `state`.

## Approving

Save the page's `artifact_read` answer as JSON, then:

```sh
bun scripts/probe-kit/approve-review.ts <dir> <picks.json>
```

Every approved surface's candidates, its pictures and its style snapshot,
move over the approved baselines; a
rejected or unpicked surface is left as it is. A pick on a surface the
manifest does not hold, or an option other than approve or reject, stops it
before anything moves. `PROBE_BASELINES=<dir>` writes a scratch copy instead.

## manifest.json

```json
{
  "id": "surfaces-4d1159b9a",
  "title": "Surfaces at 4d1159b9a: captures that differ from their approved baselines",
  "base": "4d1159b9a81fafc6cec7dbcd6f81de471f401a58",
  "surfaces": [
    {
      "id": "surfaces:rail",
      "spec": "surfaces",
      "surface": "rail",
      "label": "Rail",
      "commits": [{ "sha": "51a847eed…", "subject": "Stop jobs park on the project's rail row alone; …", "states": ["rest"] }],
      "entries": [
        {
          "entry": "rail-rest-desk-light",
          "label": "rest · desk · light",
          "before": "img/surfaces-rail-rest-desk-light-approved.jpg",
          "after": "img/surfaces-rail-rest-desk-light-new.jpg",
          "diff": "img/surfaces-rail-rest-desk-light-diff.jpg",
          "candidate": "candidates/web/surfaces/rail-rest-desk-light.png",
          "pixels": 5120,
          "size": null
        }
      ]
    }
  ]
}
```

`before` and `diff` are null where no baseline is approved yet; `diff` and
`pixels` are null and `size` says `<baseline> → <capture>` where the size changed.
