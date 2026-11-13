<script lang="ts">
  import type { ListedBrowser } from "@cawco/core/browser";
  import { browserWords } from "@cawco/core/words/browser";
  import { MediaQuery } from "svelte/reactivity";
  import { z } from "zod";
  import BrowserAddress from "#lib/cawco/preview/BrowserAddress.svelte";
  import BrowserView from "#lib/cawco/preview/BrowserView.svelte";
  import { browserHead } from "#lib/cawco/preview/browser-head.js";
  import { HEAD_PRIORITY, type HeadItem } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarItem, BarSegments } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  /**
   * A browser artifact in the artifact panel, for judging it at its widths:
   * the panel's card and floating head (SideSurface) with a browser's head
   * as PreviewPane builds it (the address in the centre, Open in new tab in
   * the glass, Take over or Hand back trailing, Close), and the real
   * BrowserView under it, its stream from this page instead of the hub:
   * a stand-in for neko (`WebSocket` answered here, and its peer a stand-in
   * too, handing the video the stream of a canvas the page draws: no WebRTC
   * runs, so any browser draws it with no flags), the agent's page drawn as
   * Northwind's billing settings. The bench reaches no hub.
   *
   * `?state=`: `live` (the agent driving, the page at its top; the
   * default), `scrolled` (the page scrolled down its invoices), `starting`
   * (the browser waking), `building` (its image, step 3 of 7), `connecting`
   * (live, the stream not yet in), `mine` (the person holds it: the
   * pointer in the address, Hand back, and under a finger Show keyboard), `unreachable` (the agent
   * opened an address that fails: the browser's own error page),
   * `lost` (the view's link closed), `failed` (the browser didn't start),
   * `away` (its machine isn't connected), `local` (a machine with no
   * container runtime: the local browser's line under the stream),
   * `long` (an origin longer than the address holds).
   *
   * `?state=live&live=1`, served by `bun run takeover:bench`
   * (scripts/takeover-bench.ts): no stand-in. The view's socket is the
   * daemon's own take-over of a real Chromium showing a sign-in page, and
   * Take over and Hand back go to the bench's server, which holds the
   * browser as the shield does; while held the head adds Reload page on a
   * desk, as PreviewPane's does.
   */
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconExternalLinear,
    IconMonitorLinear,
    IconPhoneLinear,
    IconRefreshLinear,
  } from "#lib/icons.js";
  import { page } from "$app/state";

  const asked = page.url.searchParams.get("state") ?? "live";
  /** The live bench: a real browser behind the view (scripts/takeover-bench.ts). */
  const real = page.url.searchParams.get("live") === "1";
  /** Since when the person holds the live bench's browser; null while the agent has it. */
  let since = $state<number | null>(null);
  let acting = $state(false);
  const BenchState = z.object({
    since: z.number().nullable(),
    origin: z.string(),
  });
  let realOrigin = $state<string | null>(null);
  /** The live bench's server, asked or told: Take over, Hand back, or where it stands. */
  async function bench(path: string, method = "GET") {
    ({ since, origin: realOrigin } = BenchState.parse(
      await (await fetch(path, { method })).json()
    ));
  }
  if (real && typeof window !== "undefined") {
    bench("/__bench/state");
  }
  async function control() {
    if (!real) {
      return;
    }
    acting = true;
    await bench(since ? "/__bench/handback" : "/__bench/takeover", "POST");
    acting = false;
  }
  let view = $state<BrowserView>();
  const phone = new MediaQuery(PHONE_QUERY);
  /** The stream is drawn: there is a page to take over. */
  let viewing = $state(false);
  /** The layout the held page is in: the head's switch. */
  let form = $state<"phone" | "desk">("desk");
  const LAYOUTS = [
    {
      value: "phone",
      label: browserWords.phoneLayout,
      icon: IconPhoneLinear,
    },
    { value: "desk", label: browserWords.deskLayout, icon: IconMonitorLinear },
  ] as const;

  /** What the view says on neko's socket. */
  const Signal = z.object({
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).default({}),
  });

  /** What the view sends on the take-over's socket, as far as the bench reads it. */
  const Said = z.object({
    t: z.string(),
    layout: z
      .object({ width: z.number().optional(), height: z.number().optional() })
      .optional(),
  });

  /** neko's offer and the view's answer as the stand-ins say them: a video section each, none rejected. */
  const OFFER =
    "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n";
  const ANSWER = OFFER;

  const W = 1280;
  const H = 800;
  const ORIGIN: Record<string, string> = {
    long: "https://pr-2417-billing-settings-preview.staging.northwind-internal.dev",
    unreachable: "https://staging.northwind.dev",
  };
  const origin = $derived(
    real ? realOrigin : (ORIGIN[asked] ?? "https://app.northwind.dev")
  );

  const mine = $derived(real ? since !== null : asked === "mine");
  /** The browser's own state where the bench's isn't live. */
  const STATE_OF: Record<string, ListedBrowser["state"]> = {
    starting: "starting",
    building: "building",
    failed: "failed",
  };
  const browser: ListedBrowser = $derived({
    host: asked === "local" || real ? "local" : "container",
    key: "project:northwind",
    lastUsedAt: Date.now(),
    machineId: "obelisk",
    machineName: "obelisk",
    name: "Northwind's browser",
    ...(origin ? { origin } : {}),
    projectId: "northwind",
    state: STATE_OF[asked] ?? "live",
    ...(asked === "building"
      ? { progress: { done: 3, total: 7, what: "image" as const } }
      : {}),
    ...(asked === "failed"
      ? {
          why: "docker: Error response from daemon: pull access denied for cawco/browser, repository does not exist or may require 'docker login'.",
        }
      : {}),
    takeover: mine
      ? { by: "", requestId: null, since: since ?? Date.now() }
      : null,
  });
  const machine = {
    machineId: "obelisk",
    name: "obelisk",
    online: asked !== "away",
  };
  /** The layout switch, in the mode's place while the person holds the browser (PreviewPane's rule). */
  const layoutItems: HeadItem[] = $derived(
    mine
      ? [
          {
            key: "layout",
            priority: HEAD_PRIORITY.mode,
            bar: layoutBar,
            compact: layoutCompact,
            menu: layoutMenu,
            group: true,
            place: "centre",
          },
          ...(real && !phone.current
            ? [
                {
                  key: "reload-page",
                  priority: HEAD_PRIORITY.reload,
                  bar: reloadBar,
                  menu: reloadMenu,
                },
              ]
            : []),
        ]
      : []
  );
  /** What the head holds, on the rule PreviewPane's head stands by. */
  const shows = $derived(
    browserHead(browser, {
      online: machine.online,
      viewing,
      sheet: phone.current,
    })
  );

  /** The agent's page as the remote browser paints it, `top` px scrolled, at the canvas's size: its phone layout where it is narrow. */
  function paint(canvas: HTMLCanvasElement, top: number) {
    const g = canvas.getContext("2d");
    if (!g) {
      return;
    }
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (canvas.width < W) {
      paintPhone(g, canvas.width, top);
      return;
    }
    g.font = "15px system-ui, sans-serif";
    if (asked === "unreachable") {
      g.fillStyle = "#5f6368";
      g.font = "600 26px system-ui, sans-serif";
      g.fillText("This site can’t be reached", 240, 260);
      g.font = "16px system-ui, sans-serif";
      g.fillText(
        "Check if there is a typo in staging.northwind.dev.",
        240,
        310
      );
      g.fillText("DNS_PROBE_FINISHED_NXDOMAIN", 240, 350);
      g.fillStyle = "#1a73e8";
      g.fillRect(240, 400, 96, 36);
      g.fillStyle = "#ffffff";
      g.fillText("Reload", 262, 424);
      return;
    }
    g.save();
    g.translate(0, -top);
    // Its nav.
    g.fillStyle = "#0f2a3d";
    g.fillRect(0, 0, W, 64);
    g.fillStyle = "#ffffff";
    g.font = "600 18px system-ui, sans-serif";
    g.fillText("Northwind", 32, 39);
    g.font = "15px system-ui, sans-serif";
    for (const [at, one] of [
      "Orders",
      "Customers",
      "Billing",
      "Settings",
    ].entries()) {
      g.fillText(one, 220 + at * 110, 39);
    }
    // Its heading and plan.
    g.fillStyle = "#111827";
    g.font = "600 30px system-ui, sans-serif";
    g.fillText("Billing settings", 32, 128);
    g.font = "15px system-ui, sans-serif";
    g.fillStyle = "#4b5563";
    g.fillText(
      "Your team is on the Growth plan, billed yearly. Next invoice on 1 December 2026.",
      32,
      162
    );
    g.strokeStyle = "#e5e7eb";
    g.strokeRect(32, 196, W - 64, 120);
    g.fillStyle = "#111827";
    g.font = "600 18px system-ui, sans-serif";
    g.fillText("Growth · 24 seats · $1,152 / year", 56, 240);
    g.font = "15px system-ui, sans-serif";
    g.fillStyle = "#4b5563";
    g.fillText("Visa ending 4242 · expires 08/28", 56, 272);
    g.fillStyle = "#2563eb";
    g.fillRect(W - 220, 236, 160, 40);
    g.fillStyle = "#ffffff";
    g.fillText("Change plan", W - 182, 262);
    // Its invoices.
    g.fillStyle = "#111827";
    g.font = "600 20px system-ui, sans-serif";
    g.fillText("Invoices", 32, 372);
    g.font = "15px system-ui, sans-serif";
    for (let at = 0; at < 24; at += 1) {
      const y = 400 + at * 52;
      g.fillStyle = at % 2 ? "#f9fafb" : "#ffffff";
      g.fillRect(32, y, W - 64, 52);
      g.fillStyle = "#111827";
      g.fillText(`INV-2026-${String(1180 - at).padStart(4, "0")}`, 56, y + 32);
      g.fillText(`${(at % 12) + 1} ${at < 12 ? "2026" : "2025"}`, 360, y + 32);
      g.fillText("$96.00", 640, y + 32);
      g.fillStyle = at === 0 ? "#b45309" : "#047857";
      g.fillText(at === 0 ? "Due" : "Paid", 860, y + 32);
      g.fillStyle = "#2563eb";
      g.fillText("Download PDF", W - 180, y + 32);
    }
    g.restore();
  }

  /** The page's phone layout, `w` wide: its nav folded, its plan and invoices stacked. */
  function paintPhone(g: CanvasRenderingContext2D, w: number, top: number) {
    g.save();
    g.translate(0, -top);
    g.fillStyle = "#0f2a3d";
    g.fillRect(0, 0, w, 56);
    g.fillStyle = "#ffffff";
    g.font = "600 18px system-ui, sans-serif";
    g.fillText("Northwind", 20, 35);
    for (const y of [22, 28, 34]) {
      g.fillRect(w - 38, y, 20, 2);
    }
    g.fillStyle = "#111827";
    g.font = "600 26px system-ui, sans-serif";
    g.fillText("Billing settings", 20, 104);
    g.font = "15px system-ui, sans-serif";
    g.fillStyle = "#4b5563";
    g.fillText("Growth plan, billed yearly.", 20, 134);
    g.fillText("Next invoice on 1 December 2026.", 20, 156);
    g.strokeStyle = "#e5e7eb";
    g.strokeRect(20, 180, w - 40, 132);
    g.fillStyle = "#111827";
    g.font = "600 17px system-ui, sans-serif";
    g.fillText("Growth · 24 seats", 36, 214);
    g.font = "15px system-ui, sans-serif";
    g.fillStyle = "#4b5563";
    g.fillText("$1,152 / year · Visa 4242", 36, 240);
    g.fillStyle = "#2563eb";
    g.fillRect(36, 258, w - 72, 40);
    g.fillStyle = "#ffffff";
    g.fillText("Change plan", w / 2 - 40, 284);
    g.fillStyle = "#111827";
    g.font = "600 19px system-ui, sans-serif";
    g.fillText("Invoices", 20, 356);
    g.font = "15px system-ui, sans-serif";
    for (let at = 0; at < 24; at += 1) {
      const y = 376 + at * 60;
      g.fillStyle = at % 2 ? "#f9fafb" : "#ffffff";
      g.fillRect(20, y, w - 40, 60);
      g.fillStyle = "#111827";
      g.fillText(`INV-2026-${String(1180 - at).padStart(4, "0")}`, 36, y + 26);
      g.fillStyle = "#4b5563";
      g.fillText("$96.00", 36, y + 48);
      g.fillStyle = at === 0 ? "#b45309" : "#047857";
      g.fillText(at === 0 ? "Due" : "Paid", w - 80, y + 26);
    }
    g.restore();
  }

  // The hub's view socket, answered here: neko's signaling for a container
  // browser, its peer a stand-in that hands the video a canvas's stream.
  if (typeof window !== "undefined" && !real) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    let scroll = asked === "scrolled" ? 560 : 0;
    paint(canvas, scroll);
    const stream = canvas.captureStream(10);
    // A canvas stream sends a frame only when it is drawn: drawn again each tick.
    setInterval(() => paint(canvas, scroll), 200);

    class BenchSocket extends EventTarget {
      static readonly OPEN = 1;
      readonly OPEN = 1;
      binaryType = "blob";
      readyState = 0;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onopen: (() => void) | null = null;
      readonly url: string;
      constructor(url: string) {
        super();
        this.url = url;
        if (asked === "connecting") {
          return;
        }
        setTimeout(() => {
          if (asked === "lost") {
            this.readyState = 3;
            this.onclose?.(
              new CloseEvent("close", {
                code: 1006,
                reason: "The hub closed the view's link.",
              })
            );
            return;
          }
          this.readyState = 1;
          this.onopen?.();
          if (url.includes("/cdp")) {
            // The page's screencast: each frame its size, then its JPEG,
            // at the layout the view asked for.
            const frame = () =>
              canvas.toBlob(async (jpeg) => {
                if (!jpeg || this.readyState !== 1) {
                  return;
                }
                const body = new Uint8Array(await jpeg.arrayBuffer());
                const sent = new Uint8Array(4 + body.length);
                new DataView(sent.buffer).setUint16(0, canvas.width);
                new DataView(sent.buffer).setUint16(2, canvas.height);
                sent.set(body, 4);
                this.onmessage?.(
                  new MessageEvent("message", { data: sent.buffer })
                );
              }, "image/jpeg");
            frame();
            setInterval(frame, 1000);
            return;
          }
          this.#say("system/init", {
            screen_size: { width: W, height: H },
          });
        }, 200);
      }
      #say(event: string, payload: unknown) {
        this.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({ event, payload }),
          })
        );
      }
      send(data: string) {
        if (this.url.includes("/cdp")) {
          const said = Said.safeParse(JSON.parse(data));
          if (said.success && said.data.t === "layout") {
            // The page laid out again at the layout's size.
            const laid = said.data.layout;
            canvas.width = laid?.width ?? W;
            canvas.height = laid?.height ?? H;
            paint(canvas, scroll);
          } else if (said.success && said.data.t !== "move") {
            // A wheel or a finger moves the page under the person's hand.
            scroll = Math.min(800, scroll + 120);
          }
          return;
        }
        const { event } = Signal.parse(JSON.parse(data));
        if (event === "signal/request") {
          // neko offers its peer; the stand-in peer answers it (BenchPeer).
          this.#say("signal/provide", { sdp: OFFER });
        }
      }
      close() {
        this.readyState = 3;
      }
    }
    /**
     * The view's peer, a stand-in for the browser's RTCPeerConnection: as
     * the offer lands it hands the video the canvas's stream (`ontrack`),
     * opens its input channel (a wheel or a press moves the page) and says
     * it connected, as a peer does once its media flows.
     */
    class BenchPeer {
      connectionState: RTCPeerConnectionState = "new";
      localDescription: RTCSessionDescriptionInit | null = null;
      remoteDescription: RTCSessionDescriptionInit | null = null;
      onicecandidate: ((event: unknown) => void) | null = null;
      ontrack:
        | ((event: { track: MediaStreamTrack; streams: MediaStream[] }) => void)
        | null = null;
      ondatachannel: ((event: { channel: unknown }) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      setRemoteDescription(described: RTCSessionDescriptionInit) {
        this.remoteDescription = described;
        setTimeout(() => {
          const [track] = stream.getVideoTracks();
          if (track) {
            this.ontrack?.({ track, streams: [stream] });
          }
          this.ondatachannel?.({
            channel: {
              binaryType: "arraybuffer",
              readyState: "open",
              send: () => {
                // A wheel moves the page under the person's hand.
                scroll = Math.min(800, scroll + 120);
              },
            },
          });
          this.connectionState = "connected";
          this.onconnectionstatechange?.();
        });
        return Promise.resolve();
      }
      createAnswer() {
        return Promise.resolve({ type: "answer" as const, sdp: ANSWER });
      }
      setLocalDescription(described: RTCSessionDescriptionInit) {
        this.localDescription = described;
        return Promise.resolve();
      }
      addIceCandidate() {
        return Promise.resolve();
      }
      close() {
        this.connectionState = "closed";
      }
    }
    window.RTCPeerConnection = BenchPeer as unknown as typeof RTCPeerConnection;
    // Only the view's socket: the dev server's own (Vite's) stays the browser's.
    const Real = window.WebSocket;
    window.WebSocket = new Proxy(Real, {
      construct(target, args: ConstructorParameters<typeof WebSocket>) {
        return String(args[0]).includes("/ws/browser/")
          ? new BenchSocket(String(args[0]))
          : new target(...args);
      },
    });
  }
</script>

{#snippet controlBar()}
  <Button
    data-slot="browser-take"
    label={mine ? browserWords.handBack : browserWords.takeOver}
    onclick={control}
    pending={acting}
    pendingLabel={mine ? browserWords.handingBack : browserWords.takingOver}
    shape="capsule"
    variant={mine ? "outline" : "default"}
  />
{/snippet}
{#snippet controlMenu()}
  <DropdownMenu.Item onSelect={control}
    >{mine ? browserWords.handBack : browserWords.takeOver}</DropdownMenu.Item
  >
{/snippet}
{#snippet reloadBar()}
  <BarItem
    icon={IconRefreshLinear}
    label={browserWords.reloadPage}
    onclick={() => view?.reloadPage()}
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item onSelect={() => view?.reloadPage()}
    ><IconRefreshLinear /><span>{browserWords.reloadPage}</span
    ></DropdownMenu.Item
  >
{/snippet}
{#snippet addressBar()}
  <BrowserAddress connecting={!viewing} {mine} {origin} />
{/snippet}
{#snippet addressMenu()}
  <BrowserAddress as="menu" connecting={!viewing} {mine} {origin} />
{/snippet}
{#snippet layoutBar()}
  <BarSegments
    label={browserWords.layout}
    onValueChange={(next) => {
      form = next;
    }}
    segments={LAYOUTS}
    value={form}
  />
{/snippet}
{#snippet layoutCompact()}
  <BarItem
    icon={form === "phone" ? IconMonitorLinear : IconPhoneLinear}
    label={form === "phone"
      ? browserWords.toDeskLayout
      : browserWords.toPhoneLayout}
    onclick={() => {
      form = form === "phone" ? "desk" : "phone";
    }}
  />
{/snippet}
{#snippet layoutMenu()}
  <DropdownMenu.Item
    onSelect={() => {
      form = "phone";
    }}
    ><IconPhoneLinear /><span>{browserWords.phoneLayout}</span
    ></DropdownMenu.Item
  >
  <DropdownMenu.Item
    onSelect={() => {
      form = "desk";
    }}
    ><IconMonitorLinear /><span>{browserWords.deskLayout}</span
    ></DropdownMenu.Item
  >
{/snippet}
{#snippet openBar()}
  <BarItem icon={IconExternalLinear} label="Open in new tab" />
{/snippet}
{#snippet openMenu()}
  <DropdownMenu.Item
    ><IconExternalLinear /><span>Open in new tab</span></DropdownMenu.Item
  >
{/snippet}

<!-- Shown in CawCo's own artifact panel (the overlay's `data-cawco-headed`),
   the card fills the frame edge to edge: the panel's well holds it, with no
   page round it. -->
<div
  class="flex h-dvh bg-surface-recess p-space-2 *:flex-1 max-phone:p-0 in-data-cawco-headed:p-0"
>
  <SideSurface
    items={[
      ...(shows.control
        ? [
            {
              key: "control",
              priority: HEAD_PRIORITY.control,
              bar: controlBar,
              menu: controlMenu,
              place: "prominent" as const,
            },
          ]
        : []),
      ...(shows.address
        ? [
            {
              key: "address",
              priority: HEAD_PRIORITY.address,
              bar: addressBar,
              menu: addressMenu,
              place: "lead" as const,
            },
          ]
        : []),
      ...layoutItems,
      // Held, a phone's head holds Close, the switch and Hand back alone.
      ...(mine
        ? []
        : [
            {
              key: "open",
              priority: HEAD_PRIORITY.open,
              bar: openBar,
              menu: openMenu,
            },
          ]),
    ]}
    label="Preview"
    onclose={() => undefined}
    placement={phone.current ? "sheet" : "beside"}
    title="Check the billing page after the plan change"
  >
    <BrowserView
      bind:this={view}
      addressAtFoot={phone.current}
      artifactId="northwind-billing"
      {browser}
      bind:form
      instanceId="bench"
      {machine}
      bind:viewing
    />
  </SideSurface>
</div>
