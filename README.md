# Caw&Co

Caw&Co (CawCo in the product) is a self-hosted fleet control plane for AI coding agents, for one operator managing their own machines. Its browser dashboard shows which sessions need attention across machines and projects, so you can approve permissions, redirect work, or stop a session without opening every terminal. A daemon runs on each machine and connects to your hub.

## Install

Run this on the machine that will host your hub:

```sh
curl -fsSL https://cawco.dev/install.sh | sh
```

The installer sets up the hub, dashboard, machine daemon, and sessiond process keeper as per-user services. It installs Bun and Node.js if missing, clones this repository into `~/.cawco/app`, installs dependencies, and builds the dashboard. Linux requires systemd; macOS requires Apple's command-line tools and a logged-in desktop session.

On Linux, the installer uses administrator access to install missing prerequisite packages (`git`, `curl`, `unzip`, `bash`, `tar`, `grep`, or `coreutils`) through the system package manager. It also enables lingering for your user when needed, so the services keep running after logout. It prints the administrator commands before running them. If it can't obtain the required access, it stops and tells you what an administrator needs to run. Bun, Node.js, the checkout, and the service definitions stay under your account.

On macOS, missing command-line tools or other prerequisites stop installation with instructions to install them and rerun the installer.

## After install

Open the dashboard URL printed by the installer, normally <http://localhost:3000> on the hub machine. The root opens the Fleet board. Check that the connection is live and your machine is online.

Add a project from the projects rail: name it, choose a machine, and pick its directory. Open the project and start a session with an instruction, or start empty. Review the machine, harness, model, permission mode, rules, and tools before starting. The session's transcript opens as it starts; when it needs permission, read the request and approve or deny it there.

## What it works with

CawCo runs Claude Code, OpenCode, and pi sessions. Keep the hub on your own trusted network or tailnet. Never expose it publicly or port-forward it. CawCo has no sign-in of its own: anyone who can reach the hub can operate the fleet.

## Development

With Git, Bun, and Node.js available, clone the workspace and install its dependencies:

```sh
git clone --depth 1 https://github.com/Bewinxed/cawco.git cawco
cd cawco
bun install --frozen-lockfile
```

Use a machine without an installed CawCo stack running, or stop that stack first to avoid service port conflicts. Start the process keeper in one terminal:

```sh
bun run --filter '@cawco/sessiond' start
```

In another terminal at the repository root, start the hub, machine daemon, and dashboard in development mode. The dashboard's dev server talks only to the hub named in `CAWCO_DEV_HUB_URL` and refuses to start without it:

```sh
CAWCO_DEV_HUB_URL=http://localhost:3456 bun run dev:all
```

Open the dashboard URL Vite prints, normally <http://localhost:3000>.

Build and check the workspace with:

```sh
bun run build
bun run typecheck
bun run lint
```

## Licence

Caw&Co is source available, not open source. The code is under the Apache License 2.0 with the Commons Clause: you may read it, fork it and change it for free. You may not sell it, and that includes paid hosting or support whose value comes from it. See LICENSE and NOTICE.

<https://cawco.dev>
