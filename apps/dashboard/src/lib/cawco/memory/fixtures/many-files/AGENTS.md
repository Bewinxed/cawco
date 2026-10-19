# cockpit

How this project is worked on.

## Notes

- Previews bind on the hub's address only, never the machine's tailnet address.
- The scratch hub's ports are picked outside the kernel's ephemeral range.
- No unit tests; proof is build, lint, type-check and the live check.
- Every user-facing string comes from WORDS.md.
- Design tokens come from design/tokens/cawco.resolver.json.
