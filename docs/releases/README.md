# Release notes

Every build carries its own notes. A stable release reads `docs/releases/<version>.md`.
A nightly takes them from a file: `bun scripts/release.ts --commit REF --channel nightly
--output /abs/path --notes /abs/notes.md`. Every TestFlight build takes them too:
`apps/apple/scripts/testflight.sh --notes <file>`. To correct a build that has already
shipped, run `testflight.sh --set-notes <build> <file>`.

Write notes for someone who already has CawCo and is updating. Say what changed for them
since the build before, in plain words. Leave out commit ids and file names. Put each change
on its own `- ` bullet line.
