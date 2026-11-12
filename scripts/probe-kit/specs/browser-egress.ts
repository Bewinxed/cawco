/**
 * The browser container has the internet whenever its machine does, from
 * the moment it starts, whatever order the machine booted in: the rules
 * that decide it, read without a runtime (agent browser/egress.ts).
 *
 * The owner's case (obelisk-of-light, rootless Podman 5.7 with pasta): every
 * page failed with DNS_PROBE_FINISHED_NO_INTERNET while the machine reached
 * the internet. The browser stood on the `cawco-media` bridge, in the
 * user's one rootless namespace, which pasta made at boot before Wi-Fi had
 * a default route and never refreshed.
 *
 * - (a) `hasDefaultRoute` over `/proc/net/route`: a table with an up default
 *   route holds one; a header alone, a table of on-link routes of a bridge
 *   and a LAN with none default (the boot state pasta copied), and a default
 *   row without the up flag hold none.
 * - (b) `placementOf`: rootful Docker, rootless Docker, rootful Podman,
 *   rootless Podman 4.9 on slirp4netns, rootless Podman 5.2 on pasta and
 *   rootless Podman 5.7 on pasta in a VM keep the media network; rootless
 *   Podman 5.3 and 5.7 on pasta, native, give a namespace of its own.
 * - (c) `startAgainDue`: unrouted to routed, a resolver changed while
 *   routed, and the machine's address changed while routed start it again;
 *   routed to unrouted, unchanged, a resolver changed while unrouted, and no
 *   kept network do not.
 * - (d) `relayUrlsFor` on the relay's own machine with
 *   `host.containers.internal` gives the one UDP URL through it.
 * - (e) `followNetwork` with a reader going unrouted then routed and two
 *   live records, one started unrouted and one started routed: it starts
 *   again exactly the one that started unrouted, once, however many
 *   readings and sweeps follow.
 * - (f) `machineNetworkOf` reads the default route's interface's IPv4
 *   address and the first nameserver.
 *
 *   bun scripts/probe-kit/run.ts browser-egress
 */
import type { MachineNetwork } from "../../../packages/agent/src/browser/egress";
import type { BrowserKey } from "../../../packages/core/src/browser";
import type { Kit, Spec } from "../kit";

/** How often the follower in (e) reads its fake machine. */
const POLL_MS = 20;

const HEADER =
  "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT";

/** A `/proc/net/route` row. */
const row = (
  iface: string,
  destination: string,
  gateway: string,
  flags: string,
  metric: number,
  mask: string
): string =>
  [iface, destination, gateway, flags, 0, 0, metric, mask, 0, 0, 0].join("\t");

/** wlan0 routed through 192.168.1.1, beside its LAN and a container bridge. */
const ROUTED = [
  HEADER,
  row("wlan0", "00000000", "0101A8C0", "0003", 600, "00000000"),
  row("wlan0", "0001A8C0", "00000000", "0001", 600, "00FFFFFF"),
  row("podman1", "0058A80A", "00000000", "0001", 0, "00FFFFFF"),
].join("\n");

/** The boot state: routes on a bridge and a LAN, none default. */
const ON_LINK_ONLY = [
  HEADER,
  row("wlan0", "0001A8C0", "00000000", "0001", 600, "00FFFFFF"),
  row("podman1", "0058A80A", "00000000", "0001", 0, "00FFFFFF"),
].join("\n");

/** A default row whose up flag is off (flags 0x2, RTF_GATEWAY alone). */
const DEFAULT_DOWN = [
  HEADER,
  row("wlan0", "00000000", "0101A8C0", "0002", 600, "00000000"),
].join("\n");

/** A runtime as `placementOf` reads it. */
const runtime = (
  kind: "docker" | "podman",
  version: string,
  rootless: boolean,
  ownNetwork: boolean,
  rootlessNetwork?: "pasta" | "slirp4netns"
) => ({
  kind,
  version,
  rootless,
  ownNetwork,
  ...(rootlessNetwork ? { rootlessNetwork } : {}),
});

const spec: Spec = {
  group: "The hub and machines",
  name: "browser-egress",
  run: async (kit: Kit) => {
    const egress = await import("../../../packages/agent/src/browser/egress");
    const { relayUrlsFor } =
      await import("../../../packages/agent/src/browser/relay-urls");
    const { followNetwork } =
      await import("../../../packages/agent/src/browser/browsers");
    const { hasDefaultRoute, placementOf, startAgainDue, machineNetworkOf } =
      egress;

    // (a)
    kit.check(
      "(a) a table with an up default route holds one",
      hasDefaultRoute(ROUTED)
    );
    kit.check("(a) a header alone holds none", !hasDefaultRoute(HEADER));
    kit.check(
      "(a) on-link routes of a bridge and a LAN, none default (the boot state), hold none",
      !hasDefaultRoute(ON_LINK_ONLY)
    );
    kit.check(
      "(a) a default row without the up flag holds none",
      !hasDefaultRoute(DEFAULT_DOWN)
    );

    // (b)
    const bridged = {
      "rootful Docker": runtime("docker", "28.3.0", false, true),
      "rootless Docker": runtime("docker", "28.3.0", true, true),
      "rootful Podman": runtime("podman", "5.7.0", false, true),
      "rootless Podman 4.9 on slirp4netns": runtime(
        "podman",
        "4.9.3",
        true,
        true,
        "slirp4netns"
      ),
      "rootless Podman 5.2 on pasta": runtime(
        "podman",
        "5.2.5",
        true,
        true,
        "pasta"
      ),
      "rootless Podman 5.7 on pasta in a VM": runtime(
        "podman",
        "5.7.0",
        true,
        false,
        "pasta"
      ),
    };
    for (const [name, one] of Object.entries(bridged)) {
      kit.check(
        `(b) ${name} keeps the media network`,
        placementOf(one) === "media-network",
        placementOf(one)
      );
    }
    for (const version of ["5.3.0", "5.7.0"]) {
      const one = runtime("podman", version, true, true, "pasta");
      kit.check(
        `(b) rootless Podman ${version} on pasta, native, gives a namespace of its own`,
        placementOf(one) === "own-namespace",
        placementOf(one)
      );
    }

    // (c)
    const unrouted = { routed: false, resolver: "127.0.0.53" };
    const routed = {
      routed: true,
      resolver: "127.0.0.53",
      address: "192.168.1.20",
    };
    const due: [string, boolean, boolean][] = [
      ["unrouted to routed", startAgainDue(unrouted, routed), true],
      ["routed to unrouted", startAgainDue(routed, unrouted), false],
      ["unchanged", startAgainDue(routed, { ...routed }), false],
      [
        "a resolver changed while routed",
        startAgainDue(routed, { ...routed, resolver: "192.168.1.1" }),
        true,
      ],
      [
        "a resolver changed while unrouted",
        startAgainDue(unrouted, { routed: false, resolver: "192.168.1.1" }),
        false,
      ],
      [
        "the machine's address changed while routed",
        startAgainDue(routed, { ...routed, address: "10.0.0.7" }),
        true,
      ],
      ["no kept network", startAgainDue(undefined, routed), false],
    ];
    for (const [what, said, wanted] of due) {
      kit.check(
        `(c) ${what}: ${wanted ? "started again" : "not started again"}`,
        said === wanted,
        String(said)
      );
    }

    // (d)
    const urls = relayUrlsFor(
      {
        credential: "secret",
        username: "1900000000:cawco",
        urls: ["turn:relay.example.com:3478?transport=udp"],
        reach: { machineId: "this-machine", lan: [], tailnet: [] },
      },
      { machineId: "this-machine", relayMedia: "host.containers.internal" }
    );
    kit.check(
      "(d) on the relay's machine, a browser in its own namespace gets the one UDP URL through host.containers.internal",
      urls.length === 1 &&
        urls[0] === "turn:host.containers.internal:3478?transport=udp",
      JSON.stringify(urls)
    );

    // (e)
    const readings = [unrouted, routed];
    let reads = 0;
    const read = () => {
      const now = readings[Math.min(reads, readings.length - 1)];
      reads += 1;
      return Promise.resolve(now as MachineNetwork);
    };
    const record = (key: string, kept: MachineNetwork) =>
      ({
        key: key as BrowserKey,
        name: key,
        host: "container",
        lastUsedAt: 0,
        state: "live",
        takeover: null,
        container: {
          id: key,
          image: "cawco-browser",
          media: "udp+tcp",
          adminPassword: "",
          userPassword: "",
          volume: key,
          network: kept,
        },
      }) as const;
    const records = [
      record("project:started-unrouted", unrouted),
      record("project:started-routed", routed),
    ];
    const started: string[] = [];
    const follower = followNetwork({
      pollMs: POLL_MS,
      read,
      records: () =>
        Promise.resolve(
          records.map((one) => ({ ...one, container: { ...one.container } }))
        ),
      startAgain: (key, now) => {
        started.push(key);
        const at = records.findIndex((one) => one.key === key);
        const was = records[at];
        if (was) {
          records[at] = {
            ...was,
            container: { ...was.container, network: now },
          };
        }
        return Promise.resolve();
      },
    });
    // Its own first reading (unrouted), then routed on its polls, each
    // reading after the second unchanged; then two sweeps, as two ticks.
    await Bun.sleep(POLL_MS * 10);
    await follower.sweep();
    await follower.sweep();
    follower.stop();
    kit.check(
      "(e) the machine going from unrouted to routed starts again exactly the browser that started unrouted, once",
      started.length === 1 && started[0] === "project:started-unrouted",
      `${reads} reading(s); started again: ${JSON.stringify(started)}`
    );

    // (f)
    const network = machineNetworkOf(
      ROUTED,
      "# resolv.conf\nsearch lan\nnameserver 127.0.0.53\nnameserver 1.1.1.1\n",
      {
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
        wlan0: [
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "fe80::1/64",
            scopeid: 3,
          },
          {
            address: "192.168.1.20",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.20/24",
          },
        ],
      }
    );
    kit.check(
      "(f) the machine's network: routed, its first nameserver, its default route's interface's IPv4 address",
      network.routed &&
        network.resolver === "127.0.0.53" &&
        network.address === "192.168.1.20",
      JSON.stringify(network)
    );
  },
};

export default spec;
