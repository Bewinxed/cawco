/**
 * The place guard: a place's own folder watched for writes past what its
 * workspace's policy allows, and the snapshots of the process table its checks
 * read.
 */
import { GUARDED_CONFIG, protectedFindTests } from "@cawco/core/clone-denies";
import { commandLines, processLineage } from "@cawco/core/process-identity";
import { systemProgram } from "@cawco/core/workspace-needs";
import { isPlace } from "@cawco/core/workspace-policy";
import { guardOf } from "./exec";
import { perlQuote } from "./hook-judge";

/** A list of words as perl writes it: each single-quoted (none holds a quote or backslash). */
const perlWords = (words: readonly string[]): string =>
  words.map((word) => `'${word}'`).join(", ");

/** The most names a {@link GUARDED_CONFIG} path has: how far back from each name the guard looks for one. */
const GUARDED_DEPTH = Math.max(
  ...GUARDED_CONFIG.map((path) => path.split("/").length)
);

/**
 * A place's guard (`place-guard.pl before REQ PLACE` before
 * each command, `after REQ PLACE SCRATCH POLICY HOME` once it has run), the
 * executor's on the host ({@link execScript}). A person's own folder gets no
 * stand-ins (never write into a person's own folder), so srt binds only the
 * protected config the place has; what a command makes of the rest is
 * judged here, by the place's real path, once the command and everything it
 * started is over (`LAUNCH`):
 *
 * - A protected entry ({@link GUARDED_CONFIG}, at any depth: never one the
 *   fleet places, which it writes from outside while a command runs) that
 *   is new, by any means (written, `mv`, `ln`, a link), or that changed while
 *   no bind held it, is moved to the place's scratch dir
 *   (`.cawco-moved/<stamp>/<path>`), never deleted, and the command fails
 *   saying so. A repository the command made keeps the `.git/config`
 *   `git init` writes and sample hooks only.
 * - One that changed under its read-only bind (only if a bind failed) is
 *   left, and said with its sha256 before and after.
 * - A link the command made anywhere in the place to protected config
 *   outside it, or into a dot-dir of the home dir, is moved aside the same
 *   way.
 *
 * What the person changes between commands is never looked at. It prints a
 * line per finding (`cawco place-guard: …`) and exits 3 when it moved
 * anything; any other failure refuses the command.
 */
export const placeGuard = (): string => String.raw`use strict;
use warnings;
use Cwd ();
use Digest::SHA ();
use File::Basename ();
use File::Find ();
use File::Path ();
use JSON::PP ();

my %PROTECTED = map { $_ => 1 } (${perlWords(GUARDED_CONFIG)});
my $DEPTH = ${GUARDED_DEPTH};
my @TESTS = (${perlWords(protectedFindTests(GUARDED_CONFIG))});
my %SAFE_GIT = map { $_ => 1 } qw(core.repositoryformatversion core.filemode core.bare core.logallrefupdates core.ignorecase core.precomposeunicode core.symlinks extensions.objectformat extensions.refstorage lfs.repositoryformatversion);

my ($mode, $req, $given, $scratch, $policy, $home) = @ARGV;
my $place = Cwd::realpath($given);
defined $place or die "cawco: the place $given is gone\n";

sub protected_rel {
  my @p = grep { length $_ && $_ ne "." } split m{/}, shift;
  for my $i (0 .. $#p) {
    for my $n (1 .. ($i < $DEPTH ? $i + 1 : $DEPTH)) {
      return join("/", @p[0 .. $i]) if $PROTECTED{join("/", @p[$i - $n + 1 .. $i])};
    }
  }
  return undef;
}

sub find0 {
  open(my $fh, "-|", "find", $place, "-mindepth", "1", @_) or die "cawco: find could not run: $!\n";
  local $/ = "\0";
  my @out;
  while (my $line = <$fh>) { chomp $line; push @out, $line; }
  close $fh;
  die "cawco: find failed in $place\n" if ($? >> 8) > 1;
  return @out;
}

sub protected_now { return find0("-name", "node_modules", "-prune", "-o", @TESTS, "-print0", "-prune"); }

sub file_digest {
  my $digest = Digest::SHA->new(256);
  return eval { $digest->addfile(shift, "b"); $digest->hexdigest } // "unreadable";
}

sub digest_of {
  my $path = shift;
  return "link:" . (readlink($path) // "") if -l $path;
  return file_digest($path) if -f $path;
  return "absent" unless -d $path;
  my @all;
  File::Find::find({ no_chdir => 1, wanted => sub { push @all, $File::Find::name } }, $path);
  my $digest = Digest::SHA->new(256);
  for my $entry (sort @all) {
    my $kind = -l $entry ? "l:" . (readlink($entry) // "") : -d $entry ? "d" : "f:" . file_digest($entry);
    $digest->add(substr($entry, length $path), "\0", $kind, "\0");
  }
  return $digest->hexdigest;
}

my $state = "$req/guard.json";
my $mark = "$req/guard.mark";

if ($mode eq "before") {
  my %snap = map { $_ => digest_of($_) } protected_now();
  my @gits = find0("-name", "node_modules", "-prune", "-o", "-name", ".git", "-type", "d", "-print0", "-prune");
  open(my $out, ">", $state) or die "cawco: $state: $!\n";
  print $out JSON::PP->new->canonical->encode({ protected => \%snap, gits => \@gits });
  close $out or die "cawco: $state: $!\n";
  open(my $m, ">", $mark) or die "cawco: $mark: $!\n";
  close $m;
  exit 0;
}
$mode eq "after" or die "usage: place-guard.pl before|after REQ PLACE [SCRATCH POLICY HOME]\n";

my $before = JSON::PP->new->decode(do { local $/; open(my $in, "<", $state) or die "cawco: $state: $!\n"; <$in> });
my $rules = JSON::PP->new->decode(do { local $/; open(my $in, "<", $policy) or die "cawco: $policy: $!\n"; <$in> });
my %bound = map { $_ => 1 } @{ $rules->{denyWrite} };
my %gits = map { $_ => 1 } @{ $before->{gits} };
my $aside = "$scratch/.cawco-moved/" . time() . "-$$";
my $moved = 0;

sub move_aside {
  my ($path, $rel, $why) = @_;
  my $dest = "$aside/$rel";
  File::Path::make_path(File::Basename::dirname($dest));
  rename($path, $dest) or system(${perlQuote(systemProgram("mv"))}, "--", $path, $dest) == 0 or die "cawco: $rel could not be moved aside: $!\n";
  print STDERR "cawco place-guard: $rel $why, so it was moved to $dest and this command is refused.\n";
  $moved = 1;
}

sub git_config_safe {
  my $file = shift;
  open(my $in, "-|", "git", "config", "--file", $file, "--name-only", "--list") or return 0;
  my @keys = <$in>;
  close $in;
  return 0 if $?;
  chomp @keys;
  return !grep { !$SAFE_GIT{lc $_} } @keys;
}

sub hooks_samples {
  my $dir = shift;
  opendir(my $dh, $dir) or return 0;
  my @bad = grep { $_ ne "." && $_ ne ".." && !/\.sample$/ } readdir $dh;
  return !@bad;
}

sub git_own {
  my ($rel, $path) = @_;
  return 0 unless $rel =~ m{(?:^|/)\.git/(config|hooks)$};
  my $part = $1;
  return $part eq "config" ? git_config_safe($path) : hooks_samples($path);
}

for my $path (protected_now()) {
  my $rel = substr($path, length($place) + 1);
  my $was = $before->{protected}{$path};
  my $now = digest_of($path);
  next if defined $was && $was eq $now;
  if (defined $was && $bound{$path}) {
    print STDERR "cawco place-guard: $rel changed under its read-only bind (sha256 $was before, $now after); it is left as it is.\n";
    next;
  }
  next if git_own($rel, $path);
  move_aside($path, $rel, "is config a host session would load from this folder");
}

for my $link (find0("-name", "node_modules", "-prune", "-o", "-type", "l", "-newer", $mark, "-print0")) {
  next unless -l $link;
  my $target = readlink($link) // next;
  $target = File::Basename::dirname($link) . "/$target" unless $target =~ m{^/};
  my $real = Cwd::realpath($target) // $target;
  next if $real eq $place || index($real, "$place/") == 0;
  my $dotted = index($real, "$home/") == 0 && substr($real, length($home) + 1) =~ m{(?:^|/)\.};
  next unless $dotted || defined protected_rel($real);
  move_aside($link, substr($link, length($place) + 1), "links to $real, config outside this folder");
}

exit($moved ? 3 : 0);
`;

/**
 * The runner's word that its commands run in a place ({@link runnerText}):
 * nothing a command starts outlives it. Set once on the boundary as it
 * starts, by the build that starts it, and read by that boundary's own
 * runner and host, so an older boundary still running reads its own word.
 */
export const PLACE_ENV = "CAWCO_PLACE";

/** A place's guard, written into the boundary's generation dir ({@link placeGuard}); none for a clone. */
export const guardFiles = (id: string, gen: string): [string, string][] =>
  isPlace(id) ? [[guardOf(id, gen), placeGuard()]] : [];

/** One process, as {@link busyOld} reads it. */
export interface Seen {
  readonly command: string;
  readonly pid: number;
  /** Its parent, as `/proc/<pid>/stat` names it, which any process may read. */
  readonly ppid: number;
}

/** Every process on the machine, read once for every workspace {@link busyOld} looks at. */
export const snapshot = async (): Promise<Seen[]> => {
  const [rows, lines] = await Promise.all([processLineage(), commandLines()]);
  const commands = new Map(lines.map((line) => [line.pid, line.command]));
  return rows.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    command: commands.get(row.pid) ?? "",
  }));
};
