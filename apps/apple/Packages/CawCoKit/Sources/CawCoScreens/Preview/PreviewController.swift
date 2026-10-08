import CawCoCore
import CawCoDesign
import UIKit
import WebKit

/// A session's preview (preview/PreviewPane.svelte): its header (title and
/// path, Send picks, Select, Reload, Close) over the page, which a web view
/// loads from the hub's preview listener, naming the session in its
/// `cawco-preview` cookie. The page carries the agent's overlay, which talks
/// to its host as an iframe talks to the dashboard: the script injected here
/// stands in for that parent window, so the overlay, its element picker and
/// the page's choices bridge run unchanged.
final class PreviewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private let hub: HubConnection
    let instanceId: String
    /// A picked element, as the composer's attachments: its `selection.md`, and its picture when the overlay took one.
    var onSelect: ([ComposerAttachment]) -> Void = { _ in }

    private var web: WKWebView!
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let pathLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    private var sendButton: UIButton!
    private var selectButton: UIButton!
    private var reloadButton: UIButton!
    private var closeButton: UIButton!
    /// The header: on a phone, a handle of the drawer (SessionViewController drags it).
    private(set) var dragArea: UIView!
    /// The drawer's grabber and its 44pt hit area (SideSheet.svelte `.preview-grab`):
    /// the drawer's other handle, which a tap moves between its heights.
    let grabArea = GrabArea()
    private let grabber = UIView()
    private var headTop: NSLayoutConstraint!
    private let well = UIView()
    private let cover = UIView()
    private let failure = KitAlert(tone: .destructive)
    private var revision: String?
    private var origin: URL?
    private var selecting = false
    private var connected = false
    private var closing = false
    /// The canvas's choices as the hub last answered them: Send picks shows while some are unsent.
    private var choices: [String: Any]?

    init(hub: HubConnection, instanceId: String) {
        self.hub = hub
        self.instanceId = instanceId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("PreviewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised

        // The header: `height: 44px`, the identity then the actions, `gap-1`.
        // The identity gives way to the actions: its title is one line cut at
        // its tail, its path one line cut in its middle, and both stop 8pt
        // short of the first action.
        titleLabel.lineBreakMode = .byTruncatingTail
        pathLabel.lineBreakMode = .byTruncatingMiddle
        let identity = UIStackView(arrangedSubviews: [titleLabel, pathLabel])
        identity.axis = .vertical
        identity.isLayoutMarginsRelativeArrangement = true
        identity.directionalLayoutMargins.leading = Space.space1
        identity.directionalLayoutMargins.trailing = 8 - Space.space1
        for part in [identity, titleLabel, pathLabel] as [UIView] {
            part.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            part.setContentHuggingPriority(.defaultLow, for: .horizontal)
        }
        sendButton = KitButton.make("Send picks", glyph: Glyph.send, variant: .ghost, height: .sm) { [weak self] in self?.sendPicks(nil) }
        selectButton = KitButton.make("Select", glyph: .toolScreen, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            select(!selecting)
        }
        // Selecting shows on Select as `surface-fill`, as the web's `aria-pressed`
        // header button does (SideSurface.svelte), over the kit's resting paint.
        let restingSelect = selectButton.configurationUpdateHandler
        selectButton.configurationUpdateHandler = { button in
            restingSelect?(button)
            if button.isSelected { button.configuration?.background.backgroundColor = Palette.surfaceFill }
        }
        let reload = KitButton.make("", glyph: .refresh, variant: .ghost, height: .sm) { [weak self] in self?.reload() }
        reload.accessibilityLabel = "Reload"
        // While selecting, what would leave the page waits at half ink (PreviewPane.svelte `.selecting .other`).
        let restingReload = reload.configurationUpdateHandler
        reload.configurationUpdateHandler = { [weak self] button in
            restingReload?(button)
            if self?.selecting == true { button.alpha = 0.5 }
        }
        reloadButton = reload
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.close() }
        closeButton.accessibilityLabel = "Close"
        sendButton.isHidden = true
        selectButton.isEnabled = false
        let head = UIStackView(arrangedSubviews: [identity, sendButton, selectButton, reload, closeButton])
        head.spacing = Space.space1
        head.alignment = .center
        head.translatesAutoresizingMaskIntoConstraints = false
        dragArea = head
        for button in [sendButton!, selectButton!, reload, closeButton!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }

        // The page, in a web view of its own: its own cookie store, holding
        // only this session's `cawco-preview`.
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(source: Self.host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(WeakHandler(self), name: "cawco")
        configuration.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = Palette.surfaceRecess
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isInspectable = true

        // `.well`: a hairline at `--radius-sm` on the recess; selecting turns its edge the accent.
        well.translatesAutoresizingMaskIntoConstraints = false
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.cornerCurve = .continuous
        well.layer.borderWidth = 1
        well.clipsToBounds = true
        well.backgroundColor = Palette.surfaceRecess
        cover.translatesAutoresizingMaskIntoConstraints = false
        cover.backgroundColor = Palette.surfaceRecess
        cover.isUserInteractionEnabled = false
        let line = SkeletonView(height: 11)
        cover.addSubview(line)
        failure.isHidden = true
        for part in [web!, cover, failure] as [UIView] { well.addSubview(part) }

        // The grabber, `space-1` from the top, centred, 100×6 in the control
        // edge; its hit area is 44pt tall about it (vaul's handle hit area),
        // over the header, which yields to the header's actions.
        grabArea.yields = [sendButton, selectButton, reload, closeButton]
        grabber.translatesAutoresizingMaskIntoConstraints = false
        grabber.backgroundColor = Palette.borderControl
        grabber.layer.cornerRadius = 3
        grabber.isUserInteractionEnabled = false
        grabArea.translatesAutoresizingMaskIntoConstraints = false
        grabArea.addSubview(grabber)
        grabArea.isAccessibilityElement = true
        grabArea.accessibilityLabel = "Drawer height"
        grabArea.accessibilityHint = "Moves the preview between its heights."
        grabArea.accessibilityTraits = .button
        grabArea.isHidden = true
        view.addSubview(head)
        view.addSubview(well)
        view.addSubview(grabArea)
        headTop = head.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        NSLayoutConstraint.activate([
            grabArea.topAnchor.constraint(equalTo: view.topAnchor),
            grabArea.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            grabArea.widthAnchor.constraint(equalToConstant: 100 + 44),
            grabArea.heightAnchor.constraint(equalToConstant: 44),
            grabber.topAnchor.constraint(equalTo: grabArea.topAnchor, constant: Space.space1),
            grabber.centerXAnchor.constraint(equalTo: grabArea.centerXAnchor),
            grabber.widthAnchor.constraint(equalToConstant: 100),
            grabber.heightAnchor.constraint(equalToConstant: 6),
            headTop,
            head.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space2),
            head.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2),
            head.heightAnchor.constraint(equalToConstant: 44),
            well.topAnchor.constraint(equalTo: head.bottomAnchor),
            well.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space2),
            well.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2),
            well.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Space.space2),
            web.topAnchor.constraint(equalTo: well.topAnchor),
            web.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            cover.topAnchor.constraint(equalTo: well.topAnchor),
            cover.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            cover.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            line.topAnchor.constraint(equalTo: cover.topAnchor, constant: Space.space5),
            line.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: Space.space5),
            line.widthAnchor.constraint(equalTo: cover.widthAnchor, multiplier: 0.42),
            failure.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            failure.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            failure.bottomAnchor.constraint(equalTo: well.bottomAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: PreviewController, _: UITraitCollection) in controller.paintWell() }
        paintWell()
        show()
    }

    /// As the phone's drawer it wears the grabber, and its header stands
    /// `space-3` under the drawer's top (SideSheet.svelte `.sheet`); beside
    /// the transcript it has neither.
    func standsAsDrawer(_ drawer: Bool) {
        loadViewIfNeeded()
        grabArea.isHidden = !drawer
        headTop.constant = drawer ? Space.space3 : 0
    }

    /// The preview as the hub says it now: a new revision (another page, or
    /// the same rebuilt) loads afresh, named by its source until the page
    /// says its own title and path. The same revision keeps what the page said.
    func show() {
        guard isViewLoaded, let frame = hub.previews.byInstance[instanceId], frame.state == .open,
              let origin = hub.previewOrigin(frame) else { return }
        guard frame.revision != revision else { return }
        revision = frame.revision
        titleLabel.text = frame.source?.value3.map { _ in "Decision page" } ?? "Preview"
        pathLabel.text = Self.place(frame)
        self.origin = origin
        connected = false
        choices = nil
        sendButton.isHidden = true
        selectButton.isEnabled = false
        cover.alpha = 1
        let cookie = HTTPCookie(properties: [
            .name: "cawco-preview", .value: instanceId, .domain: origin.host() ?? "", .path: "/",
        ])
        let web = web!
        guard let cookie else { return }
        web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
            web.load(URLRequest(url: origin))
        }
    }

    // MARK: The page

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = 0 }.startAnimation()
        // The overlay answers its host's hello with `cawco:ready`.
        deliver(["type": "cawco:hello"])
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) { failed(error.localizedDescription) }
    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) { failed(error.localizedDescription) }

    /// What the page posted to its host: the overlay's messages, and the
    /// choices bridge's JSON-RPC (wire.ts reads them the same way). The
    /// page is code an agent wrote: every field is checked and bounded.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, let data = text.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if body["jsonrpc"] as? String == "2.0" {
            answer(body)
            return
        }
        switch body["type"] as? String {
        case "cawco:ready", "cawco:navigated":
            if let at = (body["url"] as? String).flatMap(URL.init(string:)), at.host() == origin?.host(), at.port == origin?.port {
                pathLabel.text = at.path() + (at.query().map { "?\($0)" } ?? "")
            }
            if let title = Self.text(body["title"], 300), !title.isEmpty { titleLabel.text = title }
            if body["type"] as? String == "cawco:ready" {
                connected = true
                selectButton.isEnabled = true
                select(selecting)
            }
        case "cawco:selected":
            guard selecting, let element = body["element"] as? [String: Any], let markdown = Self.selection(element) else { return }
            var attachments: [ComposerAttachment] = [.text(name: "selection.md", content: markdown)]
            if let png = (body["png"] as? String).flatMap(Self.png) {
                attachments.append(.image(name: "selection.png", mediaType: "image/png", data: png))
            }
            UISelectionFeedbackGenerator().selectionChanged()
            onSelect(attachments)
            if let error = Self.text(body["error"], 300) { failed(error) }
        case "cawco:escape":
            select(false)
        case "cawco:error":
            failed(Self.text(body["message"], 300) ?? "The preview reported an error.")
        default:
            break
        }
    }

    private func select(_ on: Bool) {
        selecting = on
        selectButton.isSelected = on
        reloadButton.setNeedsUpdateConfiguration()
        paintWell()
        deliver(["type": "cawco:mode", "mode": on ? "select" : "off"])
    }

    private func reload() {
        failure.isHidden = true
        revision = nil
        show()
    }

    private func failed(_ message: String) {
        failure.label.text = message
        failure.isHidden = false
    }

    private func paintWell() {
        well.layer.borderColor = (selecting ? Palette.accent : Palette.borderHairline).resolvedColor(with: traitCollection).cgColor
        well.layer.borderWidth = selecting ? Size.focusRingWidth : 1
    }

    /// Hands the page a message from its host, as the dashboard's pane posts to its iframe.
    private func deliver(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__cawcoDeliver && window.__cawcoDeliver(\(json))")
    }

    // MARK: The choices bridge (PreviewPane.svelte `answer`)

    private static let rpcMethods: Set<String> = ["ui/initialize", "ui/notifications/initialized", "ping", "tools/call", "ui/update-model-context", "ui/message"]

    private func answer(_ rpc: [String: Any]) {
        guard let method = rpc["method"] as? String, Self.rpcMethods.contains(method) else { return }
        let id = rpc["id"]
        let params = rpc["params"] as? [String: Any] ?? [:]
        let reply = { [weak self] (result: Any) in
            if let id { self?.deliver(["jsonrpc": "2.0", "id": id, "result": result]) }
        }
        let refuse = { [weak self] (code: Int, message: String) in
            if let id { self?.deliver(["jsonrpc": "2.0", "id": id, "error": ["code": code, "message": message]]) }
        }
        Task { [weak self] in
            guard let self else { return }
            do {
                switch method {
                case "ui/initialize":
                    reply(["protocolVersion": "2026-01-26", "hostInfo": ["name": "cawco", "version": "1.0.0"],
                           "hostCapabilities": ["serverTools": [:] as [String: Any]], "hostContext": ["platform": "mobile"]])
                case "ping":
                    reply([:] as [String: Any])
                case "tools/call":
                    guard params["name"] as? String == "read_choices" else {
                        refuse(-32_601, "A preview can call read_choices only.")
                        return
                    }
                    let state = try await choicesCall("GET")
                    reply(Self.toolResult(state))
                case "ui/update-model-context":
                    guard let change = params["structuredContent"] as? [String: Any] else {
                        refuse(-32_602, "That change is not a choice the bridge keeps.")
                        return
                    }
                    heard(try await choicesCall("PUT", body: change))
                    reply([:] as [String: Any])
                case "ui/message":
                    let content = params["content"] as? [String: Any]
                    guard params["role"] as? String == "user", content?["type"] as? String == "text",
                          let text = Self.text(content?["text"], 2000) else {
                        refuse(-32_602, "A message is a user's text.")
                        return
                    }
                    try await send(text)
                    reply([:] as [String: Any])
                default:
                    break
                }
            } catch {
                refuse(-32_000, error.localizedDescription)
                Toast.error(error.localizedDescription, in: view)
            }
        }
    }

    private func choicesCall(_ method: String, path: String = "", body: [String: Any]? = nil) async throws -> [String: Any] {
        let data = try await hub.previewChoices(instanceId, method: method, path: path,
            body: try body.map { try JSONSerialization.data(withJSONObject: $0) })
        let state = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        choices = state
        sendButton.isHidden = !unsent
        return state
    }

    /// Picks the session has not heard yet.
    private var unsent: Bool {
        guard let choices, let entries = choices["choices"] as? [String: [String: Any]] else { return false }
        let sentAt = choices["sentAt"] as? String
        return entries.values.contains { entry in sentAt == nil || (entry["at"] as? String ?? "") > (sentAt ?? "") }
    }

    private func heard(_ state: [String: Any]) {
        deliver(["jsonrpc": "2.0", "method": "ui/notifications/tool-result", "params": Self.toolResult(state)])
    }

    private func send(_ text: String?) async throws {
        heard(try await choicesCall("POST", path: "/send", body: text.map { ["text": $0] } ?? [:]))
    }

    private func sendPicks(_ text: String?) {
        Task { [weak self] in
            do { try await self?.send(text) } catch { Toast.error(error.localizedDescription, in: self?.view) }
        }
    }

    private static func toolResult(_ state: [String: Any]) -> [String: Any] {
        let text = (try? JSONSerialization.data(withJSONObject: state)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return ["content": [["type": "text", "text": text]], "structuredContent": state]
    }

    // MARK: Closing

    /// Close: the hub closes the preview, and the session's screen takes it
    /// away. `refused` hears when the hub keeps it open (the reason is said
    /// over the page), so a drawer swiped away can come back.
    func close(refused: @escaping () -> Void = {}) {
        guard !closing else { return }
        closing = true
        closeButton.isEnabled = false
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.closePreview(instanceId)
            } catch {
                failed(error.localizedDescription)
                refused()
            }
            closing = false
            closeButton.isEnabled = true
        }
    }

    // MARK: What a selection says (selection.ts `selectionExtras`)

    private static func text(_ value: Any?, _ max: Int) -> String? {
        (value as? String).map { String($0.prefix(max)) }
    }

    private static func png(_ value: String) -> Data? {
        guard !value.isEmpty, value.count <= 4_000_000 else { return nil }
        return Data(base64Encoded: value)
    }

    /// One picked element as the `selection.md` the web's send carries.
    static func selection(_ element: [String: Any]) -> String? {
        guard let selector = text(element["selector"], 1000), let tag = text(element["tag"], 200),
              let html = text(element["html"], 2000), let body = text(element["text"], 200),
              let url = text(element["url"], 1000),
              let rect = element["rect"] as? [String: Any], let page = element["page"] as? [String: Any]
        else { return nil }
        _ = tag
        let number = { (value: Any?) in (value as? Double).map { $0.formatted(.number.grouping(.never)) } ?? "?" }
        let styles = element["styles"] as? [String: Any] ?? [:]
        let style = { (key: String) in text(styles[key], 200) ?? "" }
        let source = element["source"] as? [String: Any]
        let location: String
        if let source, let file = text(source["file"], 1000) {
            location = "\(file):\(number(source["line"])):\(number(source["column"])) (\(text(source["framework"], 40) ?? "?"), \(text(source["of"], 200) ?? "?"))"
        } else {
            let component = source.flatMap { text($0["component"], 200) }.map { "; component: \($0) (\(text(source?["framework"], 40) ?? "?"), \(text(source?["of"], 200) ?? "?"))" } ?? ""
            location = "unknown (the app exposes no dev source metadata)\(component)"
        }
        // A longer fence keeps captured page HTML inside its code block.
        let longest = html.matches(of: /`+/).map(\.output.count).max() ?? 0
        let fence = String(repeating: "`", count: max(3, longest + 1))
        let quoted = { (value: String) in
            (try? JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed]))
                .flatMap { String(data: $0, encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "\"\(value)\""
        }
        return """
        # Selected in the preview (\(url))

        ## 1. \(selector)
        - source: \(location)
        - url: \(url)
        - size: \(number(rect["width"]))x\(number(rect["height"])) at (\(number(page["x"])),\(number(page["y"]))) in the page
        - text: \(quoted(body))
        - styles: color \(style("color")); background \(style("backgroundColor")); font \(style("fontFamily")) \(style("fontSize"))/\(style("lineHeight")) \(style("fontWeight"))

        \(fence)html
        \(html)
        \(fence)
        """
    }

    /// source.ts `previewPlace`.
    private static func place(_ frame: PreviewFrame) -> String {
        if let page = frame.source?.value3?.page { return "decisions/\(page)" }
        if let dir = frame.source?.value2?.dir { return (dir as NSString).lastPathComponent }
        return ""
    }

    /// Stands in for the dashboard's window, the overlay's `window.parent`:
    /// what the page posts goes to the app, and what the app hands the page
    /// arrives at its message listeners from that same parent, on its own
    /// origin, as the overlay checks.
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

/// The grabber's hit area: 44pt about the grabber, except where one of the
/// header's actions stands, which keeps its own touches. A tap on it, or
/// VoiceOver's activate, is its primary action (a plain control sends none).
final class GrabArea: UIControl {
    var yields: [UIView] = []

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        // Where UIKit's touch-up-inside would fire: a touch the window's reach handed over counts.
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }

    override func accessibilityActivate() -> Bool {
        sendActions(for: .primaryActionTriggered)
        return true
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard super.point(inside: point, with: event) else { return false }
        return !yields.contains { action in
            action.window != nil && !action.isHidden && action.bounds.contains(action.convert(point, from: self))
        }
    }
}

/// Holds the preview weakly: a content controller retains its handlers.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
