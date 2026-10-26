/**
 * CawCo's guard around every fleet hook Claude Code runs, the fleet's own in
 * `~/.claude/settings.json` and a project's in a session's flag settings
 * (claude.ts `sessionSettingsOptions`). In a workspace session a hook's
 * input rewrite is dropped: the boundary judged the call as the model asked
 * it, and "When multiple `PreToolUse` hooks return `updatedInput` to rewrite
 * a tool's arguments, the last one to finish takes effect"
 * (code.claude.com/docs/en/hooks-guide), so a rewrite would run a call the
 * boundary never judged. The hook's deny, ask and context still count.
 * Anywhere else the guard is the hook itself.
 *
 * A command hook runs as a shell-form command, `perl <guard> '<line>'`, so in
 * a workspace session it goes through the session's shell prefix, inside the
 * boundary, where `CAWCO_WORKSPACE` names the workspace. An HTTP hook runs as
 * an exec-form command on the host, `perl <guard> --http <url>`, which posts
 * the event with curl where Claude Code itself would have, and knows a
 * workspace session by its CLI's `CLAUDE_CODE_SHELL_PREFIX`. A project's
 * copy, which CawCo hands each session as it starts, says `--drop` itself.
 * The script is written into the fleet's hooks dir by each fleet sync
 * (fleet.ts `syncHooks`), which every workspace reads.
 */
import { join } from "node:path";
import type { HookCommandHandler, HookHandler } from "@cawco/core";
import { fleetHooksDir } from "@cawco/core/paths";
import { systemProgram } from "@cawco/core/workspace-needs";
import { shellQuote } from "./boundary";

/** The perl the guard runs on: the one every boundary's runner runs on (boundary.ts), on the agent's PATH. */
const perl = (): string => systemProgram("perl");

/** Where the guard is written. */
export const hookGuardFile = (): string =>
  join(fleetHooksDir(), "cawco-hook-guard.pl");

/** A command handler's command line: its exec form quoted word by word, else its shell form as written. */
export const commandLineOf = (handler: HookCommandHandler): string =>
  handler.args?.length
    ? [handler.command ?? "", ...handler.args].map(shellQuote).join(" ")
    : (handler.command ?? "");

/** The guard's source, run as `perl guard`, so it names no interpreter. Core perl modules only: every boundary has them. */
export const HOOK_GUARD_SOURCE = `# CawCo's guard around a fleet hook (agent fleet-hook-guard.ts). Do not edit:
# each fleet sync writes it again.
#
#   perl guard [--drop] '<command line>'   a command hook
#   perl guard [--drop] --http <url>       an HTTP hook, posted with curl
#
# In a workspace session (--drop, CAWCO_WORKSPACE or CLAUDE_CODE_SHELL_PREFIX)
# an input rewrite (updatedInput) is dropped from what the hook answers; its
# exit status, deny, ask and context are kept. Anywhere else a command hook
# runs as itself.
use strict;
use warnings;

my $drop = 0;
if (@ARGV && $ARGV[0] eq "--drop") { $drop = 1; shift @ARGV; }
$drop ||= (($ENV{CAWCO_WORKSPACE} // "") ne "" || ($ENV{CLAUDE_CODE_SHELL_PREFIX} // "") ne "");
my $url;
if (@ARGV && $ARGV[0] eq "--http") { shift @ARGV; $url = shift @ARGV; }
my $line = shift @ARGV // "";

exec("${systemProgram("sh")}", "-c", $line) or die "cawco: the fleet hook could not be started: $!\\n"
  if !$drop && !defined $url;

my $pid = open(my $from, "-|") // die "cawco: the fleet hook could not be started: $!\\n";
if ($pid == 0) {
  if (defined $url) {
    exec("curl", "-sS", "-X", "POST", "-H", "Content-Type: application/json",
      "--data-binary", "\\@-", "-w", "\\n%{http_code}", $url);
  } else {
    exec("${systemProgram("sh")}", "-c", $line);
  }
  die "cawco: the fleet hook could not be started: $!\\n";
}
for my $signal (qw(TERM INT HUP)) {
  $SIG{$signal} = sub { kill $signal, $pid; exit 128 + 15; };
}
my $out = do { local $/; <$from> } // "";
close($from);
my $status = $?;
my $code = ($status & 127) ? 128 + ($status & 127) : $status >> 8;

if (defined $url) {
  my ($body, $answer) = $out =~ /\\A(.*)\\n(\\d{3})\\z/s;
  if ($code != 0 || !defined $answer || $answer < 200 || $answer > 299) {
    print STDERR "cawco: the hook's POST to $url answered " . ($answer // "nothing") . "\\n";
    exit 1;
  }
  $out = $body;
  $code = 0;
}

print($drop ? guarded($out) : $out);
exit $code;

# The answer without its input rewrite: Claude Code reads stdout as JSON only
# when it is JSON, so words that do not parse rewrite nothing and pass as
# they are. One that names a rewrite and cannot be read here (no JSON::PP) is
# refused rather than let through.
sub guarded {
  my ($text) = @_;
  return $text unless $text =~ /updatedInput/;
  my $json = eval { require JSON::PP; JSON::PP->new->canonical };
  if (!$json) {
    return '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"cawco: a fleet hook answered with an input rewrite this workspace could not read, so the call was refused."}}';
  }
  my $parsed = eval { $json->decode($text) };
  return $text unless ref $parsed eq "HASH";
  my $specific = $parsed->{hookSpecificOutput};
  if (ref $specific eq "HASH") {
    delete $specific->{updatedInput};
    delete $specific->{decision}{updatedInput}
      if ref $specific->{decision} eq "HASH";
  }
  return $json->encode($parsed);
}
`;

/**
 * The handler Claude Code registers for a fleet hook: a command hook as a
 * shell-form command through the guard, an HTTP hook as an exec-form
 * command through it (its `if`, timeout and status message kept), and any
 * other as it is. `drop` says the session is a workspace's, for a project's
 * copy handed to one session; the fleet's own, registered once for every
 * session, leave it to the guard to tell.
 */
export const guardedHandler = (
  handler: HookHandler,
  drop: boolean
): HookHandler => {
  const flags = drop ? ["--drop"] : [];
  if (handler.type === "command") {
    const { args: _args, command: _command, ...rest } = handler;
    return {
      ...rest,
      command: [perl(), hookGuardFile(), ...flags, commandLineOf(handler)]
        .map(shellQuote)
        .join(" "),
    };
  }
  if (handler.type === "http") {
    const { url, type: _type, ...rest } = handler;
    return {
      ...rest,
      type: "command",
      command: perl(),
      args: [hookGuardFile(), ...flags, "--http", url],
    };
  }
  return handler;
};
