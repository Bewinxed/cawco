/**
 * The container host's stream (Projects spec §5.11): neko's own client,
 * `@m1k1o/neko` 3.2.0, on the hub's routes (hub browser-routes.ts). Its
 * `NekoClient` speaks neko's REST and `/api/ws` under the view's base
 * (`setUrl` keeps the path: `<base>/api/ws`, `<base>/api/whoami`), its
 * `WebRTCTransport` draws the stream, and its `Overlay` carries the
 * person's mouse, keys and touch while they hold control.
 *
 * - **The view's token.** One token is one neko session at the hub (it
 *   swaps it for a viewer session of the daemon's, `browser.viewerToken`),
 *   so each view names itself with a token of its own: two tabs are two
 *   viewers, each its own `system/init` session id, the one `/takeover`
 *   gives control to.
 * - **ICE.** The hub writes the viewer's ICE servers into `signal/provide`
 *   (the stream relay with a credential minted for this viewer, and the
 *   fleet's STUN), which the transport builds its peer from; the client
 *   is given none. The client is handed the library's own
 *   `WebRTCTransport` behind a {@link StreamTransport} of ours (the
 *   client's pluggable `transport` option) that hears each `signal/provide`
 *   as it passes, for the relay it names and the peer made from it. The
 *   outcome is read off that peer: its selected pair
 *   from `getStats()` (a local candidate carrying `relayProtocol` is
 *   relayed, libwebrtc's `prflx` made from a relay candidate included, as
 *   scripts/probe-kit/specs/browser-stream.ts reads it), and a peer that
 *   failed before any frame: its own `iceconnectionstatechange` `failed`,
 *   or neko's `signal/close`, which it sends when its end of the peer
 *   failed first (no pair from here reaches it). The transport takes
 *   either as a failure and retries ten times with backoff, minutes on a
 *   network that reaches neither neko nor a relay; the view says so at the
 *   first. The transport keeps the peer private; {@link peerOf} reads it,
 *   the one field this reaches past the library's types for.
 */
import {
  NekoClient,
  Overlay,
  type SessionInfo,
  type StreamTransport,
  WebRTCTransport,
} from "@m1k1o/neko";
import { newId } from "../id";
import { relayOf, type StreamSource, type StreamStatus } from "./source";

/** The transport's peer: private in its types, a plain field at run time (`transport/webrtc.js` `this.pc`). */
const peerOf = (transport: WebRTCTransport): RTCPeerConnection | null =>
  (transport as unknown as { pc?: RTCPeerConnection | null }).pc ?? null;

/**
 * neko's WebRTC transport, every call its own, with `provided` told of each
 * `signal/provide` once the transport has made its peer from it (its
 * handler makes the peer before its first await), and `dropped` of each
 * `signal/close` before the transport hears it.
 */
const hearingOffers = (
  inner: WebRTCTransport,
  provided: (payload: { iceservers?: RTCIceServer[] }) => void,
  dropped: () => void
): StreamTransport => ({
  kind: inner.kind,
  get element() {
    return inner.element;
  },
  input: inner.input,
  connect: (session: SessionInfo) =>
    inner.connect({
      ...session,
      on: (event, heard) => {
        if (event === "signal/provide") {
          return session.on(event, (payload) => {
            heard(payload);
            provided((payload ?? {}) as { iceservers?: RTCIceServer[] });
          });
        }
        if (event === "signal/close") {
          return session.on(event, (payload) => {
            dropped();
            heard(payload);
          });
        }
        return session.on(event, heard);
      },
    }),
  close: () => inner.close(),
  attach: (box) => inner.attach(box),
  setPlaying: (on) => inner.setPlaying(on),
  setVolume: (volume) => inner.setVolume(volume),
  setMuted: (on) => inner.setMuted(on),
  shareMedia: (stream) => inner.shareMedia(stream),
  on: (event, heard) => inner.on(event, heard),
});

/** Whether `stats`' selected candidate pair runs through a relay. */
const relayedPair = (stats: RTCStatsReport): boolean => {
  let pairId: string | undefined;
  for (const entry of stats.values()) {
    if (entry.type === "transport" && entry.selectedCandidatePairId) {
      pairId = entry.selectedCandidatePairId as string;
    }
  }
  if (!pairId) {
    for (const entry of stats.values()) {
      if (
        entry.type === "candidate-pair" &&
        entry.state === "succeeded" &&
        entry.nominated
      ) {
        pairId = entry.id as string;
      }
    }
  }
  const pair = pairId ? stats.get(pairId) : undefined;
  if (!pair) {
    return false;
  }
  const local = stats.get(pair.localCandidateId as string);
  const remote = stats.get(pair.remoteCandidateId as string);
  return (
    local?.candidateType === "relay" ||
    local?.relayProtocol !== undefined ||
    remote?.candidateType === "relay"
  );
};

export class NekoSource implements StreamSource {
  readonly #webrtc = new WebRTCTransport();
  readonly #client = new NekoClient({
    autoplay: true,
    transport: hearingOffers(
      this.#webrtc,
      ({ iceservers }) => {
        this.#relay = relayOf(iceservers);
        this.#watchPeer();
      },
      () => this.#failedBeforeFrame()
    ),
  });
  readonly #report: (status: StreamStatus) => void;
  readonly #viewer: (session: string | null) => void;
  #overlay: Overlay | null = null;
  readonly #offs: (() => void)[] = [];
  /** The stream relay the last offer named, or null. */
  #relay: string | null = null;
  /** Whether a frame was drawn on this connection: a drop after it is a reconnect, not a failure to connect. */
  #seen: "none" | "drawn" | "unoffered" = "none";
  /** Open until it is closed, by its view or by its own give-up. */
  #life: "open" | "closed" = "open";

  /**
   * `base` is the view's own place on the hub, `/ws/browser/<instance>/<artifact>/`
   * on this origin; `report` hears every change of the stream's status,
   * `viewer` the neko session this view is.
   */
  constructor(
    base: string,
    report: (status: StreamStatus) => void,
    viewer: (session: string | null) => void
  ) {
    this.#report = report;
    this.#viewer = viewer;
    const client = this.#client;
    client.setUrl(base);
    const { store } = client;
    this.#offs.push(
      store.subscribe(
        (state) => state.session_id,
        (session) => viewer(session)
      ),
      store.subscribe(
        (state) => state.connection.status,
        (status) => this.#heard(status)
      ),
      // Closed with an error: the client gave up (its retries spent, the
      // session gone, the peer's retries spent). Ours closes without one.
      client.events.on("connection.closed", (error) => {
        if (this.#life === "closed" || !error) {
          return;
        }
        // The transport's own give-up ("video connection failed (WebRTC)")
        // before any frame is no path from here; anything else a lost way.
        report(
          this.#seen === "none" && error.message.includes("WebRTC")
            ? { kind: "unreached", relay: this.#relay }
            : { kind: "lost" }
        );
      }),
      // A peer the transport makes again by itself (after a failure) is
      // watched from its first state. A transport that had no offer within
      // its own timeout is `unavailable`, which the client counts as
      // connected: here it is said as no picture sent, never as live.
      client.transport.on("state", (state) => {
        if (state.status === "unavailable" && this.#life === "open") {
          this.#seen = "unoffered";
          report({ kind: "unoffered" });
          return;
        }
        // An offer that came after all: the client's status stood at
        // connected throughout, so its stream is read from here.
        if (state.status === "connected" && this.#seen === "unoffered") {
          this.#seen = "drawn";
          this.#readPair();
        }
        // The transport says `connecting` for a failed peer before it
        // closes it, whichever of the peer's two events came first.
        if (peerOf(this.#webrtc)?.connectionState === "failed") {
          this.#failedBeforeFrame();
          return;
        }
        this.#watchPeer();
      })
    );
    report({ kind: "connecting" });
    client
      .authenticate(newId())
      .then(() => {
        if (this.#life === "open") {
          client.connect();
        }
      })
      .catch(() => {
        if (this.#life === "open") {
          report({ kind: "lost" });
        }
      });
  }

  /** The client's connection status, as the band says it. */
  #heard(status: "disconnected" | "connecting" | "connected"): void {
    if (this.#life === "closed") {
      return;
    }
    if (status === "connected" && this.#seen !== "unoffered") {
      this.#seen = "drawn";
      this.#readPair();
      return;
    }
    if (status === "connecting" && this.#seen === "drawn") {
      this.#report({ kind: "reconnecting" });
    }
  }

  /** The selected pair once connected: through the relay or not. */
  #readPair(): void {
    const peer = peerOf(this.#webrtc);
    if (!peer) {
      this.#report({ kind: "live", viaRelay: false });
      return;
    }
    peer
      .getStats()
      .then((stats) => {
        if (this.#life === "open") {
          this.#report({ kind: "live", viaRelay: relayedPair(stats) });
        }
      })
      .catch(() => {
        if (this.#life === "open") {
          this.#report({ kind: "live", viaRelay: false });
        }
      });
  }

  /** The peer watched now: each new one is watched once. */
  #peer: RTCPeerConnection | null = null;

  /**
   * A peer that failed, either end first: before any frame it is the stream
   * not reaching this screen, and the client's retries stop there; after
   * one, the transport's own retry is the reconnect.
   */
  #failedBeforeFrame(): void {
    if (this.#seen === "none" && this.#life === "open") {
      this.#report({ kind: "unreached", relay: this.#relay });
      this.close();
    }
  }

  /** The peer's own ICE failing is watched on each new peer. */
  #watchPeer(): void {
    const peer = peerOf(this.#webrtc);
    if (!peer || peer === this.#peer || this.#life === "closed") {
      return;
    }
    this.#peer = peer;
    const heard = () => {
      if (peer.iceConnectionState === "failed") {
        this.#failedBeforeFrame();
        return;
      }
      // A peer replaced mid-stream (the server's restart) is read again.
      if (peer.iceConnectionState === "connected" && this.#seen === "drawn") {
        this.#readPair();
      }
    };
    peer.addEventListener("iceconnectionstatechange", heard);
    // Watched from the transport's first state after the peer was made:
    // a failure that came first (the state the transport reports it by)
    // is read now.
    heard();
  }

  attach(box: HTMLElement): () => void {
    const client = this.#client;
    const detach = client.transport.attach(box);
    // Muted until the person turns the sound on (More › Sound on).
    client.transport.setMuted(true);
    const overlay = new Overlay(client);
    this.#overlay = overlay;
    const detachOverlay = overlay.attach(box);
    return () => {
      detachOverlay();
      detach();
      this.#overlay = null;
    };
  }

  keyboard(): void {
    if (!this.#client.state.mobile_keyboard_open) {
      this.#overlay?.mobileKeyboardToggle();
    }
  }

  sound(on: boolean): void {
    this.#client.transport.setMuted(!on);
  }

  close(): void {
    if (this.#life === "closed") {
      return;
    }
    this.#life = "closed";
    for (const off of this.#offs.splice(0)) {
      off();
    }
    this.#client.disconnect();
    this.#viewer(null);
  }
}
