# Release notes

Every build carries its own notes. A stable release reads `docs/releases/<version>.md`.
A nightly takes them from a file: `bun scripts/release.ts --commit REF --channel nightly
--output /abs/path --notes /abs/notes.md`. Every TestFlight build takes them too:
`apps/apple/scripts/testflight.sh --commit <sha> --notes <file>`. To correct a build that
has already shipped, run `testflight.sh --set-notes <build> <file>`.

What every shipped build came from is recorded as a git tag on its commit: a published
nightly as `nightly-<count>-<commit>` (`release.ts --publish`), a TestFlight build as
`testflight-<ios|mac>-<build>` (`testflight.sh`). The wire check holds every commit's hub
to the newest nightly and to each TestFlight build still installable
(`packages/hub/scripts/shipped.ts`).

Write notes for someone who already has CawCo and is updating. Say what changed for them
since the build before, in plain words. Leave out commit ids and file names: a TestFlight
build's What to Test gets one last line, `Build <n> from commit <sha12>`, from
`testflight.py` itself.

Notes are markdown with up to three sections, in this order, and only the ones that have
something in them:

- `### New`: what the person can do now that they could not before.
- `### Improved`: what they could already do and now works better.
- `### Fixed`: what was broken and now works.

Put each change on its own `- ` bullet line under its section. For example:

```markdown
### New

- Sessions reopen where you left them

### Improved

- Long transcripts load faster
- Fewer hub restarts

### Fixed

- Telegram approvals arrive once
```

The dashboard renders the notes as markdown. Its update notice shows the first section's
first bullets and opens to all of them. TestFlight takes no markdown, so `testflight.py`
turns each heading into a plain line (`New:`) and keeps the bullets.
