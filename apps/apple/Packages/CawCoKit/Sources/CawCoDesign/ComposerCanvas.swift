public import CawCoCore
import OSLog
public import UIKit
import UIKit.UIGestureRecognizerSubclass
import WebKit

// The composer's canvas (DESIGN.md Artifact panel, canvas and ink; Composer,
// The pen's swipe; canvas-room.svelte.ts on the web): the draft's canvas
// standing over the field, grown out of the pill as the recall wheel grows,
// the field below it writable.
//
// - Open: a pencil's swipe up on the pill, Attach → Draw, or VoiceOver's
//   "Draw" on the field. The grown shape rises out of the pill's top edge
//   over `durGrow` and keeps rising until the canvas stands over the column
//   above the field; the canvas's page (a web view on the hub's preview
//   listener) is cut to the shape as it grows. Reopened from its chip, it
//   opens out of the chip's box on the same clock.
// - Resize: its top edge's 44pt grab drags its height between 40% of the
//   column and the column less the field, settling on the house spring at
//   the finger's speed; a press mid-settle takes it from where it stands.
// - Done folds it over `durGrowExit` into its chip, the export's picture
//   the chip's thumbnail.
// - Dock shows it in the artifact panel (`artifact_show`) and flies its web
//   view there (280ms, drawer curve) while the shape gives the field its
//   room back on the composer's clock; the composer keeps its chip, and a
//   tap on the chip (Undock) flies it back.
// - Send carries its `.excalidraw` file, its outline and its picture.
//
// With Reduce Motion each fades over `durFade` and nothing travels.

/// Where the artifact panel's page stands, in the window: at rest (where a
/// flight lands) and as drawn this frame (a drawer settling or dragged).
public struct CanvasPanel: Sendable, Equatable {
    public let rest: CGRect
    public let shown: CGRect

    public init(rest: CGRect, shown: CGRect) {
        self.rest = rest
        self.shown = shown
    }
}

/// What the canvas needs of the session's screen.
@MainActor
public struct CanvasHost {
    public let hub: HubConnection
    /// The pane's box in the window: the column the canvas stands in.
    public let column: () -> CGRect?
    /// The artifact panel's page while the panel shows the artifact `id`;
    /// nil while it shows anything else or nothing. A docked canvas stands
    /// over it (stage.svelte.ts: one view over the panel's well).
    public let panel: (String) -> CanvasPanel?

    public init(hub: HubConnection, column: @escaping () -> CGRect?, panel: @escaping (String) -> CanvasPanel?) {
        self.hub = hub
        self.column = column
        self.panel = panel
    }
}

/// The draft's canvas (composer-draft.svelte.ts `DraftCanvas`).
public struct DraftCanvas: Sendable, Equatable {
    public let id: String
    public let name: String
    /// Its page on the listener, once the hub has said where (made, or read).
    var page: CanvasPage?
    /// Folded to its chip (Done, an ask arriving, a restored draft).
    var folded: Bool
    /// Shown in the artifact panel; the composer keeps its chip.
    var docked = false
    /// The chip's picture: the export's PNG.
    var thumb: Data?

    init(id: String, name: String, page: CanvasPage? = nil, folded: Bool) {
        self.id = id
        self.name = name
        self.page = page
        self.folded = folded
    }
}

enum CanvasMeasure {
    /// The shortest share of the column the canvas stands at (§5.10: "floor 40 % of the column").
    static let floor = 0.4
    /// How much of a drag past a bound the canvas follows, and at most how far, as a share of the bound.
    static let rubber = 0.35
    static let rubberMax = 0.25
    /// How far a release carries the height, in seconds of its speed: the
    /// normal deceleration's projection (UIScrollView.DecelerationRate.normal,
    /// `v / 1000 · d / (1 − d)`), as the web's grab and the drawer's settle take it.
    static var project: Double {
        let rate = Double(UIScrollView.DecelerationRate.normal.rawValue)
        return rate / (1 - rate) / 1000
    }
    /// A VoiceOver step of the grab, points (the web's arrow-key step).
    static let step = 25.0
    /// The grab's band: 160 × 44 at the canvas's top edge, the drawer's 100 × 6 grabber in it.
    static let grabWidth = 160.0
    static let grabHeight = 44.0
}

#if DEBUG
enum CanvasDebug {
    /// `-cawcoProbePencil`: the simulator has no pencil, so for this run the
    /// canvas's swipe takes a finger as a pencil, and the wheel's takes none.
    static let pencil = ProcessInfo.processInfo.arguments.contains("-cawcoProbePencil")
    /// The canvas's decisions, which a simulator pass reads (scripts/probe-ios-composer-canvas.ts).
    static let log = Logger(subsystem: "dev.cawco.app", category: "Canvas")
}
#endif

// MARK: The pen's swipe

/// The canvas's swipe up: a pan a pencil makes. A DEBUG build logs each
/// state it goes through, `.failed` too, in the Canvas category.
final class PenSwipeRecognizer: UIPanGestureRecognizer {
    #if DEBUG
    override var state: UIGestureRecognizer.State {
        didSet {
            guard state != oldValue, state != .changed else { return }
            let name = switch state {
            case .possible: "possible"
            case .began: "began"
            case .ended: "ended"
            case .cancelled: "cancelled"
            case .failed: "failed"
            default: "other"
            }
            CanvasDebug.log.notice("pen swipe state \(name, privacy: .public)")
        }
    }
    #endif
}

// MARK: The page

/// The canvas's page in a web view of its own, configured as the preview's
/// (PreviewController): a non-persistent store holding only this session's
/// `cawco-preview` cookie, and the host script standing in for the
/// dashboard's window, so the page's overlay posts to the app and hears it.
@MainActor
final class CanvasWeb: NSObject, WKScriptMessageHandler, WKNavigationDelegate, UIPencilInteractionDelegate {
    let page: CanvasPage
    let web: WKWebView
    private let instanceId: String
    /// The page has joined its document (`cawco:ready`).
    private(set) var connected = false
    /// Its last load failed: the next attach loads it again.
    private(set) var broken = false
    /// This load's answer was refused by status: WebKit's own word for the cancel is not the reason.
    private var refused = false
    /// Where the canvas stands, told to the page (`cawco:place`): the rail's Dock reads Undock while docked.
    var docked = false {
        didSet { if docked != oldValue { tellPlace() } }
    }
    var onDock: () -> Void = {}
    var onUndock: () -> Void = {}
    var onDone: () -> Void = {}
    var onFailed: (String) -> Void = { _ in }
    private var readyWaiters: [UUID: CheckedContinuation<Void, any Error>] = [:]
    private var pictureWaiter: (id: UUID, continuation: CheckedContinuation<Void, any Error>)?

    init(page: CanvasPage, instanceId: String) {
        self.page = page
        self.instanceId = instanceId
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(source: Self.host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        configuration.userContentController.addUserScript(WKUserScript(source: Self.errors, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #endif
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(CanvasMessages(self), name: "cawco")
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = Palette.surfaceRaised
        web.scrollView.backgroundColor = Palette.surfaceRaised
        web.scrollView.isScrollEnabled = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isInspectable = true
        web.accessibilityLabel = "Canvas"
        // The canvas's theme follows the app's (DESIGN.md: "its theme follows ours").
        web.registerForTraitChanges([UITraitUserInterfaceStyle.self]) { [weak self] (_: WKWebView, _: UITraitCollection) in
            guard let self else { return }
            deliver(["type": "cawco:theme", "theme": theme])
        }
        // The pencil's double-tap toggles the eraser (DESIGN.md, Pen rules on the canvas).
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        web.addInteraction(pencil)
        // A held stroke snapping to its shape ticks (`selection`); the engine
        // is readied as the pen touches down, so the tick lands on the snap.
        web.addGestureRecognizer(PenDown { [weak self] in self?.snapTick.prepare() })
    }

    private let snapTick = UISelectionFeedbackGenerator()

    private var theme: String { web.traitCollection.userInterfaceStyle == .dark ? "dark" : "light" }

    /// The pencil's double-tap, as the person set it in Settings: only
    /// switching to the eraser or to the tool before act; the canvas host
    /// toggles its eraser on it.
    func pencilInteraction(_: UIPencilInteraction, didReceiveTap _: UIPencilInteraction.Tap) {
        let action: String
        switch UIPencilInteraction.preferredTapAction {
        case .switchEraser: action = "eraser"
        case .switchPrevious: action = "previous"
        default: return
        }
        deliver(["type": "cawco:pencil-double-tap", "action": action])
    }

    func load() {
        broken = false
        refused = false
        connected = false
        guard let cookie = HTTPCookie(properties: [
            .name: "cawco-preview", .value: instanceId, .domain: page.origin.host() ?? "", .path: "/",
        ]) else {
            onFailed("The canvas's address can't carry its session.")
            return
        }
        let web = web
        let url = page.url
        #if DEBUG
        CanvasDebug.log.notice("canvas page sets its cookie for \(url.absoluteString, privacy: .public), domain \(cookie.domain, privacy: .public)")
        #endif
        web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie, completionHandler: {
            #if DEBUG
            CanvasDebug.log.notice("canvas page loads \(url.absoluteString, privacy: .public)")
            #endif
            web.load(URLRequest(url: url))
        })
    }

    /// Lets go of the page: its waiters hear it, its handler goes.
    func close() {
        web.stopLoading()
        web.configuration.userContentController.removeScriptMessageHandler(forName: "cawco")
        let gone = CanvasRefusal(message: "the canvas closed")
        for waiter in readyWaiters.values { waiter.resume(throwing: gone) }
        readyWaiters = [:]
        pictureWaiter?.continuation.resume(throwing: gone)
        pictureWaiter = nil
    }

    // MARK: Waiting on the page

    /// Resolves once the page has joined its document; refused after 10 s (stage.svelte.ts `ready`).
    func ready() async throws {
        if connected { return }
        let id = UUID()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
            readyWaiters[id] = continuation
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(10))
                guard let waiter = self?.readyWaiters.removeValue(forKey: id) else { return }
                waiter.resume(throwing: CanvasRefusal(message: "the canvas page didn't load within 10 s"))
            }
        }
    }

    /// The page draws its picture now and posts it to the hub; resolves once
    /// it has (`cawco:pictured`), refused after 5 s (stage.svelte.ts `picture`).
    func picture() async throws {
        guard connected else { throw CanvasRefusal(message: "the canvas page isn't connected to the hub") }
        pictureWaiter?.continuation.resume(throwing: CanvasRefusal(message: "the canvas was asked for its picture again"))
        let id = UUID()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
            pictureWaiter = (id, continuation)
            deliver(["type": "cawco:picture"])
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard let self, let waiter = pictureWaiter, waiter.id == id else { return }
                pictureWaiter = nil
                waiter.continuation.resume(throwing: CanvasRefusal(message: "the canvas didn't draw its picture within 5 s"))
            }
        }
    }

    // MARK: The page's words

    /// The listener's answer for the page: anything but the page itself (its
    /// refusal of the session, a missing canvas) is not loaded, and says so
    /// now rather than leaving a send to wait out `ready`.
    func webView(_: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        let status = (navigationResponse.response as? HTTPURLResponse)?.statusCode ?? 0
        #if DEBUG
        CanvasDebug.log.notice("canvas page answered \(status) for \(navigationResponse.response.url?.absoluteString ?? "?", privacy: .public)")
        #endif
        guard navigationResponse.isForMainFrame, status != 200 else { return decisionHandler(.allow) }
        // The cancel ends the navigation with WebKit's own "interrupted": this sentence stands.
        refused = true
        decisionHandler(.cancel)
        fail("the hub answered \(status) for its page")
    }

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        #if DEBUG
        CanvasDebug.log.notice("canvas page didFinish \(self.web.url?.absoluteString ?? "?", privacy: .public); hello for \(self.page.id, privacy: .public)")
        #endif
        connected = false
        // stage.svelte.ts `hello`: which artifact it is, where its doc is, where it stands.
        deliver([
            "type": "cawco:hello",
            "artifact": ["id": page.id, "kind": "canvas", "name": page.name],
            "sync": page.sync,
            "theme": theme,
        ])
        tellPlace()
        #if DEBUG
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            self?.web.evaluateJavaScript(Self.status) { value, error in
                let said = (value as? String) ?? error?.localizedDescription ?? "nothing"
                CanvasDebug.log.notice("canvas page holds \(said, privacy: .public)")
            }
        }
        #endif
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        failed(error)
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        failed(error)
    }

    func webViewWebContentProcessDidTerminate(_: WKWebView) {
        fail("its page stopped")
    }

    private func failed(_ error: any Error) {
        guard !refused else { return }
        fail(error.localizedDescription)
    }

    /// The page isn't there: whoever waits on it hears why now, and the next attach loads it again.
    private func fail(_ reason: String) {
        #if DEBUG
        CanvasDebug.log.error("canvas page failed at \(self.page.url.absoluteString, privacy: .public): \(reason, privacy: .public)")
        #endif
        connected = false
        broken = true
        let waiters = readyWaiters.values
        readyWaiters = [:]
        for waiter in waiters { waiter.resume(throwing: CanvasRefusal(message: "the canvas page didn't load: \(reason)")) }
        onFailed(reason)
    }

    /// What the page posted (CanvasStages.svelte `receive`). The page is the
    /// hub's own, but every field is still checked.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, let data = text.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = body["type"] as? String else { return }
        #if DEBUG
        if type == "cawco:debug" {
            return CanvasDebug.log.error("canvas page says \(String(describing: body["message"] ?? "?").prefix(600), privacy: .public)")
        }
        if type == "cawco:error" {
            CanvasDebug.log.error("canvas page posted cawco:error \(String(describing: body["of"] ?? "?"), privacy: .public): \(String(describing: body["message"] ?? "?").prefix(300), privacy: .public)")
        } else if type != "cawco:ink" {
            CanvasDebug.log.notice("canvas page posted \(type, privacy: .public)")
        }
        #endif
        switch type {
        case "cawco:ready":
            connected = true
            let waiters = readyWaiters.values
            readyWaiters = [:]
            for waiter in waiters { waiter.resume() }
        case "cawco:pictured":
            let waiter = pictureWaiter
            pictureWaiter = nil
            waiter?.continuation.resume()
        case "cawco:snap":
            // DESIGN.md, Pen rules on the canvas: "a `selection` tick under a finger".
            snapTick.selectionChanged()
        case "cawco:dock": onDock()
        case "cawco:undock": onUndock()
        case "cawco:done": onDone()
        default: break
        }
    }

    private func tellPlace() {
        deliver(["type": "cawco:place", "docked": docked])
    }

    /// Hands the page a message from its host, as the dashboard posts to its iframe.
    private func deliver(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__cawcoDeliver && window.__cawcoDeliver(\(json))", completionHandler: nil)
    }

    #if DEBUG
    /// The page's failures, to the Canvas log: a script's error, a file that
    /// didn't load, a rejection nobody caught, `console.error`.
    private static let errors = """
    (() => {
      const say = (message) => { try { window.webkit.messageHandlers.cawco.postMessage(JSON.stringify({ type: "cawco:debug", message: String(message) })); } catch {} };
      window.addEventListener("error", (event) => {
        const target = event.target;
        if (target && target !== window && (target.src || target.href)) say(`file didn't load: ${target.src || target.href}`);
        else say(`error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
      }, true);
      window.addEventListener("unhandledrejection", (event) => say(`unhandled: ${event.reason && (event.reason.stack || event.reason.message) || event.reason}`));
      const error = console.error;
      console.error = function (...parts) { say(`console.error: ${parts.map((part) => part && part.stack || String(part)).join(" ")}`); return error.apply(this, parts); };
    })();
    """

    /// What the page holds a few seconds after it loaded.
    private static let status = """
    JSON.stringify({
      root: document.getElementById("canvas-root")?.childElementCount ?? null,
      excalidraw: !!document.querySelector(".excalidraw"),
      artifact: typeof window.cawcoArtifact,
      size: [innerWidth, innerHeight],
      files: performance.getEntriesByType("resource").map((entry) => `${entry.name.split("/").slice(-2).join("/")}:${entry.responseStatus ?? "?"}`),
    })
    """
    #endif

    /// PreviewController's host script: what the page posts goes to the app,
    /// and what the app hands the page arrives at its message listeners from
    /// that same parent, on its own origin, as the overlay checks.
    private static let host = """
    (() => {
      const listeners = new Set();
      const host = { postMessage(data) { window.webkit.messageHandlers.cawco.postMessage(JSON.stringify(data)); } };
      const add = window.addEventListener;
      window.addEventListener = function (type, listener, options) {
        if (type === "message" && listener) listeners.add(listener);
        return add.call(this, type, listener, options);
      };
      const remove = window.removeEventListener;
      window.removeEventListener = function (type, listener, options) {
        if (type === "message") listeners.delete(listener);
        return remove.call(this, type, listener, options);
      };
      window.parent = host;
      window.__cawcoDeliver = (data) => {
        const event = { data, origin: location.origin, source: host };
        for (const listener of listeners) {
          try {
            if (typeof listener === "function") listener.call(window, event);
            else listener.handleEvent(event);
          } catch (error) { console.error(error); }
        }
      };
    })();
    """
}

/// Holds the page weakly: a content controller retains its handlers.
@MainActor
private final class CanvasMessages: NSObject, WKScriptMessageHandler {
    weak var target: CanvasWeb?
    init(_ target: CanvasWeb) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Hears a pen touch down on the canvas and lets it through untouched: it
/// never recognizes, so the page's own pointer events and WebKit's
/// gestures carry on as before.
private final class PenDown: UIGestureRecognizer {
    private let down: () -> Void

    init(_ down: @escaping () -> Void) {
        self.down = down
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        down()
        state = .failed
    }

    override func canPrevent(_: UIGestureRecognizer) -> Bool { false }
}

// MARK: The grab

/// The canvas's top edge (CanvasStages.svelte `.grab`): a 160 × 44 band with
/// the drawer's 100 × 6 grabber laid flat in it, `space1` from its top. It
/// drags the canvas's height; VoiceOver adjusts it a step at a time.
@MainActor
final class CanvasGrab: UIView {
    private let grabber = UIView()
    var onStep: (Double) -> Void = { _ in }

    override init(frame: CGRect) {
        super.init(frame: frame)
        grabber.backgroundColor = Palette.borderControl
        grabber.layer.cornerRadius = 3
        grabber.isUserInteractionEnabled = false
        addSubview(grabber)
        isAccessibilityElement = true
        accessibilityLabel = "Canvas height"
        accessibilityTraits = .adjustable
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CanvasGrab is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        grabber.frame = CGRect(x: (bounds.width - 100) / 2, y: Space.space1, width: 100, height: 6)
    }

    override func accessibilityIncrement() { onStep(CanvasMeasure.step) }
    override func accessibilityDecrement() { onStep(-CanvasMeasure.step) }
}

// MARK: The room

/// One draft canvas in the composer: its page, and while it stands over the
/// field the grown shape it stands in, its grab, and the motion running.
@MainActor
final class CanvasRoom: NSObject {
    private unowned let composer: ComposerView
    let id: String
    private(set) var web: CanvasWeb?
    /// The page's web view stands here: cut to the shape over the field, or
    /// parked out of sight (and out of reach) while the canvas is folded or
    /// docked, so it can still draw its picture for a send.
    let stage = UIView()
    private let cut = CAShapeLayer()
    let grab = CanvasGrab()
    private var halo: RecallHalo?
    /// Standing over the field (growing, grown or folding).
    private(set) var up = false
    /// A grow, a fold or a flight is running: the grab and a relayout wait.
    private(set) var moving = false

    /// Every size, read once before anything is written: the pill's width
    /// and height, how far the composer's top stands over the pill's (the
    /// chips, the tray), the canvas's bounds and its height now.
    struct Sizes: Equatable {
        var width: Double
        var base: Double
        var lift: Double
        var min: Double
        var max: Double
        var height: Double
        /// The pill's top, in the window, as measured.
        var top: Double
    }

    private(set) var sizes: Sizes?
    /// The height the reader chose by the grab, kept while it fits.
    private var chosen: Double?
    /// What the stage is cut to: the shape, or a box between the chip's and its own.
    private enum Cut {
        case shape
        case box(from: CGRect, to: CGRect, grow: Bool)
    }

    private var cutting = Cut.shape
    private let spring = FrameTicker()
    private var dragFrom = 0.0
    private var flight: UIViewPropertyAnimator?

    #if DEBUG
    /// Each paint of a run: its time and the shape's growth, and the cut's top against the shape's.
    struct Paint {
        let time: CFTimeInterval
        let open: Double
        let shapeTop: Double
        let cutTop: Double
    }

    private(set) var probePaints: [Paint] = []
    /// How many spring settles the grab has started, and where the last came to rest.
    private(set) var probeSettles = 0
    private(set) var probeRested: Double?
    #endif

    init(composer: ComposerView, id: String) {
        self.composer = composer
        self.id = id
        super.init()
        stage.clipsToBounds = true
        stage.backgroundColor = Palette.surfaceRaised
        stage.layer.mask = cut
        cut.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull()]
        stage.alpha = 0
        stage.isUserInteractionEnabled = false
        let drag = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        drag.maximumNumberOfTouches = 1
        grab.addGestureRecognizer(drag)
        grab.onStep = { [weak self] by in self?.step(by) }
        grab.isHidden = true
    }

    private var host: CanvasHost? { composer.binding?.canvasHost }

    /// The page, loaded once its place on the listener is known.
    func attach(_ page: CanvasPage, instanceId: String) -> CanvasWeb {
        if let web, web.page == page {
            if web.broken { web.load() }
            return web
        }
        web?.close()
        web?.web.removeFromSuperview()
        let made = CanvasWeb(page: page, instanceId: instanceId)
        made.onDone = { [weak self] in self?.composer.foldCanvas() }
        made.onDock = { [weak self] in self?.composer.dockCanvas() }
        made.onUndock = { [weak self] in self?.composer.undockCanvas() }
        made.onFailed = { [weak self] reason in self?.composer.canvasFailed("The canvas couldn't load: \(reason). Close it with Done, then open it again.") }
        made.web.frame = stage.bounds
        made.web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        stage.addSubview(made.web)
        web = made
        // Parked in the ring until it stands: it loads, and can draw, out of sight.
        if stage.superview == nil { composer.ring.addSubview(stage) }
        if stage.bounds.isEmpty { stage.frame = CGRect(x: 0, y: -400, width: max(320, composer.ring.bounds.width), height: 400) }
        made.load()
        return made
    }

    // MARK: Sizes

    /// The composer's sizes now, the canvas's height kept where it fits.
    private func measure() -> Sizes? {
        guard composer.window != nil, let column = host?.column() else { return nil }
        let ring = composer.ring
        let box = ring.convert(ring.bounds, to: nil)
        let lift = Double(ring.convert(ring.bounds, to: composer).minY)
        let ceiling = Double(column.minY) + Space.space3
        let most = max(0, Double(box.minY) - lift - ceiling - 1)
        let least = min(most, CanvasMeasure.floor * Double(column.height))
        let height = min(most, max(least, chosen ?? most))
        return Sizes(width: Double(ring.bounds.width), base: Double(ring.bounds.height), lift: lift, min: least, max: most,
                     height: height, top: Double(box.minY))
    }

    /// How far the shape reaches over the pill: the chips' row and the canvas.
    private func extra(_ sizes: Sizes) -> Double {
        sizes.lift + sizes.height + 1
    }

    /// The stage's box over the field, in the ring: a point inside the shape's edge.
    private func stageBox(_ sizes: Sizes) -> CGRect {
        CGRect(x: 1, y: -sizes.lift - sizes.height, width: sizes.width - 2, height: sizes.height)
    }

    private func place(_ sizes: Sizes) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let box = stageBox(sizes)
        stage.transform = .identity
        stage.frame = box
        cut.frame = stage.bounds
        grab.frame = CGRect(x: (sizes.width - CanvasMeasure.grabWidth) / 2, y: box.minY, width: CanvasMeasure.grabWidth, height: CanvasMeasure.grabHeight)
        CATransaction.commit()
        grab.accessibilityValue = "\(Int((sizes.height / max(1, sizes.max) * 100).rounded())) percent of the room"
    }

    // MARK: The shape and the cut

    private func newHalo(_ sizes: Sizes) -> RecallHalo {
        halo?.remove()
        let geometry = RecallGeometry(width: sizes.width, base: sizes.base, spread: 1, taperRows: 1)
        let halo = RecallHalo(geometry, extra: extra(sizes), fades: false)
        composer.ring.insertSubview(halo, belowSubview: composer.pill)
        halo.onPaint = { [weak self] path, box in self?.cutTo(path, box) }
        self.halo = halo
        return halo
    }

    /// The stage cut to what the shape shows this frame.
    private func cutTo(_ path: CGPath, _ box: CGRect) {
        let frame = stage.frame
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        switch cutting {
        case .shape:
            var shift = CGAffineTransform(translationX: box.minX - frame.minX, y: box.minY - frame.minY)
            cut.path = path.copy(using: &shift)
        case let .box(from, to, grow):
            let open = halo?.open ?? 1
            let t = Recall.drawer(grow ? open : 1 - open)
            let rect = CGRect(x: from.minX + (to.minX - from.minX) * t, y: from.minY + (to.minY - from.minY) * t,
                              width: from.width + (to.width - from.width) * t, height: from.height + (to.height - from.height) * t)
            let radius = grow ? Radius.radiusSm + (Radius.radiusLg - Radius.radiusSm) * t : Radius.radiusLg + (Radius.radiusSm - Radius.radiusLg) * t
            cut.path = UIBezierPath(roundedRect: rect, cornerRadius: radius).cgPath
        }
        #if DEBUG
        if moving {
            // The shape's box is its outline's: its top is the shape's top (in the ring).
            let shapeTop = Double(box.minY)
            let cutTop = (cut.path?.boundingBoxOfPath.minY).map { Double($0 + frame.minY) } ?? .nan
            probePaints.append(Paint(time: CACurrentMediaTime(), open: halo?.open ?? 1, shapeTop: shapeTop, cutTop: cutTop))
        }
        #endif
    }

    // MARK: Open

    /// The canvas stands up out of the pill (`chip` nil) or out of its chip's
    /// box (in the window): the shape grows over `durGrow` and the stage,
    /// already on its box, is uncovered by the same clock.
    func grow(from chip: CGRect?) {
        guard let web, let sizes = measure() else { return }
        stopAll()
        self.sizes = sizes
        up = true
        moving = true
        composer.canvasStands(true)
        let halo = newHalo(sizes)
        let ring = composer.ring
        if stage.superview !== ring { ring.addSubview(stage) }
        ring.insertSubview(stage, aboveSubview: halo)
        ring.insertSubview(grab, aboveSubview: stage)
        place(sizes)
        web.web.frame = stage.bounds
        stage.alpha = 1
        stage.isUserInteractionEnabled = true
        grab.isHidden = false
        grab.isUserInteractionEnabled = false
        cutting = chip.map { .box(from: stage.convert($0, from: nil), to: stage.bounds, grow: true) } ?? .shape
        #if DEBUG
        probePaints = []
        CanvasDebug.log.notice("canvas grows from \(chip == nil ? "the pill" : "its chip", privacy: .public): \(Int(sizes.height))pt of \(Int(sizes.min))–\(Int(sizes.max)), over \(Int(Motion.durGrow * 1000))ms")
        #endif
        halo.paint()
        let landed = { [weak self, weak halo] in
            guard let self, let halo, self.halo === halo else { return }
            moving = false
            cutting = .shape
            halo.paint()
            grab.isUserInteractionEnabled = true
            UIAccessibility.post(notification: .layoutChanged, argument: web.web)
            #if DEBUG
            let paints = probePaints
            if let first = paints.first, let last = paints.last {
                CanvasDebug.log.notice("canvas grew in \(Int(((last.time - first.time) * 1000).rounded()))ms over \(paints.count) paints")
            }
            #endif
        }
        if UIAccessibility.isReduceMotionEnabled {
            // Fades, nothing travels: the shape stands grown and both fade in.
            halo.morph(to: 1, extra: extra(sizes), duration: 0)
            for view in [halo, stage] as [UIView] { view.alpha = 0 }
            let fade = Motion.easeOut.animator(Motion.durFade) {
                halo.alpha = 1
                self.stage.alpha = 1
            }
            fade.addCompletion { _ in landed() }
            fade.startAnimation()
        } else {
            halo.morph(to: 1, extra: extra(sizes), duration: Motion.durGrow, done: landed)
        }
    }

    // MARK: Fold

    /// Done: the canvas folds into its chip over `durGrowExit`; `chip` is
    /// the chip's box in the window, laid out (hidden) before it folds.
    func fold(into chip: CGRect?, done: @escaping () -> Void) {
        guard up, let halo, let sizes else { return done() }
        stopAll()
        halo.unsettle()
        moving = true
        grab.isUserInteractionEnabled = false
        stage.isUserInteractionEnabled = false
        place(sizes)
        cutting = chip.map { .box(from: stage.bounds, to: stage.convert($0, from: nil), grow: false) } ?? .shape
        let finish = { [weak self] in
            guard let self else { return }
            putAway()
            done()
        }
        if UIAccessibility.isReduceMotionEnabled {
            let fade = Motion.easeOut.animator(Motion.durFade) {
                halo.alpha = 0
                self.stage.alpha = 0
            }
            fade.addCompletion { _ in finish() }
            fade.startAnimation()
        } else {
            halo.morph(to: 0, extra: extra(sizes), duration: Motion.durGrowExit, done: finish)
        }
    }

    /// The shape and the grab go; the page stays, parked out of sight.
    func putAway() {
        stopAll()
        halo?.remove()
        halo = nil
        grab.removeFromSuperview()
        grab.isHidden = true
        stage.alpha = 0
        stage.isUserInteractionEnabled = false
        stage.transform = .identity
        cutting = .shape
        up = false
        moving = false
        sizes = nil
        composer.canvasStands(false)
    }

    /// Gone at once: the page closes (another conversation, or the canvas left the message).
    func close() {
        docked = false
        follower.stop()
        putAway()
        web?.close()
        web = nil
        stage.removeFromSuperview()
    }

    private func stopAll() {
        spring.stop()
        halo?.stop()
        if let flight, flight.state == .active { flight.stopAnimation(true) }
        flight = nil
    }

    // MARK: Dock and Undock

    /// Docked: the same web view stands over the artifact panel's page (its
    /// rail reads Undock there), following the panel as it moves.
    private(set) var docked = false
    private let follower = FrameTicker()

    /// The flight landed: the stage stands over the panel's page, its edge the well's radius.
    func standInPanel() {
        stopAll()
        halo?.remove()
        halo = nil
        grab.removeFromSuperview()
        grab.isHidden = true
        up = false
        moving = false
        sizes = nil
        composer.canvasStands(false)
        if stage.superview !== composer.ring { composer.ring.addSubview(stage) }
        stage.layer.mask = nil
        stage.transform = .identity
        stage.layer.cornerRadius = Radius.radiusSm
        stage.layer.cornerCurve = .continuous
        stage.alpha = 1
        stage.isUserInteractionEnabled = true
        docked = true
        web?.docked = true
        follow()
    }

    /// The panel may be moving: the stage follows its page as drawn, frame
    /// by frame, until it has stood still for half a second (stage.svelte.ts
    /// `watch`'s tail). The panel gone, or showing another artifact, the
    /// canvas leaves it.
    func follow() {
        guard docked else { return }
        var still = 0.0
        var then = CACurrentMediaTime()
        follower.run { [weak self] time in
            guard let self, docked else { return false }
            guard let panel = composer.binding?.canvasHost?.panel(id) else {
                composer.canvasLeftPanel()
                return false
            }
            let box = composer.ring.convert(panel.shown, from: nil)
            let frame = stage.frame
            if abs(frame.minX - box.minX) > 0.25 || abs(frame.minY - box.minY) > 0.25
                || abs(frame.width - box.width) > 0.25 || abs(frame.height - box.height) > 0.25 {
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                stage.frame = box
                cut.frame = stage.bounds
                CATransaction.commit()
                still = 0
            } else {
                still += time - then
            }
            then = time
            return still < 0.5
        }
    }

    /// Undock under way: it stops following the panel (which closes under
    /// it) and stays drawn where it stands until it flies back.
    func leaveDockHolding() {
        docked = false
        follower.stop()
    }

    /// No longer over the panel: parked out of sight, the shape's cut back on.
    func leaveDock() {
        docked = false
        follower.stop()
        web?.docked = false
        stage.layer.cornerRadius = 0
        stage.layer.mask = cut
        stage.alpha = 0
        stage.isUserInteractionEnabled = false
    }

    /// Dock: the stage flies from its box over the field to the panel's
    /// page (`to`, in the window, at rest), one view on the drawer curve over
    /// `durPanel`, while the shape gives the field its room back on the
    /// composer's clock (`durControl`, ease-out); there it stays. With
    /// Reduce Motion it fades out over the field and in over the panel.
    func flyToPanel(_ to: CGRect, done: @escaping () -> Void) {
        guard up, let halo, let sizes else { return done() }
        stopAll()
        halo.unsettle()
        moving = true
        grab.isHidden = true
        stage.isUserInteractionEnabled = false
        place(sizes)
        cut.path = nil
        stage.layer.mask = nil
        let finish = { [weak self] in
            guard let self else { return }
            standInPanel()
            done()
        }
        if UIAccessibility.isReduceMotionEnabled {
            let out = Motion.easeOut.animator(Motion.durFade) {
                halo.alpha = 0
                self.stage.alpha = 0
            }
            out.addCompletion { [weak self] _ in
                guard let self else { return }
                standInPanel()
                stage.alpha = 0
                Motion.easeOut.animator(Motion.durFade) { self.stage.alpha = 1 }.startAnimation()
                done()
            }
            out.startAnimation()
            return
        }
        halo.morph(to: 0, extra: extra(sizes), duration: Motion.durControl)
        let target = composer.ring.convert(to, from: nil)
        let from = stage.frame
        // FLIP: the stage takes the panel's box and starts where it stood.
        stage.frame = target
        web?.web.frame = stage.bounds
        stage.transform = Self.mapping(from: target, to: from)
        let flight = UIViewPropertyAnimator(duration: Motion.durPanel, timingParameters: Motion.easeDrawer.parameters)
        flight.addAnimations { self.stage.transform = .identity }
        flight.addCompletion { _ in finish() }
        self.flight = flight
        flight.startAnimation()
    }

    /// Undock: the stage flies from the panel's box (`from`, in the window)
    /// to its place over the field while the shape takes the field's room
    /// again on the composer's clock.
    func flyFromPanel(_ from: CGRect) {
        guard web != nil, let sizes = measure() else { return }
        docked = false
        follower.stop()
        web?.docked = false
        stage.layer.cornerRadius = 0
        stopAll()
        self.sizes = sizes
        up = true
        moving = true
        composer.canvasStands(true)
        let halo = newHalo(sizes)
        let ring = composer.ring
        if stage.superview !== ring { ring.addSubview(stage) }
        ring.insertSubview(stage, aboveSubview: halo)
        ring.insertSubview(grab, aboveSubview: stage)
        place(sizes)
        web?.web.frame = stage.bounds
        stage.layer.mask = nil
        stage.alpha = 1
        grab.isHidden = true
        let landed = { [weak self, weak halo] in
            guard let self, let halo, self.halo === halo else { return }
            moving = false
            stage.layer.mask = cut
            cutting = .shape
            halo.paint()
            stage.isUserInteractionEnabled = true
            grab.isHidden = false
            grab.isUserInteractionEnabled = true
            halo.settle()
        }
        if UIAccessibility.isReduceMotionEnabled {
            halo.morph(to: 1, extra: extra(sizes), duration: 0)
            halo.alpha = 0
            stage.alpha = 0
            let fade = Motion.easeOut.animator(Motion.durFade) {
                halo.alpha = 1
                self.stage.alpha = 1
            }
            fade.addCompletion { _ in landed() }
            fade.startAnimation()
            return
        }
        halo.paint()
        halo.morph(to: 1, extra: extra(sizes), duration: Motion.durControl)
        stage.transform = Self.mapping(from: stage.frame, to: ring.convert(from, from: nil))
        let flight = UIViewPropertyAnimator(duration: Motion.durPanel, timingParameters: Motion.easeDrawer.parameters)
        flight.addAnimations { self.stage.transform = .identity }
        flight.addCompletion { _ in landed() }
        self.flight = flight
        flight.startAnimation()
    }

    /// The transform that draws a view laid out at `box` over `other` (both in its superview).
    private static func mapping(from box: CGRect, to other: CGRect) -> CGAffineTransform {
        guard box.width > 0, box.height > 0 else { return .identity }
        let sx = other.width / box.width, sy = other.height / box.height
        return CGAffineTransform(translationX: other.midX - box.midX, y: other.midY - box.midY).scaledBy(x: sx, y: sy)
    }

    // MARK: Resize

    /// Writes the canvas at `height` this frame: its box, the grab, the shape and the cut.
    private func write(_ height: Double) {
        guard var sizes, let halo else { return }
        sizes.height = height
        self.sizes = sizes
        place(sizes)
        halo.stand(extra: extra(sizes))
    }

    /// The height under the finger: 1:1 inside its bounds, rubber-banded past them.
    private func follow(_ height: Double, _ sizes: Sizes) -> Double {
        let past = height > sizes.max ? height - sizes.max : min(0, height - sizes.min)
        guard past != 0 else { return height }
        let bound = past > 0 ? sizes.max : sizes.min
        let reach = min(abs(past) * CanvasMeasure.rubber, bound * CanvasMeasure.rubberMax)
        return bound + (past > 0 ? reach : -reach)
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        guard up, !moving, let sizes else { return }
        switch pan.state {
        case .began:
            // A settle caught mid-way is taken from where it stands.
            spring.stop()
            halo?.unsettle()
            dragFrom = sizes.height
        case .changed:
            write(follow(dragFrom - Double(pan.translation(in: composer).y), sizes))
        case .ended, .cancelled:
            // Up is taller: the height's speed, points a second.
            let speed = -Double(pan.velocity(in: composer).y)
            let now = sizes.height
            let target = min(sizes.max, max(sizes.min, now + speed * CanvasMeasure.project * 1000))
            chosen = target
            settle(from: now, to: target, speed: speed)
        default:
            break
        }
    }

    /// The house spring from `now` to `target`, leaving at `speed`: one
    /// spring, stepped each frame, which a new press catches where it is.
    private func settle(from now: Double, to target: Double, speed: Double) {
        #if DEBUG
        probeSettles += 1
        probeRested = nil
        #endif
        guard !UIAccessibility.isReduceMotionEnabled, composer.window != nil else {
            rest(at: target)
            return
        }
        var house = HouseSpring(x: now - target, v: speed, target: target)
        var then = CACurrentMediaTime()
        spring.run { [weak self] time in
            guard let self else { return false }
            let dt = min(0.05, time - then)
            then = time
            let still = house.step(dt)
            guard !still else {
                rest(at: target)
                return false
            }
            write(target + house.x)
            return true
        }
    }

    private func rest(at target: Double) {
        write(target)
        halo?.settle()
        #if DEBUG
        probeRested = target
        CanvasDebug.log.notice("canvas rests at \(Int(target.rounded()))pt of \(Int(self.sizes?.min ?? 0))–\(Int(self.sizes?.max ?? 0))")
        #endif
    }

    /// VoiceOver's step on the grab.
    private func step(_ by: Double) {
        guard up, !moving, let sizes else { return }
        let height = min(sizes.max, max(sizes.min, sizes.height + by))
        chosen = height
        spring.stop()
        rest(at: height)
    }

    /// The window, the keyboard or the field moved the pill: the canvas keeps its height where it fits.
    func relayout() {
        // Docked, it stands over the panel's page, wherever the composer moved.
        if docked { return follow() }
        guard up, !moving, !spring.running, let before = sizes, let next = measure() else { return }
        guard abs(next.width - before.width) > 0.5 || abs(next.base - before.base) > 0.5 || abs(next.lift - before.lift) > 0.5
            || abs(next.top - before.top) > 0.5 || abs(next.max - before.max) > 0.5 else { return }
        sizes = next
        if abs(next.width - before.width) > 0.5 {
            newHalo(next).morph(to: 1, extra: extra(next), duration: 0)
        } else {
            halo?.base = next.base
        }
        write(next.height)
        halo?.settle()
    }

    #if DEBUG
    /// The probe's grab: a drag to `height` released at `speed`, as the finger's.
    func probeDrag(to height: Double, speed: Double) {
        guard up, !moving, let sizes else { return }
        spring.stop()
        halo?.unsettle()
        write(follow(height, sizes))
        let now = self.sizes?.height ?? height
        let target = min(sizes.max, max(sizes.min, now + speed * CanvasMeasure.project * 1000))
        chosen = target
        settle(from: now, to: target, speed: speed)
    }

    var probeSpringRunning: Bool { spring.running }
    var probeHalo: RecallHalo? { halo }
    #endif
}
