# Hooks

Scripts in this directory are Claude Code hooks. They are **not installed** by
default — each one documents the `settings.json` stanza needed to enable it.

## delegate-nudge.ts

A `PreToolUse` hook for `Bash` that counts consecutive read-only exploration
commands (grep, rg, find, cat, head, tail, ls, jq, awk, wc, sqlite3, sed -n,
git log/grep/show) and nudges the model toward `mcp__cawco__delegate` after
5 and 10 consecutive hits. Non-read-only commands reset the counter. The hook
never blocks or denies a command — it only injects advisory context.

State lives in `/tmp/cawco-delegate-nudge/` keyed by session id.

### Enable

Add the following to `~/.claude/settings.json` (or the project's
`.claude/settings.json`) under the `"hooks"` key:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bun run /absolute/path/to/cockpit/scripts/hooks/delegate-nudge.ts"
          }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/cockpit` with the actual path to this repository.

### Disable

Remove the `PreToolUse` entry above from `settings.json`, or remove just the
inner hook object from the `hooks` array if other PreToolUse hooks exist.
