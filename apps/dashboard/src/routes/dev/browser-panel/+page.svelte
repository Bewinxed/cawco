<script lang="ts">
  /**
   * A browser artifact in the artifact panel, for judging it at its widths:
   * the panel's card and floating head (SideSurface) with a browser's head
   * as PreviewPane builds it (the address in the centre, Open in new tab in
   * the glass, Take over or Hand back trailing, Close), and the real
   * BrowserView under it, its stream from this page instead of the hub:
   * a stand-in for neko (`WebSocket` answered here, the video carried over
   * a WebRTC loopback in the page from a canvas the page draws), the agent's
   * page drawn as Northwind's billing settings. The bench reaches no hub.
   *
   * `?state=`: `live` (the agent driving, the page at its top; the
   * default), `scrolled` (the page scrolled down its invoices), `starting`
   * (the browser waking), `building` (its image, step 3 of 7), `connecting`
   * (live, the stream not yet in), `mine` (the person holds it: Private,
   * Hand back, and under a finger Show keyboard), `unreachable` (the agent
   * opened an address that fails: the browser's own error page),
   * `lost` (the view's link closed), `failed` (the browser didn't start),
   * `away` (its machine isn't connected), `local` (a machine with no
   * container runtime: the local browser's line under the stream),
   * `long` (an origin longer than the address holds).
   */
  import type { ListedBrowser } from "@cawco/core/browser";
  import { browserWords } from "@cawco/core/words/browser";
  import { MediaQuery } from "svelte/reactivity";
  import { z } from "zod";
  import BrowserAddress from "#lib/cawco/preview/BrowserAddress.svelte";
  import BrowserView from "#lib/cawco/preview/BrowserView.svelte";
  import { browserHead } from "#lib/cawco/preview/browser-head.js";
  import { HEAD_PRIORITY } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconExternalLinear } from "#lib/icons.js";
  import { page } from "$app/state";

  const asked = page.url.searchParams.get("state") ?? "live";
  const phone = new MediaQuery("max-width: 639px");
  /** The stream is drawn: there is a page to take over. */
  let viewing = $state(false);

  /** What the view says on neko's socket. */
  const Signal = z.object({
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).default({}),
  });

  const W = 1280;
  const H = 800;
  const ORIGIN = {
    long: "https://pr-2417-billing-settings-preview.staging.northwind-internal.dev",
    unreachable: "https://staging.northwind.dev",
  } as Record<string, string>;
  const origin = ORIGIN[asked] ?? "https://app.northwind.dev";

  const mine = asked === "mine";
  /** The browser's own state where the bench's isn't live. */
  const STATE_OF: Record<string, ListedBrowser["state"]> = {
    starting: "starting",
    building: "building",
    failed: "failed",
  };
  const browser: ListedBrowser = {
    host: asked === "local" ? "local" : "container",
    key: "project:northwind",
    lastUsedAt: Date.now(),
    machineId: "obelisk",
    machineName: "obelisk",
    name: "Northwind's browser",
    origin,
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
    takeover: mine ? { by: "", requestId: null, since: Date.now() } : null,
  };
  const machine = {
    machineId: "obelisk",
    name: "obelisk",
    online: asked !== "away",
  };
  /** What the head holds, on the rule PreviewPane's head stands by. */
  const shows = $derived(
    browserHead(browser, {
      online: machine.online,
      viewing,
      sheet: phone.current,
    })
  );

  /** The agent's page as the remote browser paints it, `top` px scrolled. */
  function paint(canvas: HTMLCanvasElement, top: number) {
    const g = canvas.getContext("2d");
    if (!g) {
      return;
    }
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
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

  // The hub's view socket, answered here: neko's signaling for a container
  // browser, the stream carried over a WebRTC loopback from a canvas.
  if (typeof window !== "undefined") {
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
      #peer: RTCPeerConnection | null = null;
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
            // The local browser's screencast: each frame its size, then its JPEG.
            const frame = () =>
              canvas.toBlob(async (jpeg) => {
                if (!jpeg || this.readyState !== 1) {
                  return;
                }
                const body = new Uint8Array(await jpeg.arrayBuffer());
                const sent = new Uint8Array(4 + body.length);
                new DataView(sent.buffer).setUint16(0, W);
                new DataView(sent.buffer).setUint16(2, H);
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
          // A wheel moves the page under the person's hand.
          if (data.includes('"wheel"')) {
            scroll = Math.min(800, scroll + 120);
          }
          return;
        }
        const { event, payload } = Signal.parse(JSON.parse(data));
        if (event === "signal/request") {
          this.#offer();
        } else if (event === "signal/answer") {
          this.#peer
            ?.setRemoteDescription({
              type: "answer",
              sdp: String(payload.sdp),
            })
            .catch(() => undefined);
        } else if (event === "signal/candidate") {
          this.#peer
            ?.addIceCandidate(payload as RTCIceCandidateInit)
            .catch(() => undefined);
        }
      }
      async #offer() {
        const peer = new RTCPeerConnection();
        this.#peer = peer;
        for (const track of stream.getVideoTracks()) {
          peer.addTrack(track, stream);
        }
        const data = peer.createDataChannel("data");
        data.onmessage = () => {
          // A wheel moves the page under the person's hand.
          scroll = Math.min(800, scroll + 120);
        };
        peer.onicecandidate = (found) => {
          if (found.candidate) {
            this.#say("signal/candidate", found.candidate.toJSON());
          }
        };
        await peer.setLocalDescription(await peer.createOffer());
        this.#say("signal/provide", { sdp: peer.localDescription?.sdp });
      }
      close() {
        this.readyState = 3;
        this.#peer?.close();
      }
    }
    // Only the view's socket: the dev server's own (Vite's) stays the browser's.
    const Real = window.WebSocket;
    window.WebSocket = new Proxy(Real, {
      construct(target, args: [string, ...unknown[]]) {
        return String(args[0]).includes("/ws/browser/")
          ? new BenchSocket(args[0])
          : new target(...(args as [string]));
      },
    });
  }
</script>

{#snippet controlBar()}
  <Button
    data-slot="browser-take"
    label={mine ? browserWords.handBack : browserWords.takeOver}
    onclick={() => undefined}
    shape="capsule"
    variant={mine ? "outline" : "default"}
  />
{/snippet}
{#snippet controlMenu()}
  <DropdownMenu.Item
    >{mine ? browserWords.handBack : browserWords.takeOver}</DropdownMenu.Item
  >
{/snippet}
{#snippet addressBar()}
  <BrowserAddress {mine} {origin} />
{/snippet}
{#snippet addressMenu()}
  <BrowserAddress as="menu" {mine} {origin} />
{/snippet}
{#snippet openBar()}
  <BarItem icon={IconExternalLinear} label="Open in new tab" />
{/snippet}
{#snippet openMenu()}
  <DropdownMenu.Item
    ><IconExternalLinear /><span>Open in new tab</span></DropdownMenu.Item
  >
{/snippet}

<Tooltip.Provider>
  <div class="flex h-dvh bg-surface-recess p-space-2 *:flex-1 max-phone:p-0">
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
        {
          key: "open",
          priority: HEAD_PRIORITY.open,
          bar: openBar,
          menu: openMenu,
        },
      ]}
      label="Preview"
      onclose={() => undefined}
      placement={phone.current ? "sheet" : "beside"}
      title="Check the billing page after the plan change"
    >
      <BrowserView
        addressAtFoot={phone.current}
        artifactId="northwind-billing"
        {browser}
        instanceId="bench"
        {machine}
        bind:viewing
      />
    </SideSurface>
  </div>
</Tooltip.Provider>
