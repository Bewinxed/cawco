"""The envelope every benchmark turn runs in (design B8), one per (cut, arm, run).

- The repo: `git clone --shared --no-checkout` of the session's repo, checked out at the last commit before the cut on
  the session's branch. A clone, not `git worktree add`: a worktree shares the source repo's config, so removing its
  origin would remove the real repo's. Every remote is removed, `core.hooksPath` points at a pre-push hook that records
  the push in calls.jsonl and exits 1, and `GIT_SSH_COMMAND=/bin/false`.
- PATH starts with shims for ssh, scp, sftp, rsync, systemctl, cawco, gh, curl, wget and tailscale (the brief's six plus
  four of the same kind): each records its call in calls.jsonl and exits 1 with "blocked by benchmark".
- The environment is built, not inherited: no SSH agent, no tokens, no CAWCO_* variables, no API key. HOME is the
  run's own (<run>/home, holding only a .gitconfig with the session repo's identity): the owner's rc files prepend
  ~/.local/bin and other prefixes, and any rc-sourced shell (Claude Code's Bash snapshot among them) would otherwise
  resolve cawco and curl past the shims. Programs are found by their real paths, never by a HOME's PATH. The denies
  stay keyed on the real home, since absolute paths still reach it.
- Claude Code runs with `--strict-mcp-config --mcp-config standin.json` (only the stand-in "cawco"),
  `--disallowedTools WebFetch,WebSearch`, and `--settings bench-settings.json`, which sets `"hooks": {}` and
  `"disableAllHooks": true` plus deny rules for the same commands, for edits in the source repo and for reads of the
  credential stores. `"hooks": {}` alone does not stop user-scope hooks (settings merge; see README), so
  `disableAllHooks` is set too, and every turn's stream is checked for a hook event.
- `--dangerously-skip-permissions` is used only inside this envelope. Deny rules still apply in that mode
  (code.claude.com/docs/en/permissions: "Rules are evaluated in order: deny, then ask, then allow").
- Before the first turn, a scripted probe proves the envelope: a `git push` to a scratch bare repo and an `ssh` must
  each leave a "blocked" line in calls.jsonl, and a login shell and an interactive shell must both resolve every
  blocked name to its shim (an rc file that puts ~/.local/bin first would otherwise outrank it). Any failure stops the
  run.
- Every process that has tools runs inside @anthropic-ai/sandbox-runtime (`srt --settings <run>/srt.json -- …`): each
  turn, A1's /compact, and with them the stand-in MCP server and every Bash child. Shims and deny rules match command
  text only; srt is the filesystem and network boundary (Claude Code's docs: to put the tools, processes and commands
  "behind one boundary, run the Claude Code process itself in a container, virtual machine, or the sandbox runtime").
  srt.json follows CawCo's own boundary (agent boundary-policy.ts `srtSettings`): the network reaches api.anthropic.com
  and each --allow-domain only, never a name resolving into private or tailnet space; reads of /tmp, the user's
  runtime dir, ~/.ssh, ~/.config/cawco, ~/.cawco and the account's projects dir (its other sessions) are denied, with
  srt's own temp dir, the resolver files, this run's account dir and its own project dir, the run dir and the bench read
  back; writes only in the run dir and the account dir.
  `allowAllUnixSockets` because srt's seccomp helper cannot start on this host (srt #428/#429); sockets are hidden by
  path, abstract ones cut off by srt's network namespace. srt starts with an allowlisted environment (no CAWCO_*, no
  tokens, no SSH agent) and its own short TMPDIR under /run/user/<uid>/bench-srt (its proxy socket is there; a socket
  path is capped at 108 bytes); the command inside gets the run's own tmp as TMPDIR.
- Before the first turn, a preflight runs inside that exact envelope (preflight.sh → preflight.json): loopback and
  tailnet hub, a write to ~, the user's systemd bus, the git-credential socket, ~/.ssh and the other accounts must all
  be refused; a write in the run dir and an HTTPS answer from api.anthropic.com must work. Anything else stops the run.
"""
import json
import os
import re
import shutil
import subprocess
import sys

import common
import sim

BLOCKED = ["ssh", "scp", "sftp", "rsync", "systemctl", "cawco", "gh", "curl", "wget", "tailscale"]
KEEP_ENV = ["USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "SHELL", "TZ"]  # HOME is the run's own
SHIM = """#!/bin/sh
exec {py} -I -c 'import json,sys,time
open(sys.argv[1],"a").write(json.dumps({{"ts":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"via":"path shim","cmd":sys.argv[2],"argv":sys.argv[3:],"blocked":True}})+"\\n")
sys.stderr.write(sys.argv[2]+": blocked by benchmark\\n")
sys.exit(1)' {calls} {name} "$@"
"""
PRE_PUSH = """#!/bin/sh
{py} -I -c 'import json,sys,time
open(sys.argv[1],"a").write(json.dumps({{"ts":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"via":"pre-push hook","cmd":"git push","argv":sys.argv[2:],"blocked":True}})+"\\n")' {calls} "$@"
echo "git push: blocked by benchmark" >&2
exit 1
"""
# Per-session leftovers Claude Code writes under its config dir (core paths.ts, the entries a session owns).
SESSION_LEFTOVERS = [("dir", "tasks"), ("dir", "file-history"), ("dir", "session-env"), ("dir", "uploads"),
                     ("file", "debug", ".txt"), ("prefix", "todos", "-")]
# agent boundary-policy.ts DENIED_RESOLVED_ADDRESSES: private ranges, the tailnet's CGNAT range, IPv6 unique-local
DENIED_RESOLVED_ADDRESSES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7"]
UID = os.getuid()
SRT = {"srt": None, "rg": None, "allow_domains": [], "hub_url": None, "tmp_root": f"/run/user/{UID}/bench-srt",
       "git_socket": f"/run/user/{UID}/cawco/git-credential.sock", "dry": False,
       "sandbox_root": os.path.expanduser("~/.worktrees/bench")}


def configure(**kw):
    """run.py's flags: --srt, --rg, --allow-domain, --hub-url, --srt-tmp-root, --git-credential-socket, --dry."""
    SRT.update({k: v for k, v in kw.items() if v is not None})


def _host_bin(name):
    """A program's real path on the host, never a shim (the preflight tests the sandbox, not the shims)."""
    path = shutil.which(name, path="/usr/local/bin:/usr/bin:/bin")
    if not path:
        raise common.RunStopped(f"preflight: no {name} in /usr/local/bin, /usr/bin or /bin")
    return path


def real_bin(name):
    """A program's real path (symlinks resolved), found once here so nothing inside depends on a HOME's PATH."""
    p = shutil.which(name)
    return os.path.realpath(p) if p else None


def _tool_dirs():
    """PATH after the shims: the real dirs of git, python3, node and bun (node also runs srt's own script), then the
    system's. Real dirs, so a dir a symlink lives in (~/.local/bin, which holds cawco too) is never on PATH. Claude is
    run by its real path and needs no PATH entry."""
    dirs = []
    for name in ("python3", "git", "node", "bun"):
        p = real_bin(name)
        if p and os.path.dirname(p) not in dirs:
            dirs.append(os.path.dirname(p))
    return dirs + [d for d in ("/usr/local/bin", "/usr/bin", "/bin") if d not in dirs]


def _names(path):
    """A directory's entry names as the host sees it; None when the bench itself cannot list it."""
    try:
        return set(os.listdir(path))
    except OSError:
        return None


def purge_slugs(wt):
    """purge_names for the clone at `wt` and every subfolder of it (a session's cwd can be one)."""
    enc = common.encode_project_dir(os.path.realpath(wt))
    home = os.path.expanduser("~")
    names = set()
    for root in [os.path.join(home, ".claude", "projects")] + [
            os.path.join(home, ".cawco", "accounts", x, "claude", "projects")
            for x in (_names(os.path.join(home, ".cawco", "accounts")) or ())]:
        names |= {n for n in (_names(root) or ()) if n == enc or n.startswith(enc + "-")}
    purge_names(sorted(names))


def purge_names(slugs):
    """A run's project dirs, everywhere CawCo spreads them, gone. Claude Code makes `projects/<slug>/memory` for a
    session's project, and the agent links it in every account dir to one shared copy under ~/.claude/projects (agent
    accounts.ts `linkProjectMemory`). A run's slug is its sandbox path, which the next draw's run of the same
    <cut>-<arm>-<run> name reuses, and Claude Code loads that memory's MEMORY.md into the session: left in place, one
    run's notes would open another's context. The 2026-10-17 smokes left two such memories, and 178 empty project dirs
    in each of the seven accounts. Only names under the bench's own sandbox root ever reach here."""
    home = os.path.expanduser("~")
    roots = [os.path.join(home, ".claude", "projects")] + \
        [os.path.join(a, "claude", "projects") for a in
         (os.path.join(home, ".cawco", "accounts", x) for x in (_names(os.path.join(home, ".cawco", "accounts")) or ()))]
    for slug in slugs:
        if not slug.startswith(common.encode_project_dir(os.path.realpath(SRT["sandbox_root"])) + "-"):
            raise common.RunStopped(f"refusing to purge {slug}: not a bench sandbox's project dir")
        for root in roots:
            p = os.path.join(root, slug)
            if os.path.islink(p):
                os.remove(p)
            elif os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)


def _literal(paths):
    return [{"path": p, "literal": True} for p in dict.fromkeys(paths)]


PREFLIGHT = r"""#!/bin/bash
# compaction-bench preflight: runs inside this run's srt envelope, one JSON line per check.
# expect "fail": the sandbox must refuse it; expect "succeed": it must work; "list": the names a denied directory
# shows inside (srt on Linux masks it with an empty mount and binds allowed children back, so a listing works and
# must show only what the run may see; the bench compares it with the host's own listing, taken outside).
check() {{
  local name="$1" expect="$2"; shift 2
  local out code
  out=$("$@" 2>&1); code=$?
  {py} -I -c 'import json,sys; print(json.dumps({{"check": sys.argv[1], "expect": sys.argv[2], "exit": int(sys.argv[3]), "out": sys.argv[4][-300:]}}))' "$name" "$expect" "$code" "$out"
}}
listing() {{
  {py} -I -c 'import json, os, sys
try:
    names, code = sorted(os.listdir(sys.argv[2])), 0
except OSError:
    names, code = [], 1
print(json.dumps({{"check": sys.argv[1], "expect": "list", "exit": code, "entries": names}}))' "$1" "$2"
}}
check loopback-hub fail {curl} -sS -f -m 5 -o /dev/null http://127.0.0.1:3456/
check loopback-hub-noproxy fail {curl} -sS -f -m 5 --noproxy '*' -o /dev/null http://127.0.0.1:3456/
check tailnet-hub fail {curl} -sS -f -m 5 -o /dev/null {hub}
check tailnet-hub-noproxy fail {curl} -sS -f -m 5 --noproxy '*' -o /dev/null {hub}
check home-write fail {touch} {home}/srt-probe
check systemd-bus fail /usr/bin/env XDG_RUNTIME_DIR=/run/user/{uid} DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus {systemctl} --user is-system-running
check systemd-bus-env fail /usr/bin/env XDG_RUNTIME_DIR=/run/user/{uid} DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus {systemctl} --user show-environment
check git-credential-socket fail {py} -I -c 'import socket, sys; s = socket.socket(socket.AF_UNIX); s.connect(sys.argv[1])' {sock}
listing ssh-read {home}/.ssh
{ssh_file_check}
listing other-accounts-read {home}/.cawco/accounts
listing other-sessions-read {projects}
check own-project-read succeed {ls} {own}
check own-project-write succeed {touch} {own}/.bench-preflight-write
check run-dir-write succeed {touch} {base}/preflight-write
check anthropic-https succeed {curl} -sS -m 15 -o /dev/null -w '%{{http_code}}' https://api.anthropic.com/v1/models
"""


class Sandbox:
    def __init__(self, root, name, src_cwd, cut_at, branch, tools_file, role):
        self.base = os.path.join(os.path.abspath(root), name)
        self.src_cwd, self.cut_at, self.branch = src_cwd, cut_at, branch or ""
        self.tools_file, self.role = tools_file, role
        self.wt = os.path.join(self.base, "wt")
        # the run's own HOME: none of the owner's rc files is ever sourced (they put ~/.local/bin and other prefixes
        # ahead of the shims in every login or interactive shell, and Claude Code's Bash snapshot sources them)
        self.home = os.path.join(self.base, "home")
        self.shims = os.path.join(self.base, "shims")
        self.hooks = os.path.join(self.base, "githooks")
        self.tmp = os.path.join(self.base, "tmp")
        self.calls = os.path.join(self.base, "calls.jsonl")
        self.mcp = os.path.join(self.base, "standin.json")
        self.settings = os.path.join(self.base, "bench-settings.json")
        self.srt_json = os.path.join(self.base, "srt.json")
        self.preflight_sh = os.path.join(self.base, "preflight.sh")
        # short and the run's own: srt's proxy socket lives here (sun_path ≤ 108 bytes)
        self.srt_tmp = os.path.join(SRT["tmp_root"], common.hashlib_short(self.base))
        self.session_cwd = None
        self.commit = None

    # ---- build
    def build(self):
        top = common.git(["rev-parse", "--show-toplevel"], self.src_cwd).strip()
        if os.path.commonpath([top, self.base]) == top:
            raise common.RunStopped(f"the sandbox root {self.base} is inside the source repo {top}")
        if os.path.exists(self.base):
            shutil.rmtree(self.base)
        purge_slugs(self.wt)  # no project dir or memory of an earlier run of this name may open this one
        for d in (self.shims, self.hooks, self.tmp, self.home):
            os.makedirs(d)
        # its one file: who commits, from the session's repo as git resolves it there (bench values when unset);
        # core.hooksPath stays in the clone's own config
        ident = {k: common.git(["config", f"user.{k}"], top, check=False).strip() for k in ("name", "email")}
        with open(os.path.join(self.home, ".gitconfig"), "w") as fh:
            fh.write(f"[user]\n\tname = {ident['name'] or 'compaction-bench'}\n"
                     f"\temail = {ident['email'] or 'compaction-bench@localhost'}\n")
        ref = self.branch if self.branch and common.git(["rev-parse", "--verify", "--quiet", self.branch], top,
                                                       check=False).strip() else "HEAD"
        self.commit = common.git(["log", "-1", "--format=%H", f"--before={self.cut_at}", ref], top).strip() or \
            common.git(["rev-parse", ref], top).strip()
        subprocess.run(["git", "clone", "--quiet", "--shared", "--no-checkout", top, self.wt], check=True,
                       capture_output=True, text=True)
        branch = re.sub(r"[^A-Za-z0-9._/-]", "-", self.branch) or "bench"
        common.git(["checkout", "--quiet", "-B", branch, self.commit], self.wt)
        for remote in common.git(["remote"], self.wt).split():
            common.git(["remote", "remove", remote], self.wt)
        common.git(["config", "core.hooksPath", self.hooks], self.wt)
        self._script(os.path.join(self.hooks, "pre-push"), PRE_PUSH.format(py=sys.executable, calls=self.calls))
        for name in BLOCKED:
            self._script(os.path.join(self.shims, name), SHIM.format(py=sys.executable, calls=self.calls, name=name))
        # The one cwd every claude process of this run starts in: the session's real cwd moved into the clone,
        # subfolders included, resolved as the process will see it. Its encoding is the account's projects/<dir>
        # (project_dir), used alike by placement, srt.json, the preflight and teardown.
        rel = os.path.relpath(os.path.realpath(self.src_cwd), os.path.realpath(top))
        cwd = self.wt if rel == "." else os.path.join(self.wt, rel)
        os.makedirs(cwd, exist_ok=True)
        self.session_cwd = os.path.realpath(cwd)
        common.save(self.mcp, {"mcpServers": {"cawco": {
            "type": "stdio", "command": sys.executable,
            "args": ["-I", os.path.join(common.HERE, "standin_mcp.py"), "--tools", os.path.abspath(self.tools_file),
                     "--role", self.role, "--calls", self.calls]}}})
        home = os.path.expanduser("~")
        # The credential files by name, not ~/.cawco whole: Claude Code saves a long tool output under its config dir
        # (~/.cawco/accounts/<id>/claude/projects/…/tool-results) and has the model Read it back.
        deny = ["WebFetch", "WebSearch"] + [f"Bash({c} *)" for c in BLOCKED] + [
            "Bash(git push *)", f"Edit(/{top}/**)", f"Read(/{home}/.cawco/accounts/*/credential.json)",
            f"Read(/{home}/.cawco/accounts/*/claude/.credentials.json)", f"Read(/{home}/.claude/.credentials.json)",
            f"Read(/{home}/.ssh/**)", f"Read(/{home}/.config/gh/**)", f"Read(/{home}/.pi/agent/auth.json)"]
        common.save(self.settings, {"hooks": {}, "disableAllHooks": True, "permissions": {"deny": deny}})
        return self

    @staticmethod
    def _script(path, text):
        with open(path, "w") as fh:
            fh.write(text)
        os.chmod(path, 0o755)

    def envelope(self, config_dir):
        """srt.json and preflight.sh for this run, on this account's config dir."""
        home = os.path.expanduser("~")
        bench = common.HERE
        # the account's other sessions stay unread: its projects dir is denied, this run's own project dir read back
        # (srt binds a read-back only if it exists as srt starts, so it is made now)
        own_project = self.project_dir(config_dir)
        os.makedirs(own_project, exist_ok=True)
        settings = {
            "network": {"allowedDomains": ["api.anthropic.com"] + list(SRT["allow_domains"]), "deniedDomains": [],
                        "deniedResolvedAddresses": DENIED_RESOLVED_ADDRESSES, "allowLocalBinding": True,
                        "allowAllUnixSockets": True},
            "filesystem": {
                "denyRead": _literal(["/tmp", f"/run/user/{UID}", "/run/podman", "/run/tailscale", f"{home}/.ssh",
                                      f"{home}/.config/cawco", f"{home}/.cawco", os.path.join(config_dir, "projects")]),
                "allowRead": _literal([self.srt_tmp, "/run/systemd/resolve/stub-resolv.conf",
                                       "/run/systemd/resolve/resolv.conf", config_dir, own_project, self.base, bench,
                                       os.path.abspath(self.tools_file)]),
                # the run's project dir sits under the read-denied projects dir: srt masks that dir and binds an
                # allowRead child back read-only, so the account dir's write grant does not reach it, and Claude Code's
                # transcript writes there failed with EROFS on the first real smoke. It is granted by name.
                "allowWrite": _literal([self.base, config_dir, own_project]),
                "denyWrite": _literal(["/tmp/claude"])},
            "ripgrep": {"command": SRT["rg"] or "rg"},
            "mandatoryDenySearchDepth": 3,
        }
        common.save(self.srt_json, settings)
        import shlex
        q = shlex.quote
        hub = SRT["hub_url"] or "http://100.64.0.1:3456"
        # What each listing must show inside, against the host's own listing taken here, outside the sandbox. Names
        # stay in memory; preflight.json gets only the host's counts.
        accounts_root = os.path.join(home, ".cawco", "accounts")
        rel = os.path.relpath(os.path.realpath(config_dir), os.path.realpath(accounts_root))
        mine = set() if rel.startswith("..") else {rel.split(os.sep)[0]}
        ssh_dir = os.path.join(home, ".ssh")
        host = {name: _names(path) for name, path in (("ssh-read", ssh_dir), ("other-accounts-read", accounts_root),
                                                      ("other-sessions-read", os.path.join(config_dir, "projects")))}
        own_name = os.path.basename(own_project)
        self.listings = {
            "ssh-read": {"must_show": set(), "must_hide": host["ssh-read"] or set()},
            "other-accounts-read": {"must_show": mine, "must_hide": (host["other-accounts-read"] or set()) - mine},
            "other-sessions-read": {"must_show": {own_name},
                                    "must_hide": (host["other-sessions-read"] or set()) - {own_name}},
        }
        self.host_counts = {k: (len(v) if v is not None else None) for k, v in host.items()}
        # a read of one real file in ~/.ssh must fail; `head -c 0` opens it and prints nothing, so even a leak
        # could never put its contents into preflight.json
        ssh_files = sorted(n for n in (host["ssh-read"] or set()) if os.path.isfile(os.path.join(ssh_dir, n)))
        pick = "config" if "config" in ssh_files else (ssh_files[0] if ssh_files else None)
        ssh_file_check = (f"check ssh-file-read fail {q(_host_bin('head'))} -c 0 {q(os.path.join(ssh_dir, pick))}" if pick
                          else "# the host's ~/.ssh holds no file to try a read of")
        with open(self.preflight_sh, "w") as fh:
            fh.write(PREFLIGHT.format(py=q(sys.executable), curl=q(_host_bin("curl")), touch=q(_host_bin("touch")),
                                      systemctl=q(_host_bin("systemctl")), ls=q(_host_bin("ls")), hub=q(hub),
                                      home=q(home), sock=q(SRT["git_socket"]), base=q(self.base),
                                      projects=q(os.path.join(config_dir, "projects")), own=q(own_project),
                                      ssh_file_check=ssh_file_check, uid=UID))
        os.chmod(self.preflight_sh, 0o755)
        os.makedirs(self.srt_tmp, mode=0o700, exist_ok=True)
        return settings

    def wrap(self, argv):
        """argv as srt runs it: srt's own TMPDIR is set in env(); the command inside gets the run's tmp."""
        if not SRT["srt"]:
            raise common.RunStopped("no --srt: a tool-bearing process never runs outside the sandbox runtime")
        return [SRT["srt"], "--settings", self.srt_json, "--", "/usr/bin/env", f"TMPDIR={self.tmp}"] + list(argv)

    def env(self, config_dir, for_srt=True):
        """The allowlisted environment srt (and, host-side, the probe) starts with: nothing inherited but these."""
        env = {k: os.environ[k] for k in KEEP_ENV if k in os.environ}
        env.update({
            "HOME": self.home,
            "PATH": os.pathsep.join([self.shims] + _tool_dirs()),
            "TMPDIR": self.srt_tmp if for_srt else self.tmp, "CLAUDE_CONFIG_DIR": config_dir,
            "GIT_SSH_COMMAND": "/bin/false", "GIT_TERMINAL_PROMPT": "0",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK": "1",
            "DISABLE_AUTOUPDATER": "1", "DISABLE_AUTO_COMPACT": "1",
        })
        return env

    # ---- the envelope's proof, before any turn
    def probe(self, config_dir):
        env = self.env(config_dir, for_srt=False)
        bare = os.path.join(self.tmp, "probe-remote.git")
        subprocess.run(["git", "init", "--quiet", "--bare", bare], check=True, env=env)
        before = len(common.read_jsonl(self.calls))
        push = subprocess.run(["git", "-C", self.wt, "push", bare, "HEAD:refs/heads/probe"], capture_output=True,
                              text=True, env=env)
        ssh = subprocess.run(["ssh", "-o", "BatchMode=yes", "bench-probe.invalid", "true"], capture_output=True,
                             text=True, env=env)
        lines = common.read_jsonl(self.calls)[before:]
        pushed = [x for x in lines if x.get("cmd") == "git push"]
        sshed = [x for x in lines if x.get("cmd") == "ssh"]
        resolved = {}
        for shell in (["bash", "-l", "-c"], ["bash", "-i", "-c"]):
            p = subprocess.run(shell + ["for c in " + " ".join(BLOCKED) + '; do printf "%s %s\\n" $c "$(command -v $c)"; done'],
                               capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL, cwd=self.session_cwd)
            resolved[" ".join(shell[:2])] = dict(ln.split(" ", 1) for ln in p.stdout.splitlines() if " " in ln)
        leaks = [f"{sh}: {c} → {path or '(not found)'}" for sh, m in resolved.items() for c, path in m.items()
                 if os.path.dirname(path) != self.shims]
        result = {"push_exit": push.returncode, "push_stderr": push.stderr.strip()[-300:], "ssh_exit": ssh.returncode,
                  "ssh_stderr": ssh.stderr.strip()[-300:], "blocked_lines": lines, "shells": resolved, "leaks": leaks,
                  "commit": self.commit, "session_cwd": self.session_cwd}
        common.save(os.path.join(self.base, "probe.json"), result)
        if push.returncode == 0 or not pushed:
            raise common.RunStopped(f"envelope: a git push was not blocked: {push.stderr.strip()[-300:]}")
        if ssh.returncode == 0 or not sshed:
            raise common.RunStopped(f"envelope: ssh was not blocked: {ssh.stderr.strip()[-300:]}")
        if leaks:
            raise common.RunStopped("envelope: a shell resolves a blocked command past its shim: " + "; ".join(leaks))
        return result

    def preflight(self, config_dir):
        """preflight.sh inside this run's exact srt envelope → preflight.json. A refusal that did not happen, or a
        working path that did not work, stops the run. Dry: srt cannot start inside the leaf's boundary (bwrap has no
        user namespace there), so the script is only syntax-checked with `bash -n` and the wrapping argv recorded."""
        argv = self.wrap(["/bin/bash", self.preflight_sh]) if SRT["srt"] else ["(no --srt)", "/bin/bash", self.preflight_sh]
        res = {"argv": argv, "srt_json": self.srt_json, "env": self.env(config_dir), "hub_url": SRT["hub_url"],
               "git_socket_exists_on_host": os.path.exists(SRT["git_socket"])}
        if SRT["dry"]:
            p = subprocess.run(["bash", "-n", self.preflight_sh], capture_output=True, text=True)
            res.update(executed=False, syntax_ok=p.returncode == 0, syntax_err=p.stderr.strip(),
                       listings={k: {"expected_inside": sorted(v["must_show"]), "host_count": self.host_counts[k],
                                     "exercised": bool(v["must_hide"])} for k, v in self.listings.items()},
                       why="dry: srt not executed (bwrap cannot create a user namespace inside the leaf's boundary)")
            common.save(os.path.join(self.base, "preflight.json"), res)
            if p.returncode != 0:
                raise common.RunStopped(f"preflight.sh does not parse: {p.stderr.strip()}")
            return res
        probe_file = os.path.join(os.path.expanduser("~"), "srt-probe")
        existed = os.path.exists(probe_file)
        p = subprocess.run(argv, capture_output=True, text=True, env=self.env(config_dir), cwd=self.session_cwd, timeout=180)
        marker = os.path.join(self.project_dir(config_dir), ".bench-preflight-write")
        if os.path.exists(marker):
            os.remove(marker)
        checks = []
        for ln in p.stdout.splitlines():
            try:
                checks.append(json.loads(ln))
            except ValueError:
                pass
        wrong = [c for c in checks if c["expect"] != "list" and (c["expect"] == "fail") != (c["exit"] != 0)]
        # a listing holds when it shows exactly what the run may see (ssh: nothing of the host's) and none of what the
        # host has besides; it is exercised only where the host has something else to hide
        listings = {}
        for c in (c for c in checks if c["expect"] == "list"):
            spec, seen = self.listings[c["check"]], set(c["entries"])
            leaked = sorted(seen & spec["must_hide"])
            ok = not leaked and (c["check"] == "ssh-read" or seen == spec["must_show"])
            listings[c["check"]] = {"inside": sorted(seen), "expected_inside": sorted(spec["must_show"]),
                                    "host_count": self.host_counts[c["check"]], "exercised": bool(spec["must_hide"]),
                                    "holds": ok}
            if not ok:
                wrong.append({"check": c["check"], "expect": "list",
                              "note": f"inside shows {sorted(seen)}, expected {sorted(spec['must_show'])}"
                                      + (f"; {len(leaked)} of the host's entries leaked" if leaked else "")})
        if not existed and os.path.exists(probe_file):
            os.remove(probe_file)  # it got out of the sandbox: undo the one write it made, and stop below
            wrong.append({"check": "home-write", "note": "the file appeared on the host"})
        for c in checks:  # the inside names are kept in `listings`; the raw rows keep none
            c.pop("entries", None)
        res.update(executed=True, exit=p.returncode, checks=checks, listings=listings, wrong=wrong,
                   srt_stderr=p.stderr.strip()[-2000:])
        common.save(os.path.join(self.base, "preflight.json"), res)
        expected = sum(1 for ln in open(self.preflight_sh) if ln.startswith(("check ", "listing ")))
        if len(checks) < expected:
            raise common.RunStopped(f"preflight: srt ran {len(checks)} checks of {expected} "
                                    f"(exit {p.returncode}): {p.stderr.strip()[-1500:]}")
        if wrong:
            raise common.RunStopped("preflight: the envelope does not hold: " + "; ".join(
                f"{c['check']} (expected to {c.get('expect', 'fail')}, exit {c.get('exit')}: {c.get('out', c.get('note', ''))[-200:]})"
                for c in wrong))
        return res

    # ---- transcripts under the account's config dir
    def project_dir(self, config_dir):
        """The account's projects/<dir> for this run's one cwd: where Claude Code files every session of the run."""
        return os.path.join(config_dir, "projects", common.encode_project_dir(self.session_cwd))

    def transcript_path(self, config_dir, session_id):
        return os.path.join(self.project_dir(config_dir), f"{session_id}.jsonl")

    def place(self, recs, session_id, config_dir, real_cwd):
        """The pre-cut records as session `session_id` working in the sandbox: every `cwd` field rewritten from the
        session's real directory to the sandbox's, `sessionId` to the new id."""
        real = os.path.realpath(real_cwd)
        out = []
        for r in recs:
            r = dict(r)
            if isinstance(r.get("cwd"), str) and os.path.realpath(r["cwd"]) == real:
                r["cwd"] = self.session_cwd
            elif isinstance(r.get("cwd"), str) and r["cwd"].startswith(real_cwd.rstrip("/") + "/"):
                r["cwd"] = self.session_cwd + r["cwd"][len(real_cwd.rstrip("/")):]
            if "sessionId" in r:
                r["sessionId"] = session_id
            out.append(r)
        path = self.transcript_path(config_dir, session_id)
        common.write_jsonl(path, out)
        return path

    def teardown(self, config_dir, session_ids, keep_clone=False):
        """Everything the runs left under the account's config dir, by session id; then the clone."""
        proj = self.project_dir(config_dir)
        for sid in session_ids:
            for p in (os.path.join(proj, f"{sid}.jsonl"), os.path.join(proj, sid)):
                if os.path.isdir(p):
                    shutil.rmtree(p, ignore_errors=True)
                elif os.path.exists(p):
                    os.remove(p)
            for kind, root, *suffix in SESSION_LEFTOVERS:
                d = os.path.join(config_dir, root)
                if kind == "dir":
                    shutil.rmtree(os.path.join(d, sid), ignore_errors=True)
                elif kind == "file" and os.path.exists(os.path.join(d, sid + suffix[0])):
                    os.remove(os.path.join(d, sid + suffix[0]))
                elif kind == "prefix" and os.path.isdir(d):
                    for f in os.listdir(d):
                        if f.startswith(sid + suffix[0]):
                            os.remove(os.path.join(d, f))
        purge_slugs(self.wt)  # the run's project dirs and their linked memory, in every account and the shared copy
        shutil.rmtree(self.srt_tmp, ignore_errors=True)
        if not keep_clone:
            shutil.rmtree(self.base, ignore_errors=True)


def claude_turn(sb, config_dir, session_id, message, model, effort, new_session, log_path, dry, context_tokens=0):
    """One `claude -p` turn in the sandbox; returns the turn's records and requests. Raises RunStopped on: a session it did
    not resume, a server other than the stand-in, a hook event, an error frame, a non-zero exit. In a dry run the real
    command runs against a config dir with no sign-in and must stop at that; sim then writes the turn."""
    path = sb.transcript_path(config_dir, session_id)
    before = len(common.read_jsonl(path))
    claude = os.path.realpath(os.environ["CLAUDE_BIN"]) if os.environ.get("CLAUDE_BIN") else real_bin("claude")
    if not claude:
        raise common.RunStopped("no claude binary found")
    cmd = [claude, "-p", "--output-format", "stream-json",
           "--verbose", "--model", model, "--session-id" if new_session else "--resume", session_id,
           "--strict-mcp-config", "--mcp-config", sb.mcp, "--settings", sb.settings,
           "--disallowedTools", "WebFetch,WebSearch", "--dangerously-skip-permissions"]
    if effort:
        cmd += ["--effort", effort]
    wrapped = sb.wrap(cmd)
    # Dry: srt cannot start inside the leaf's boundary, so the inner command runs as the wrapped one would, with the
    # run's tmp as its TMPDIR; the wrapped argv is recorded. A real run only ever runs `wrapped`.
    argv, env = (cmd, sb.env(config_dir, for_srt=False)) if dry else (wrapped, sb.env(config_dir))
    try:
        p = subprocess.run(argv, input=message, capture_output=True, text=True, cwd=sb.session_cwd,
                           env=env, timeout=int(os.environ.get("BENCH_TURN_TIMEOUT", "5400")))
        out, err, code = p.stdout, p.stderr, p.returncode
    except subprocess.TimeoutExpired as e:
        out, err, code = (e.stdout or "") if isinstance(e.stdout, str) else "", "turn timed out", -1
    with open(log_path, "w") as fh:
        fh.write(out)
    frames = []
    for ln in out.splitlines():
        try:
            frames.append(json.loads(ln))
        except ValueError:
            pass
    init = next((f for f in frames if f.get("type") == "system" and f.get("subtype") == "init"), None)
    hooks = [f.get("hook_name") or f.get("subtype") for f in frames
             if f.get("type") == "system" and str(f.get("subtype", "")).startswith("hook")]
    result = next((f for f in reversed(frames) if f.get("type") == "result"), None)
    errors = [f.get("error") for f in frames if f.get("type") == "assistant" and f.get("error")]
    # A failed /compact still ends in `result: success`; only its status frame says it failed.
    errors += [f"compaction failed: {f.get('compact_error')}" for f in frames
               if f.get("type") == "system" and f.get("compact_result") == "failed"]
    check = {"cmd": wrapped, "executed": argv, "srt": not dry, "env_keys": sorted(env), "exit": code, "init_session": (init or {}).get("session_id"),
             "mcp_servers": (init or {}).get("mcp_servers"), "hooks": hooks, "errors": errors,
             "result_text": ((result or {}).get("result") or "")[:300], "stderr": err.strip()[-1500:]}
    if init is None:
        raise common.RunStopped(f"claude did not start the session (srt and claude output): {(err or out).strip()[-1500:]}")
    if init.get("session_id") != session_id:
        raise common.RunStopped(f"placement: claude ran session {init.get('session_id')}, not {session_id}")
    servers = {s.get("name"): s.get("status") for s in init.get("mcp_servers") or []}
    if servers != {"cawco": "connected"}:
        raise common.RunStopped(f"envelope: MCP servers {servers}, expected only the stand-in cawco connected")
    if hooks:
        raise common.RunStopped(f"envelope: hooks fired: {hooks}")
    recs = common.read_jsonl(path)
    if dry:
        signed_out = errors == ["authentication_failed"] or (
            len(errors) == 1 and errors[0].startswith("compaction failed") and "Not logged in" in errors[0])
        if not signed_out:
            raise common.RunStopped(f"dry: expected the missing sign-in to stop the call, got {check}")
        common.write_jsonl(path, recs[:before])
        summary, scope = common.live_scope(recs[:before])
        held = common.requests_of(scope)
        size = common.prompt_tokens(held[-1]) if held else int(len(summary or "") * sim.CPT)
        sim.write_turn(path, session_id, sb.session_cwd, model, message,
                       "compact" if message.startswith("/compact") else "turn", max(context_tokens, size))
        recs = common.read_jsonl(path)
    elif code != 0 or errors or (result or {}).get("is_error"):
        tail = "\n".join(json.dumps(r)[:400] for r in recs[-5:])
        raise common.RunStopped(f"turn failed (exit {code}, errors {errors}): {check['result_text'] or check['stderr']}\n"
                                f"JSONL tail:\n{tail}")
    turn = recs[before:]
    if not turn:
        # a turn that ran but left nothing in its transcript (a write the sandbox refused, or a session filed
        # elsewhere) has nothing to judge or price: it stops here rather than passing as done
        raise common.RunStopped(f"the turn wrote nothing to {path} (exit {code}): {check['result_text'] or check['stderr']}")
    reqs = common.requests_of(turn)
    if message.startswith("/compact") and not reqs:
        # The compaction's own request writes no assistant record; the turn's result frame is its only account
        # (`modelUsage`, one entry per model, each the compaction call on that model).
        check["usage_from"] = "result frame modelUsage (the compaction call is not a transcript record)"
        if dry:
            reqs = [dict(sim.request(model, 0, 0), cacheCreation=max(context_tokens, size), output=9000)]
        else:
            # `modelUsage` is the session's running total, and a resumed session starts from the transcript's last
            # `cost-state` record (observed on Claude Code 2.1.309: A0 and A1 of one cut reported the same restored
            # 1,081,133 cache reads). The compaction is that total minus the cost-state before the call, per model.
            # The frame's own `usage` is all zeros for a /compact, so it carries no 1-hour split.
            base = next(((r.get("modelUsage") or {}) for r in reversed(recs[:before]) if r.get("type") == "cost-state"), {})
            check["usage_baseline"] = {m: {k: u.get(k, 0) for k in ("inputTokens", "cacheCreationInputTokens",
                                                                      "cacheReadInputTokens", "outputTokens")}
                                       for m, u in base.items()}
            at = common.ts_ms(common.now_iso())
            reqs = []
            for m, u in ((result or {}).get("modelUsage") or {}).items():
                b = base.get(m) or {}
                d = {k: (u.get(k, 0) or 0) - (b.get(k, 0) or 0) for k in
                     ("inputTokens", "cacheCreationInputTokens", "cacheReadInputTokens", "outputTokens")}
                if any(v < 0 for v in d.values()):
                    raise common.RunStopped(f"/compact usage: modelUsage for {m} is below its cost-state baseline: {u} vs {b}")
                if any(d.values()):
                    reqs.append({"id": f"compact:{m}", "model": m, "at": at, "input": d["inputTokens"],
                                 "cacheCreation": d["cacheCreationInputTokens"], "cacheWrite1h": 0,
                                 "cacheRead": d["cacheReadInputTokens"], "output": d["outputTokens"]})
    return {"records": turn, "requests": reqs, "check": check, "transcript": path}
