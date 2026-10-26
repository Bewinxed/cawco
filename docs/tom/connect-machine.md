# Task & Object Model: bringing a new machine into the fleet

## Product context

One person runs CawCo to keep watch over the AI coding agents working on their own machines: desktops, laptops, home servers, rented boxes, a Mac kept for Apple builds. There is exactly one operator and no team. Day to day they check the fleet from a desk and from a phone, but bringing a machine in is a different kind of moment. It happens a few times over the life of a fleet, sometimes several in one evening when standing up a new box or a fresh VM. It is deliberate setup work at a desk, often with a terminal to that machine open beside the dashboard, and sometimes from a phone when the box is remote and reachable over SSH. The whole thing can take several minutes and can fail for reasons that live on the other machine (no systemd, persistent user services off, SSH forwarding disabled, a changed host key, a Mac that can't reach a local-network address). What the person wants out of it is plain: is it in, and if not, what exactly do I do now. Today they get neither. The progress hangs on one line with no sense of time, the outcome arrives as a raw 90-second timeout, a list of strangers waiting to be admitted shows up in the middle of an add that never needs admitting, and the content shifts and scrolls while they watch it.

## User tasks

### T1. Bring in a machine the hub can sign in to over SSH
- **Trigger:** A new or rebuilt machine exists. The hub's machine can reach it over SSH (same tailnet or LAN, a public box, or an alias already in the hub user's SSH config), and the person would rather not go and run anything on it.
- **Frequency:** rare (inferred: a handful of times per fleet, in bursts while setting up).
- **Success:** The machine is named among the fleet's machines and is online. They got there without a separate approval step: having started the add is all the say-so it takes.
- **Needs:**
  - Say how to reach it: `user@host` or an SSH alias the hub already knows, plus a port only when it isn't 22. What they typed must be checked before anything starts (no spaces, no leading dash, a whole-number port from 1 to 65535).
  - Decide whether the machine already accepts the hub's key. If it doesn't, they type the machine's login password and can count on it serving a single sign-in that plants the hub's key, after which the hub no longer has it. A password with a line break in it is refused before anything starts.
  - When they would rather install the key by hand: see the hub's public key, copy it, and know it goes in `~/.ssh/authorized_keys` for the login user. If the hub has no key at all, learn that and the exact command that creates one on the hub's machine (`ssh-keygen -t ed25519`).
  - Know before starting that they are free to walk away: the work carries on without them.
  - Starting the same machine twice, from this device or another, lands them on the attempt already under way, with its progress so far, never a competing copy.

### T2. Bring in a machine by running one command on it
- **Trigger:** The hub can't sign in to it (a laptop behind NAT, a Mac with Remote Login off, no SSH credentials), or the person is already sitting at that machine's terminal.
- **Frequency:** rare (inferred).
- **Success:** The machine shows up in the fleet online and is recognisably the one they just ran the command on. If the hub requires paired devices, it is in once they let it in (T6).
- **Needs:**
  - The exact command, ready to copy whole, and nothing else to type.
  - Pick which of the hub's addresses the machine should use, because the machine downloads the installer from it and joins through it. They need to know where each address works. A Tailscale IP or Tailscale DNS name works from anywhere on the tailnet. A network interface's IP works only on that LAN. The `.local` name works only for machines on the hub's own network or a multicast-carrying VPN like ZeroTier; a machine coming in over Tailscale or WireGuard won't find it. A Mac given a private LAN address (10.x, 172.16–31.x, 192.168.x) will fail, because macOS blocks background services from local-network addresses, so they should pick the Tailscale address for a Mac.
  - Know what the command will need on the machine: Linux or macOS, x86_64 or arm64, curl, tar and a SHA-256 tool, systemd with persistent user services on Linux, and possibly sudo to install openssl or turn on lingering. When it runs in a real terminal it may ask them questions there.
  - A live sign that the hub is listening for the machine, plus a way to tell when the command has failed or stalled on the machine rather than wait forever. Today nothing comes back from a failed run: the waiting line simply never ends.
  - Know what to expect when the machine already has CawCo. If it already belongs to this hub, running the command again is harmless: the machine's terminal reports the version installed and leaves everything as it was. If it belongs to another hub, the command brings it over to this one.
  - If the hub can't list its addresses, be told so, with what to do next.

### T3. Choose how to bring this machine in
- **Trigger:** The start of every add.
- **Frequency:** rare, once per add (inferred).
- **Success:** They chose the route that works for this machine on the first try.
- **Needs:** The one question that decides it, which is whether the hub can reach the machine over SSH. A plain account of what each route asks of them: SSH needs an address and possibly a password and nothing typed on the machine; the command needs a terminal on the machine and an address the machine can reach. Being able to switch routes without losing what they had already entered. Arriving on the route the entry point implied (several places in the product open the add already pointed at one route).

### T4. Watch an add while it runs and trust that it's moving
- **Trigger:** An add is a multi-minute job: signing in, carrying the hub to the machine, giving it its key, downloading and verifying a signed release, installing, starting the agent, waiting for the hub to see it.
- **Frequency:** constant for the minutes each add lasts.
- **Success:** At any moment they can say what it's doing, what it already did, and whether it's stuck. They stop watching with confidence and come back to an answer.
- **Needs:**
  - The step it is on now in plain words, and the steps already finished.
  - How long the current step has been running. Some waits are known: the agent waits 90 s for the hub to list it, and the hub allows another 15 s after the install exits. A wait that runs past its limit should read as stuck, not as still working.
  - The machine's full output on demand, never in the way.
  - Steady footing: the steps settle in place as they arrive, nothing jumps, and nothing scrolls inside something else.
  - Confidence that looking away costs nothing, plus some word of the outcome when they aren't watching. The project's own rule calls for an out-of-band notice on anything past 10 s; today the hub is only asked while the add is open on someone's display.
  - Only this machine's progress in view. Other machines asking to be let in (T6) are a separate decision that this add will never call for.

### T5. Learn why an add didn't finish, and fix it
- **Trigger:** The add stopped short. Each case has its own cause and its own fix:
  - The machine didn't answer on that address or port: the name didn't resolve, the connection was refused, there was no route, or nothing answered.
  - The machine's SSH host key differs from the one the hub knew. Usually the machine was reinstalled, and the fix is `ssh-keygen -R <host>` on the hub, then try again.
  - The sign-in was refused (wrong password, key not accepted), told in ssh's own words.
  - The machine's SSH server won't carry the hub to it (`AllowTcpForwarding` off), would expose it beyond loopback (`GatewayPorts` on), or another program already holds the port it picked.
  - Handing the machine its key over the hub's connection failed.
  - The installer didn't come through the hub's connection, or this hub is a build with no release-signing key and so has no installer to give out.
  - An installer step failed on the machine: not Linux or macOS, an unsupported architecture, curl, tar, a SHA-256 tool or openssl missing, no systemd, persistent user services off and no way to switch them on without a terminal or sudo, a `cawco` command already there that CawCo didn't put there, a signature or checksum mismatch, no build for this platform.
  - Everything ran, but the hub never saw the machine come online. This is the 90-second timeout the owner hit, and it happens either because the hub wouldn't take the machine's key or because a Mac was given a local-network address.
  - The hub restarted mid-add and lost track of it.
- **Frequency:** rare overall, but frequent for any one add (inferred: the owner's own history shows adds failing more than once in a row).
- **Success:** They know what happened, why, what to do and where to do it (on the hub, on the machine, in the machine's sshd settings), and whether anything was left changed on the machine. They act and try again without retyping anything.
- **Needs:** One plain statement per case following the house error pattern (what happened, why, the fix, what happens next). The exact command to run, copyable, and which machine to run it on. The failing step's last lines of output where they hold the answer. Whether the machine was left untouched (the installer removes what it created when it fails). The details they entered kept, so trying again is one act. For a lost add: whether the machine actually joined, checked against the fleet itself.

### T6. Let in, or turn away, a machine that asked to join on its own
- **Trigger:** The hub requires paired devices, and someone ran the one-line command on a machine. That machine waits, and its own installer says it is waiting to be admitted.
- **Frequency:** rare (inferred). Only on hubs with paired devices required, and only for the command route.
- **Success:** The machine they expect is in, or one they turned away goes quiet and stays quiet. It asks again only if they later bring it in themselves or let it in.
- **Needs:** Which machine is asking (its hostname, the address it called from, when it asked) and enough to judge whether it is the one they just set up. Admit and Deny. Being told if the hub refused their answer. Finding this wherever they are when it happens (the fleet's machine list, the things that need them, device settings), not only inside an add. An add they start over SSH never produces one of these requests.

### T7. Find out whether the new machine can take agents yet
- **Trigger:** The machine has joined. A Mac also needs Xcode, Xcode's terms accepted and two automation permissions before agents can build on it.
- **Frequency:** rare, right after each join (inferred).
- **Success:** They know whether it's ready, or the single next thing to do on that machine.
- **Needs:** The machine's name as the fleet will show it. A verdict: joined, ready for agents. Or the one outstanding item: a permission prompt waiting on the Mac, a prompt that was declined and where to re-allow it in System Settings, Xcode's terms to accept, the Mac locked, the machine gone offline, no Xcode installed (agents can still work there, but not on Apple apps). Knowing they don't have to come back and check: the verdict changes on its own once the Mac is sorted. No daemon reports this yet, so today every machine reads as plain "joined".

### T8. Call off an add
- **Trigger:** The wrong target, it's taking too long, or they changed their mind.
- **Frequency:** rare (inferred).
- **Success:** The hub has let go of the machine, and they know what, if anything, changed on it.
- **Needs:** Whether the add had signed in yet. If it hadn't, they can count on the machine being exactly as it was. If it had, the install may already be part-way in. Confirmation that it has actually stopped, and a refusal explained when it had already ended. Their details kept, so they can start again.

### T9. Get back to an add they walked away from
- **Trigger:** They closed it, reloaded, switched to their phone, or came back later.
- **Frequency:** rare (inferred).
- **Success:** They find the add, running or finished, and its outcome.
- **Needs:** Whatever adds are running or recently finished, found from wherever they are. Today an add lives only in the open dashboard's memory. After a reload it is found again only by starting the same add, and the hub forgets a finished add an hour after it ends. The outcome must hold even when they weren't watching at the moment it settled.

### T10. Bring back a machine that already has CawCo
- **Trigger:** The machine was reinstalled, moved from another hub, its key no longer matches, or it simply dropped out.
- **Frequency:** rare (inferred).
- **Success:** The machine is back in this fleet, answering to this hub and running the same CawCo build as the hub.
- **Needs:** Confidence that re-adding over SSH is safe whatever the machine was attached to before: it ends up attached here. The same expectations for the command as in T2: harmless on a machine already attached here, and a move for one attached to another hub. Being told about the host-key consequence of a reinstall (T5). Recognising the machine as the one already listed, not as a new one. Today's watch for a newcomer never notices a machine that was already in the fleet.

## Objects

### Machine
- **Attributes the person cares about:** name as the fleet shows it (its hostname), how it's reached (SSH target and port, or the hub address it uses), operating system and architecture, online or offline, whether it already has CawCo and for which hub, readiness for agents (Macs), the address it called from when it asked to join.
- **Actions:** bring it in (T1, T2), bring it back (T10), admit or deny it when it asked on its own (T6), see its readiness (T7).
- **Relationships:** belongs to the Fleet once joined. Is the subject of an Add. May be a Join request. Holds a key the Hub gave it, after an SSH add.

### Add (one attempt to bring a machine in)
- **Attributes:** route (over SSH, or by command), the machine it targets, state (running, failed, stopped, done), the step it is on now and the steps finished, time spent on the current step, full output, the Problem if it failed, whether it had signed in, when it started and ended.
- **Actions:** start, watch, stop, try again with the same details, open the output, find it again later.
- **Relationships:** one Machine. Run by the Hub. A given machine and port has at most one Add live at a time, and whoever starts another is taken to that live one. Ends in a Problem or a joined Machine. Lost if the hub restarts mid-run, forgotten an hour after it ends.

### Problem (why an add didn't finish)
- **Attributes:** kind (didn't answer, host key changed, sign-in refused, forwarding refused or exposed or port taken, key hand-over failed, installer didn't arrive, installer step failed, never came online, lost by a hub restart), the step it happened on, the cause in plain words, the fix and where it is done (hub, machine, the machine's sshd settings), the exact command if there is one, the relevant output, whether the machine was left unchanged.
- **Actions:** read it, copy the fix, try again.
- **Relationships:** belongs to one Add.

### Hub
- **Attributes:** its name, the addresses it can be reached on, its SSH public key (or the lack of one), whether it requires paired devices, its version and channel, whether it can hand out an installer at all (only a build carrying the release-signing key can).
- **Actions:** give out its key, give out the command for an address, run an SSH add, be told to forget an old host key (done by hand on its own machine).
- **Relationships:** owns the Fleet. Runs Adds. Receives Join requests.

### Hub address
- **Attributes:** kind (Tailscale IP, Tailscale DNS name, a network interface's IP, the `.local` name), the URL, where it works (the whole tailnet, one LAN, the hub's own network or a multicast VPN), and the macOS local-network caveat.
- **Actions:** choose it for the command route.
- **Relationships:** belongs to the Hub. Is baked into the Install command. Unused by an SSH add, which carries its own path to the hub.

### Install command
- **Attributes:** the one line, the address inside it, what it needs on the machine.
- **Actions:** copy it, run it on the machine.
- **Relationships:** made from one Hub address. Produces either a Join request or a joined Machine.

### Hub's SSH key
- **Attributes:** the public key line, or its absence.
- **Actions:** copy it to install by hand, have the hub install it with a one-time password, create one on the hub if missing.
- **Relationships:** belongs to the Hub. Ends up trusted by a Machine.

### Join request (a machine waiting to be admitted)
- **Attributes:** hostname, the address it called from, when it asked.
- **Actions:** admit, deny.
- **Relationships:** comes only from the command route on a hub that requires paired devices. Admitting turns it into a fleet Machine. After a Deny the person hears nothing more from that machine unless they themselves bring it in or let it in later.

### Readiness (for agents)
- **Attributes:** verdict (ready, or the single outstanding thing), the instruction for the machine, whether it is still being checked.
- **Actions:** none here. The person acts on the machine; the verdict follows without them asking.
- **Relationships:** belongs to a joined Machine. Only Macs have outstanding items.

### Fleet
- **Attributes:** the machines in it and their liveness.
- **Actions:** the final arbiter of whether an add worked: the machine is listed and online, or it isn't.
- **Relationships:** gains a Machine when an Add finishes or a Join request is admitted.

## Constraints

- **Platforms:** the web dashboard on desktop, with phone widths (under 640 px) as a first-class case. The native iPhone and Mac app also starts SSH adds over the same hub routes, and a frozen TestFlight build (20261018) reads them. That is why the hub's add requests and replies keep their current shape, including properties nobody reads any more.
- **Design system is law:** DESIGN.md and the token source `design/tokens/cawco.resolver.json`; no colour, type, spacing, radius, shadow, curve or duration outside it. Every icon is Solar bold-duotone. Indigo is never a brand hue. The action colour is graphite. The PRD at `.design-foundations/plans/2026-10-06-projects.md` and JOURNEY.md govern structure.
- **Copy:** DESIGN.md's Voice section governs. Errors follow what happened → why → fix → what next, with no "We", no blame and no bare error code. Action labels are verb + object from the allowlist. Terms: machine (never "host" in copy), fleet, admit and Deny for a self-joined machine (never "approve"), pair and paired device, "the .local name" in prose, build.
- **Accessibility:** WCAG 2.2 AA. 44×44 targets on coarse pointers. Text inputs at 16 px or more on phones, with iOS paste and hold-to-select working inside sheets. State never shown by colour alone. Live announcements for progress and refusals. Reduced motion respected.
- **Feedback rule (JOURNEY.md):** anything over 10 s gets step-and-count progress, an out-of-band notice and a clearly offered way to interrupt. A bare spinner is never enough.
- **Security:** a typed password exists only for the length of one sign-in; no record, log or output ever holds it. The hub is never publicly bound. Whoever starts an SSH add has already vouched for that machine, so no admit decision ever follows one (decided and shipped). The hub's tunnel refuses to expose itself beyond the machine's loopback.
- **What the person can already count on (decided and shipped):**
  - Starting an add for a machine that is mid-add lands them on the live attempt; two never run side by side.
  - Walking away, closing the dashboard or switching devices doesn't pause or cancel an install.
  - An SSH add of a machine that already has CawCo, attached to any hub or none, leaves it attached to this hub and on the hub's build.
  - Turning a machine away is final until they themselves bring it in or let it in; it doesn't keep asking.
- **Hub facts:** adds live in the hub's memory and are gone after a hub restart. A finished add is readable for one hour. Up to 2000 lines of output are kept per add. The agent waits 90 s to be listed and the hub allows 15 s after the install exits. A hub without the release-signing key has no installer to give out.
- **Owner's direction:** no scrolling inside the add's own container, and no layout shifting. Built from scratch, not a reskin of today's dialog. Grounded in the "Family" and Benji Taylor guidelines and in "the new mockup stuff" from 10-21.
- **Example hosts:** the owner's own servers never appear as examples; any example uses a neutral host such as `build-01.example.net`.

## Open questions

1. **The "new mockup stuff we talked about yesterday" and the Family/Benji guidelines:** which material is this? The interaction patterns (e.g. Family's tray-style step-through) are a design concern, but the owner may expect them to shape how the steps of an add are paced. Unresolved from the inputs.
2. **Out-of-band word when an add finishes or fails:** a push to the iPhone app, a "needs you" item, a fleet-level notice, or none? Nothing does this today, and the JOURNEY.md rule for long waits asks for it.
3. **Finding a running or recent add after a reload or on another device:** the hub has no list of adds. Should one exist, or is the fleet's machine list (showing an "adding…" machine) where this lives?
4. **The command route has no failure signal.** The hub only learns of success. Should the hub watch for the machine's installer fetch, or for a machine that called in and then went quiet, so a stalled or failed command run can be told apart from one not yet run? The inputs are silent.
5. **Matching the command run to its machine:** today the first new online machine counts, whatever it is. On a busy fleet, or when the machine already existed (T10), this misattributes or never fires. Is a per-command token wanted?
6. **What a stopped add leaves on the machine after sign-in.** The installer removes its own files when it exits with an error, but whether that holds when the hub's watchdog kills it from outside wasn't proven from the code.
7. **The phone as a place to add machines:** the SSH route is plausible from a phone. The command route needs a terminal on the target, so on a phone it is mostly copy-and-send. Is phone support for the command route a requirement or a courtesy? (Inferred: the SSH route matters more on the phone.)
8. **Persistent user services off with no sudo over SSH:** the installer can't ask for sudo without a terminal, so an SSH add fails and tells them to run `sudo loginctl enable-linger <user>` on the machine. Should the add offer to run it with the password they already gave, or is fixing it by hand the intended path? (Proposal territory, not a change.)
9. **Today's descriptive text is wrong about what the install does.** It says it "installs Bun, clones CawCo"; the installer actually downloads a signed binary release and needs no Bun, Node or git. The new copy should describe the real installer. Flagged as a fact, not a guess.
10. **Frequency figures are inferred.** No source states how often the owner adds machines. The repeated failures in their messages suggest retries per add are common.
11. **The owner's pasted "stuck on checking for systemd…" step** doesn't match the current installer, whose systemd check prints nothing unless it fails. That suggests the stuck line came from an older build, or from the step before it with no signal of elapsed time. Whether silent checks should get their own step lines is open.

## Ranking (frequency × consequence)

1. **T4: Watch an add while it runs and trust that it's moving.** It happens throughout every add, and it is where the owner's anger sits: a hang with no time cue, shifting layout, inner scrolling, unrelated admit requests mixed in.
2. **T5: Learn why an add didn't finish, and fix it.** It happens on most adds at least once, and a dead end here means the machine never joins. The 90-second timeout is the owner's live case.
3. **T1: Bring in a machine over SSH.** It is the main route, and wrong inputs or an unclear password story cost the whole add.
4. **T2: Bring in a machine by running one command.** It is the only route for machines the hub can't reach, and a wrong address choice (the Mac on a LAN address) fails silently from the dashboard's side.
5. **T6: Let in or turn away a self-joined machine.** It is rare, but it is a security decision about who gets onto the fleet, and it must never be mixed into an SSH add.
6. **T9: Get back to an add they walked away from.** Installs run for minutes and the person is free to leave. Losing the outcome undoes the trust that freedom was meant to buy.
7. **T3: Choose how to bring this machine in.** It happens once per add. A wrong choice costs one failed attempt.
8. **T7: Find out whether the new machine can take agents yet.** It happens once per join, matters for Macs, and costs a confused first session if missed.
9. **T10: Bring back a machine that already has CawCo.** It is rare, and its hazards (host key, an unnoticed rejoin) are mostly covered under T5.
10. **T8: Call off an add.** It is rare, and the consequence is bounded once the person knows whether sign-in happened.
