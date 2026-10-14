import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit
import WebKit

/// A session's preview (preview/PreviewPane.svelte): its header (the
/// artifact's name and path, Send N, Pins, Comment, Reload, Close) over the
/// page, which a web view loads from the hub's preview listener, naming the
/// session in its `cawco-preview` cookie. The page carries the agent's
/// overlay, which talks to its host as an iframe talks to the dashboard: the
/// script injected here stands in for that parent window, so the overlay
/// runs unchanged. The page keeps its own state in its artifact's document,
/// which the overlay joins itself on the path the hello names (Projects spec
/// §5.10); the overlay draws the person's pins on the page, and the app
/// reads them through the hub (§5.7) for their list and the open pin's card.
final class PreviewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIPencilInteractionDelegate {
    private let hub: HubConnection
    let instanceId: String

    private var web: WKWebView!
    private let titleLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let pathLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
    /// Send N: every pick, pin and reply the session has not heard, as one turn.
    private var sendButton: UIButton!
    private var sending = false
    private var pinsButton: UIButton!
    private let pinsBadge = KitBadge("0")
    private var commentButton: UIButton!
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
    /// While commenting, one line on the well's top edge says what a tap does now.
    private let commentingNote = UIView()
    private var commentingNoteHeight: NSLayoutConstraint!
    private let cover = UIView()
    /// The cover's loading line, hidden once the cover has faded so its sweep stops.
    private let coverLine = SkeletonView(height: 11)
    private let failure = KitAlert(tone: .destructive)
    /// What the band's failure is of (PreviewPane.svelte `failure.again`):
    /// "send" goes again from Send N, "field" clears when the page keeps the
    /// field after all, "pins" when the pins are read again; nil, anything
    /// else, goes again from Reload.
    private var failureOf: String?
    private var revision: String?
    private var artifactId: String?
    private var origin: URL?
    /// Comment mode, which the person turns on and nothing else does: every
    /// new document, revision, Reload and Close starts the page with it off.
    private var commenting = false
    /// The moved pin the next tap places again, and whether Comment mode was off before.
    private var placing: String?
    private var placingLeaves = false
    private var connected = false
    private var closing = false
    /// As the phone's drawer: the card stands at the well's foot.
    private var drawer = false

    // The pins (Projects spec §5.7; tsk-3).
    private var comments: ArtifactComments = .empty
    private var reading = false
    private var readAgain = false
    private var polling: Task<Void, Never>?
    /// How often the pins are read while the pane is on screen. Our call, until the hub pushes them.
    private static let pollEvery = Duration.seconds(3)
    private let card = PinCard()
    private var cardPlace: [NSLayoutConstraint] = []
    private var cardDrawerPlace: [NSLayoutConstraint] = []
    private var cardLeft: NSLayoutConstraint!
    private var cardTop: NSLayoutConstraint!
    private var cardWidth: NSLayoutConstraint!
    private var cardShort: NSLayoutConstraint!
    /// The card's reply field has the keyboard.
    private var writing = false
    /// The pin whose card is open, and its disc in the page's viewport as the page tells it.
    private var openPin: String?
    private var pinAt: (x: Double, y: Double, r: Double)?
    /// The pin J and K stand on.
    private var focusedPin: String?
    private var thumbs: [String: Data] = [:]
    /// What went wrong with the open card's reply, resolve or send.
    private var cardError: String?
    private var replying = false
    private var resolving = false
    private weak var list: PinListController?
    /// The overlay's answers waited on, by what was asked and of which pin
    /// ("reply:<id>", "resolve:<id>"): nil when it was kept, else why not.
    private var answers: [String: CheckedContinuation<String?, Never>] = [:]
    /// How long the page has to answer a reply or a resolve. Our call: the overlay writes its doc at once.
    private static let answerWithin = Duration.seconds(10)
    /// Whether the session's turn runs now (its activity pulse), and the pins the agent works on.
    private var sessionWorking = false
    private var live: Set<String> = []

    // This view's word to the hub that the artifact is on screen (`shown`).
    /// The revision the hub has heard about, and what this view has to say of the current one.
    private var shownFor: String?
    private var shownWord: (revision: String, failure: ShownFailure?)?
    private var silence: Task<Void, Never>?
    /// How long a loaded page has for its overlay to answer the hello (PreviewPane.svelte `PAGE_SILENT_MS`).
    private static let silentAfter = Duration.seconds(3)
    #if DEBUG
    private var commentedAtLaunch = false
    private var sentAtLaunch = false
    private var repliedAtLaunch = false
    #endif

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
        sendButton = KitButton.make("Send 0", glyph: Glyph.send, variant: .ghost, height: .sm) { [weak self] in self?.send() }
        pinsButton = KitButton.make("Pins", glyph: .pin, variant: .ghost, height: .sm) { [weak self] in self?.openList() }
        pinsBadge.isUserInteractionEnabled = false
        pinsBadge.isAccessibilityElement = false
        pinsButton.addSubview(pinsBadge)
        pinsButton.isHidden = true
        commentButton = KitButton.make("Comment", glyph: .comment, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            comment(!commenting)
        }
        commentButton.accessibilityLabel = "Comment"
        // Commenting shows on Comment as `surface-fill`, as the web's
        // `aria-pressed` header button does (SideSurface.svelte), over the kit's resting paint.
        let restingComment = commentButton.configurationUpdateHandler
        commentButton.configurationUpdateHandler = { button in
            restingComment?(button)
            if button.isSelected { button.configuration?.background.backgroundColor = Palette.surfaceFill }
        }
        let reload = KitButton.make("", glyph: .refresh, variant: .ghost, height: .sm) { [weak self] in self?.reload() }
        reload.accessibilityLabel = "Reload"
        // While commenting, what would leave the page waits at half ink (PreviewPane.svelte `.commenting .other`).
        let restingReload = reload.configurationUpdateHandler
        reload.configurationUpdateHandler = { [weak self] button in
            restingReload?(button)
            if self?.commenting == true { button.alpha = 0.5 }
        }
        reloadButton = reload
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.close() }
        closeButton.accessibilityLabel = "Close"
        commentButton.isEnabled = false
        let head = UIStackView(arrangedSubviews: [identity, sendButton, pinsButton, commentButton, reload, closeButton])
        head.spacing = Space.space1
        head.alignment = .center
        head.translatesAutoresizingMaskIntoConstraints = false
        dragArea = head
        for button in [sendButton!, pinsButton!, commentButton!, reload, closeButton!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        NSLayoutConstraint.activate([
            pinsBadge.centerYAnchor.constraint(equalTo: pinsButton.centerYAnchor),
            pinsBadge.trailingAnchor.constraint(equalTo: pinsButton.trailingAnchor, constant: -(Space.space3 + 1)),
        ])

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
        // The pencil's double-tap goes to the page, as the person set it (slice 5b).
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        web.addInteraction(pencil)

        // `.well`: a hairline at `--radius-sm` on the recess; commenting turns its edge the accent.
        well.translatesAutoresizingMaskIntoConstraints = false
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.cornerCurve = .continuous
        well.layer.borderWidth = 1
        well.clipsToBounds = true
        well.backgroundColor = Palette.surfaceRecess
        // The mode in words, 28pt on the well's top edge, which the page gives
        // way to while commenting and takes back when it ends.
        commentingNote.translatesAutoresizingMaskIntoConstraints = false
        commentingNote.backgroundColor = Palette.surfaceRecess
        commentingNote.clipsToBounds = true
        commentingNote.isUserInteractionEnabled = false
        let noteLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        noteLabel.text = "Commenting: tap an element on the page"
        noteLabel.lineBreakMode = .byTruncatingTail
        noteLabel.translatesAutoresizingMaskIntoConstraints = false
        commentingNote.addSubview(noteLabel)
        commentingNoteHeight = commentingNote.heightAnchor.constraint(equalToConstant: 0)
        cover.translatesAutoresizingMaskIntoConstraints = false
        cover.backgroundColor = Palette.surfaceRecess
        cover.isUserInteractionEnabled = false
        let line = coverLine
        cover.addSubview(line)
        failure.isHidden = true
        card.isHidden = true
        for part in [commentingNote, web!, cover, card, failure] as [UIView] { well.addSubview(part) }

        // The grabber, `space-1` from the top, centred, 100×6 in the control
        // edge; its hit area is 44pt tall about it (vaul's handle hit area),
        // over the header, which yields to the header's actions.
        grabArea.yields = [sendButton, pinsButton, commentButton, reload, closeButton]
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
            commentingNote.topAnchor.constraint(equalTo: well.topAnchor),
            commentingNote.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            commentingNote.trailingAnchor.constraint(equalTo: well.trailingAnchor),
            commentingNoteHeight,
            noteLabel.leadingAnchor.constraint(equalTo: commentingNote.leadingAnchor, constant: Space.space3),
            noteLabel.trailingAnchor.constraint(lessThanOrEqualTo: commentingNote.trailingAnchor, constant: -Space.space3),
            noteLabel.centerYAnchor.constraint(equalTo: commentingNote.topAnchor, constant: Space.space4),
            web.topAnchor.constraint(equalTo: commentingNote.bottomAnchor),
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
        placeCardConstraints()
        card.onClose = { [weak self] in self?.closeCard() }
        card.onReply = { [weak self] text in self?.reply(text) }
        card.onResolve = { [weak self] resolved in self?.resolve(resolved) }
        card.onPicture = { [weak self] in self?.pictureOfOpenPin() }
        card.onWriting = { [weak self] on in
            guard let self else { return }
            writing = on
            roomForCard()
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: PreviewController, _: UITraitCollection) in
            controller.paintWell()
            controller.deliver(["type": "cawco:theme", "theme": controller.theme])
        }
        NotificationCenter.default.addObserver(self, selector: #selector(cameForward), name: UIApplication.didBecomeActiveNotification, object: nil)
        paintWell()
        paintPins()
        watchWorking()
        show()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startPolling()
        sayShown()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        polling?.cancel()
        polling = nil
    }

    @objc private func cameForward() { sayShown() }

    /// Narrow (PreviewPane.svelte's container under 470px), Comment and Pins
    /// say themselves by glyph alone; Done keeps its word, the way out.
    private var narrow: Bool { view.bounds.width < 470 }
    private var laidNarrow: Bool?

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if laidNarrow != narrow {
            laidNarrow = narrow
            paintComment()
            paintPins()
        }
        placeCard()
        #if DEBUG
        probeLayout()
        #endif
    }

    /// As the phone's drawer it wears the grabber, and its header stands
    /// `space-3` under the drawer's top (SideSheet.svelte `.sheet`); beside
    /// the transcript it has neither. The open pin's card stands at the
    /// drawer's foot, in the house drawer's shape.
    func standsAsDrawer(_ drawer: Bool) {
        loadViewIfNeeded()
        self.drawer = drawer
        grabArea.isHidden = !drawer
        headTop.constant = drawer ? Space.space3 : 0
        placeCardConstraints()
    }

    /// The preview as the hub says it now: a new revision (another page, or
    /// the same rebuilt) loads afresh, named by its artifact until the page
    /// says its own title and path. The same revision keeps what the page said.
    func show() {
        guard isViewLoaded, let frame = hub.previews.byInstance[instanceId], frame.state == .open,
              let origin = hub.previewOrigin(frame) else { return }
        guard frame.revision != revision else { return }
        revision = frame.revision
        comment(false)
        if frame.artifact.id != artifactId {
            // Another artifact: its pins are its own.
            artifactId = frame.artifact.id
            comments = .empty
            thumbs = [:]
            closeCard()
            list?.dismiss(animated: true)
            paintPins()
            refresh()
        }
        titleLabel.text = frame.artifact.name
        pathLabel.text = Self.place(frame)
        self.origin = origin
        connected = false
        commentButton.isEnabled = false
        commentButton.isHidden = frame.artifact.kind == .canvas
        paintSend()
        cover.alpha = 1
        coverLine.isHidden = false
        let cookie = HTTPCookie(properties: [
            .name: "cawco-preview", .value: instanceId, .domain: origin.host() ?? "", .path: "/",
        ])
        let web = web!
        guard let cookie else { return }
        let start = hub.previewStart(frame) ?? origin
        web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
            web.load(URLRequest(url: start))
        }
    }

    private var theme: String { traitCollection.userInterfaceStyle == .dark ? "dark" : "light" }

    // MARK: The page

    /// A new document (a load, the page's own reload or a link to another
    /// page) starts its overlay out of Comment mode: Comment goes off with
    /// it, so the button and the page never disagree.
    func webView(_: WKWebView, didCommit _: WKNavigation!) {
        comment(false)
        #if DEBUG
        PreviewProbe.say("preview document")
        #endif
    }

    func webView(_: WKWebView, didFinish _: WKNavigation!) {
        let fade = Motion.easeOut.animator(Motion.durControl) { self.cover.alpha = 0 }
        // Faded out, its line stops sweeping; a load since brought the cover back.
        fade.addCompletion { [weak self] position in
            guard position == .end, let self, cover.alpha < 0.01 else { return }
            coverLine.isHidden = true
        }
        fade.startAnimation()
        // PreviewPane.svelte `announce`: the overlay answers with `cawco:ready`
        // and joins the artifact's doc on the listener's own origin, where
        // the page's cookie reaches it.
        guard let frame = hub.previews.byInstance[instanceId], frame.state == .open else { return }
        let artifact = frame.artifact
        connected = false
        deliver([
            "type": "cawco:hello",
            "artifact": ["id": artifact.id, "kind": artifact.kind.rawValue, "name": artifact.name],
            "sync": "/__cawco/artifact/\(artifact.id)",
            "theme": theme,
        ])
        #if DEBUG
        PreviewProbe.say("preview hello theme=\(theme)")
        #endif
        loaded(frame.revision)
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        failed(error.localizedDescription, of: nil)
        loaded(revision)
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        failed(error.localizedDescription, of: nil)
        loaded(revision)
    }

    /// What the page posted to its host: the overlay's messages (wire.ts
    /// reads them the same way). The page is code an agent wrote: every
    /// field is checked and bounded.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, let data = text.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        switch body["type"] as? String {
        case "cawco:ready", "cawco:navigated":
            if let at = (body["url"] as? String).flatMap(URL.init(string:)), at.host() == origin?.host(), at.port == origin?.port {
                pathLabel.text = at.path() + (at.query().map { "?\($0)" } ?? "")
            }
            if let title = Self.text(body["title"], 300), !title.isEmpty { titleLabel.text = title }
            if body["type"] as? String == "cawco:ready" { ready() }
        case "cawco:pin-open":
            guard let id = Self.pinId(body["id"]) else { return }
            if id == placing || (placing != nil && body["made"] as? Bool != true) {
                // Placed again: the mode goes back to how it was before.
                if placingLeaves { comment(false) } else { placing = nil }
            }
            openCard(id)
            refresh()
        case "cawco:pin-at":
            guard Self.pinId(body["id"]) == openPin else { return }
            pinAt = Self.pinAt(body)
            placeCard()
        case "cawco:picture":
            guard let id = Self.pinId(body["id"]) else { return }
            let png = (body["png"] as? String).flatMap(Self.png)
            if body["thumb"] as? Bool == true {
                thumbs[id] = png
                if id == openPin { paintCard() }
            } else if let png, let pin = comments.pins.first(where: { $0.id == id }) {
                PictureLightbox.show(png: png, caption: "Pin \(pin.label): \(pin.name)", over: self)
            }
        case "cawco:key":
            if let key = Self.text(body["key"], 10) { press(key) }
        case "cawco:escape":
            commenting = false
            placing = nil
            paintComment()
        case "cawco:error":
            // wire.ts `previewErrorOf`: a send or a field carry their own way back.
            let of = Self.text(body["of"], 20).flatMap { ["send", "field"].contains($0) ? $0 : nil }
            failed(Self.text(body["message"], 300) ?? "The preview reported an error.", of: of)
        case "cawco:resolved":
            // The page kept the field it refused: its word leaves the band.
            if failureOf == "field" { clearFailure() }
        case "cawco:reply-result":
            answered("reply", body)
        case "cawco:resolve-result":
            answered("resolve", body)
        #if DEBUG
        case "cawco:probe":
            probePage(body)
        #endif
        default:
            break
        }
    }

    /// The overlay answered the hello: the page is on screen and joined.
    private func ready() {
        connected = true
        commentButton.isEnabled = true
        paintSend()
        // The page's mode as the person left it, and the open card's pin tracked again.
        comment(commenting, place: placing)
        if let openPin { deliver(["type": "cawco:track-pin", "id": openPin]) }
        if let revision { word(revision, failure: nil) }
        #if DEBUG
        if PreviewProbe.commentAtLaunch, !commentedAtLaunch {
            commentedAtLaunch = true
            comment(true)
            if PreviewProbe.tapAtLaunch {
                web.evaluateJavaScript(PreviewProbe.click) { value, error in
                    PreviewProbe.say("preview probe click \((value as? String) ?? error?.localizedDescription ?? "?")")
                }
            }
        }
        #endif
    }

    // MARK: Comment mode

    /// Comment on or off, unmistakable while on: the button pressed and
    /// reading Done (the way out on the button itself), the well's accent
    /// edge, and the line on its top edge, 28pt. `place` is the moved pin
    /// the next tap places again.
    private func comment(_ on: Bool, place: String? = nil) {
        commenting = on
        placing = on ? place : nil
        paintComment()
        deliver(["type": "cawco:mode", "mode": on ? "comment" : "off", "place": placing.map { $0 as Any } ?? NSNull()])
        #if DEBUG
        PreviewProbe.say("preview comment \(on ? "on" : "off")")
        #endif
    }

    private func paintComment() {
        guard isViewLoaded else { return }
        commentButton.isSelected = commenting
        KitButton.setTitle(commenting ? "Done" : narrow ? "" : "Comment", of: commentButton, variant: .ghost, height: .sm)
        commentButton.accessibilityLabel = commenting ? "Done" : "Comment"
        commentingNoteHeight.constant = commenting ? Space.space4 * 2 : 0
        reloadButton.setNeedsUpdateConfiguration()
        paintWell()
    }

    private func reload() {
        clearFailure()
        revision = nil
        show()
    }

    private func failed(_ message: String, of: String?) {
        failureOf = of
        failure.label.text = message
        failure.isHidden = false
    }

    private func clearFailure() {
        failureOf = nil
        failure.isHidden = true
    }

    private func paintWell() {
        well.layer.borderColor = (commenting ? Palette.accent : Palette.borderHairline).resolvedColor(with: traitCollection).cgColor
        well.layer.borderWidth = commenting ? Size.focusRingWidth : 1
    }

    /// Hands the page a message from its host, as the dashboard's pane posts to its iframe.
    private func deliver(_ message: [String: Any]) {
        guard isViewLoaded, let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__cawcoDeliver && window.__cawcoDeliver(\(json))")
    }

    /// The pane's keys, heard while the page has the keyboard (PreviewPane.svelte
    /// `pressKey`): C toggles Comment, J and K step through the pins, Enter opens one, Esc closes.
    private func press(_ key: String) {
        switch key {
        case "c" where !commentButton.isHidden: comment(!commenting)
        case "j": step(1)
        case "k": step(-1)
        case "Enter": if let focusedPin { openCard(focusedPin) }
        case "Escape":
            if openPin != nil { closeCard() } else if commenting { comment(false) }
        default: break
        }
    }

    /// The next or the previous pin on the page, outlined and scrolled to.
    private func step(_ by: Int) {
        let stepping = comments.pins.filter { !$0.moved }
        guard !stepping.isEmpty else { return }
        let at = stepping.firstIndex { $0.id == focusedPin } ?? -1
        let next = stepping[((at + by) % stepping.count + stepping.count) % stepping.count]
        focusedPin = next.id
        deliver(["type": "cawco:focus-pin", "id": next.id, "scroll": true])
        if openPin != nil { openCard(next.id) }
    }

    // MARK: The pencil

    /// The pencil's double-tap, as the person set it in Settings: only
    /// switching to the eraser or to the tool before act; the page's canvas
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

    // MARK: The pins

    /// Reads the pins while the pane is on screen, every `pollEvery`.
    private func startPolling() {
        guard polling == nil else { return }
        polling = Task { [weak self] in
            while !Task.isCancelled {
                self?.refresh()
                try? await Task.sleep(for: Self.pollEvery)
            }
        }
    }

    /// The artifact's pins and unsent picks as the hub has them now; one
    /// read at a time, and one more after it when asked meanwhile.
    private func refresh() {
        guard let artifact = artifactId else { return }
        guard !reading else {
            readAgain = true
            return
        }
        reading = true
        Task { [weak self] in
            guard let self else { return }
            do {
                let read = try await hub.comments(on: artifact, in: instanceId)
                if artifact == artifactId { adopt(read) }
                if failureOf == "pins" { clearFailure() }
            } catch {
                if artifact == artifactId {
                    failed("Couldn't read the pins: \(error.localizedDescription)", of: "pins")
                }
            }
            reading = false
            if readAgain {
                readAgain = false
                refresh()
            }
        }
    }

    private func adopt(_ read: ArtifactComments) {
        guard read != comments else { return }
        comments = read
        live = read.live(working: sessionWorking)
        paintPins()
        list?.show(read.pins, live: live)
        if let openPin, !read.pins.contains(where: { $0.id == openPin }) { closeCard() }
        paintCard()
        #if DEBUG
        PreviewProbe.say("preview pins n=\(read.pins.count) open=\(read.open) owed=\(read.owed) " + read.pins.map {
            "\($0.label)=\($0.moved ? "moved" : $0.resolved ? "resolved" : "open"):\($0.thread.count)\($0.unsent ? ":unsent" : "")"
        }.joined(separator: " "))
        if PreviewProbe.sendAtLaunch, !sentAtLaunch, read.owed > 0, connected {
            sentAtLaunch = true
            send()
        }
        if PreviewProbe.replyAtLaunch, !repliedAtLaunch, let openPin, connected, !sending,
           read.pins.first(where: { $0.id == openPin })?.sentAt != nil {
            repliedAtLaunch = true
            Task { [weak self] in
                self?.reply("Make it bigger")
                while self?.replying == true { try? await Task.sleep(for: .milliseconds(100)) }
                self?.resolve(true)
            }
        }
        #endif
    }

    /// Whether the session's turn runs, read from its activity pulse (as the
    /// web's `activityOf` prefers it) and read again when the pulse changes.
    private func watchWorking() {
        var working = withObservationTracking {
            hub.fleet.activityPulse(instanceId)?.activity == .working
        } onChange: { [weak self] in
            Task { @MainActor in self?.watchWorking() }
        }
        #if DEBUG
        // `-preview-working`: the probe's mock session ends its turns at once.
        if PreviewProbe.workingAtLaunch { working = true }
        #endif
        guard working != sessionWorking else { return }
        sessionWorking = working
        let next = comments.live(working: working)
        guard next != live else { return }
        live = next
        list?.show(comments.pins, live: live)
        paintCard()
    }

    /// The head's Pins (shown once there is a pin), its badge the open pins, and Send N.
    private func paintPins() {
        guard isViewLoaded else { return }
        pinsButton.isHidden = comments.pins.isEmpty
        pinsBadge.text = "\(comments.open)"
        pinsBadge.isHidden = comments.open == 0
        KitButton.setTitle(narrow ? "" : "Pins", of: pinsButton, variant: .ghost, height: .sm)
        pinsButton.accessibilityLabel = "Pins, \(comments.open) open"
        let badge = comments.open == 0 ? 0 : pinsBadge.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width + Space.space1
        pinsButton.configuration?.contentInsets.trailing = Space.space3 + 1 + badge
        paintSend()
    }

    private func paintSend() {
        guard isViewLoaded else { return }
        let owed = comments.owed
        sendButton.configuration?.showsActivityIndicator = sending
        KitButton.setTitle(sending ? "Sending…" : "Send \(owed)", of: sendButton, variant: .ghost, height: .sm)
        sendButton.isEnabled = connected && owed > 0 && !sending
        sendButton.accessibilityHint = owed == 0 ? "Nothing new to send" : "Sends \(owed) to the session"
    }

    /// The list, as a house sheet from the head (PinList.svelte).
    private func openList() {
        let content = PinListController()
        content.placing = placing
        content.show(comments.pins, live: live)
        content.onOpen = { [weak self, weak content] id in
            content?.dismiss(animated: true)
            self?.openCard(id)
        }
        content.onPlace = { [weak self, weak content] id in
            content?.dismiss(animated: true)
            self?.placeAgain(id)
        }
        list = content
        let sheet = HouseSheetController(content, title: "Pins", scroller: content.scroller)
        present(sheet, animated: !UIAccessibility.isReduceMotionEnabled)
        if let focusedPin { content.reveal(focusedPin) }
    }

    /// Place again: Comment mode until the next tap pins the moved pin anew.
    private func placeAgain(_ id: String) {
        placingLeaves = !commenting
        closeCard()
        comment(true, place: id)
    }

    // MARK: The card

    private func openCard(_ id: String) {
        openPin = id
        focusedPin = id
        cardError = nil
        pinAt = nil
        deliver(["type": "cawco:track-pin", "id": id])
        deliver(["type": "cawco:focus-pin", "id": id, "scroll": true])
        if thumbs[id] == nil { deliver(["type": "cawco:picture", "id": id, "thumb": true]) }
        paintCard()
    }

    private func closeCard() {
        guard openPin != nil else { return }
        openPin = nil
        pinAt = nil
        cardError = nil
        card.isHidden = true
        card.endEditing(true)
        deliver(["type": "cawco:track-pin", "id": NSNull()])
    }

    /// The open card as its pin stands in the hub's last read.
    private func paintCard() {
        guard let openPin else { return }
        guard let pin = comments.pins.first(where: { $0.id == openPin }) else {
            // A pin just made: the hub's next read brings it.
            card.isHidden = true
            return
        }
        let arriving = card.isHidden
        card.isHidden = false
        card.show(pin, live: live.contains(openPin), thumbnail: thumbs[openPin], problem: cardError, replying: replying)
        placeCard()
        if arriving {
            // It arrives as a floating card does: rising `popRise` from 0.96 over `durPop`.
            if !UIAccessibility.isReduceMotionEnabled {
                view.layoutIfNeeded()
                card.alpha = 0
                card.transform = CGAffineTransform(translationX: 0, y: Motion.popRise).scaledBy(x: 0.96, y: 0.96)
                Motion.easeOut.animator(Motion.durPop) {
                    self.card.alpha = 1
                    self.card.transform = .identity
                }.startAnimation()
            }
            UIAccessibility.post(notification: .screenChanged, argument: card)
        }
        #if DEBUG
        view.layoutIfNeeded()
        PreviewProbe.say(card.probeLine())
        let frame = { (box: CGRect) in "\(Int(box.minX)),\(Int(box.minY)),\(Int(box.width)),\(Int(box.height))" }
        PreviewProbe.say("preview card-geometry card=\(frame(card.convert(card.bounds, to: nil))) well=\(frame(well.convert(well.bounds, to: nil))) keyboard=\(frame(view.keyboardLayoutGuide.layoutFrame)) view=\(frame(view.convert(view.bounds, to: nil))) \(card.probeScroll)")
        #endif
    }

    private func placeCardConstraints() {
        guard isViewLoaded else { return }
        if cardLeft == nil {
            cardLeft = card.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: Space.space2)
            cardTop = card.topAnchor.constraint(equalTo: well.topAnchor, constant: Space.space2)
            cardTop.priority = .required - 1
            cardWidth = card.widthAnchor.constraint(equalToConstant: Size.cPinCardW)
            let keyboard = card.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -Space.space2)
            let foot = card.bottomAnchor.constraint(equalTo: well.bottomAnchor)
            foot.priority = .required - 1
            cardPlace = [cardLeft, cardTop, cardWidth,
                         card.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, constant: -Space.space2 * 2)]
            cardDrawerPlace = [
                card.leadingAnchor.constraint(equalTo: well.leadingAnchor),
                card.trailingAnchor.constraint(equalTo: well.trailingAnchor),
                foot,
            ]
            cardShort = card.heightAnchor.constraint(lessThanOrEqualTo: well.heightAnchor, multiplier: 0.7)
            NSLayoutConstraint.activate([
                keyboard,
                card.topAnchor.constraint(greaterThanOrEqualTo: well.topAnchor),
            ])
        }
        NSLayoutConstraint.deactivate(drawer ? cardPlace : cardDrawerPlace)
        NSLayoutConstraint.activate(drawer ? cardDrawerPlace : cardPlace)
        card.drawer = drawer
        roomForCard()
    }

    /// On a phone the card stands at most 70% of the well tall (PinCard.svelte
    /// `.sheet`), the page showing above it; while the person writes, the
    /// keyboard has taken the room, and the card takes the whole well.
    private func roomForCard() {
        cardShort.isActive = drawer && !writing
    }

    /// Beside its pin, on the side with room, inside the well
    /// (PinCard.svelte `place`): `space-3` from the pin, 8pt from the well's
    /// edge; at the well's top-right while the pin is off screen. The phone's
    /// card stands at the well's foot.
    private func placeCard() {
        guard openPin != nil, !drawer, cardLeft != nil else { return }
        let room = well.bounds.size
        guard room.width > 0 else { return }
        let gap = Space.space3
        let edge = 8.0
        let width = min(Size.cPinCardW, room.width - edge * 2)
        let height = min(card.systemLayoutSizeFitting(CGSize(width: width, height: 0),
                                                      withHorizontalFittingPriority: .required,
                                                      verticalFittingPriority: .fittingSizeLevel).height,
                         room.height - edge * 2)
        var left = room.width - width - edge
        var top = edge
        if let at = pinAt {
            let x = web.frame.minX + at.x
            let y = web.frame.minY + at.y
            left = x + at.r + gap
            if left + width > room.width - edge { left = x - at.r - gap - width }
            left = max(edge, min(left, room.width - width - edge))
            top = max(edge, min(y - at.r, room.height - height - edge))
        }
        if cardWidth.constant != width { cardWidth.constant = width }
        if cardLeft.constant != left { cardLeft.constant = left }
        if cardTop.constant != top { cardTop.constant = top }
    }

    /// The person's words in the open pin's thread: the page's overlay writes
    /// them into the artifact's doc, as every person's reply is written
    /// (`cawco:reply`). A refusal stays under the field with the words still in it.
    private func reply(_ text: String) {
        guard let pin = openPin, !replying else { return }
        replying = true
        cardError = nil
        paintCard()
        Task { [weak self] in
            guard let self else { return }
            let refused = await ask("reply", pin: pin, ["type": "cawco:reply", "pin": pin, "text": text],
                                    silent: "The page didn't answer, so the reply wasn't kept. Try again.")
            if refused == nil, openPin == pin { card.replied() }
            cardError = refused
            replying = false
            paintCard()
            // The thread as the hub has it now, at once.
            if refused == nil { refresh() }
        }
    }

    /// Resolve or Reopen, written by the page's overlay (`cawco:resolve`).
    private func resolve(_ resolved: Bool) {
        guard let pin = openPin, !resolving else { return }
        resolving = true
        cardError = nil
        Task { [weak self] in
            guard let self else { return }
            let refused = await ask("resolve", pin: pin, ["type": "cawco:resolve", "pin": pin, "resolved": resolved],
                                    silent: "The page didn't answer, so the pin wasn't \(resolved ? "resolved" : "reopened"). Try again.")
            cardError = refused
            resolving = false
            paintCard()
            if refused == nil { refresh() }
        }
    }

    /// Hands the page `message` and waits for its overlay's answer
    /// (`cawco:<what>-result` for `pin`): nil when it was kept, else the
    /// page's own sentence; `silent` when no answer came within `answerWithin`.
    private func ask(_ what: String, pin: String, _ message: [String: Any], silent: String) async -> String? {
        guard connected else { return silent }
        let key = "\(what):\(pin)"
        // An ask still out for the same pin hears that a newer one took its place.
        answers.removeValue(forKey: key)?.resume(returning: silent)
        return await withCheckedContinuation { (answer: CheckedContinuation<String?, Never>) in
            answers[key] = answer
            deliver(message)
            Task { [self] in
                try? await Task.sleep(for: Self.answerWithin)
                guard let unanswered = answers.removeValue(forKey: key) else { return }
                #if DEBUG
                PreviewProbe.say("preview \(what)-result none")
                #endif
                unanswered.resume(returning: silent)
            }
        }
    }

    /// The overlay's answer to an ask (`cawco:reply-result`, `cawco:resolve-result`).
    private func answered(_ what: String, _ body: [String: Any]) {
        guard let pin = Self.pinId(body["pin"]), let answer = answers.removeValue(forKey: "\(what):\(pin)") else { return }
        let kept = body["ok"] as? Bool == true
        let refused = kept ? nil : Self.text(body["error"], 300) ?? "The page didn't keep it. Try again."
        #if DEBUG
        let number = comments.pins.first { $0.id == pin }?.label ?? 0
        PreviewProbe.say("preview \(what)-result pin=\(number) \(refused.map { "refused: \($0)" } ?? "ok")")
        #endif
        answer.resume(returning: refused)
    }

    /// The open pin's picture full size: the page draws it, and it opens in the lightbox.
    private func pictureOfOpenPin() {
        guard let openPin else { return }
        deliver(["type": "cawco:picture", "id": openPin, "thumb": false])
    }

    // MARK: Send N

    /// Send N (PreviewPane.svelte `send`): the page draws each unsent pin's
    /// picture and the page with its ink (`cawco:send-pictures`), and posts
    /// them to the listener's send beside the doc's socket, which carries
    /// every unsent pick, pin and reply to the session as one turn. It runs
    /// in the page, so the pictures never cross into the app. A refusal
    /// stands under the open card's field, else in the band, Send N still there.
    private func send() {
        guard !sending, connected, let artifact = artifactId else { return }
        sending = true
        paintSend()
        Task { [weak self] in
            guard let self else { return }
            do {
                // WebKit's own method, not the Swift overlay's `async` refinement of it:
                // that lives in libswiftWebKit, which iOS 18 does not ship, and
                // linking it stopped the app at launch there (OS_REASON_DYLD).
                let pictures = try await withCheckedThrowingContinuation { (done: CheckedContinuation<Int, any Error>) in
                    web.__callAsyncJavaScript(Self.sendScript, arguments: ["sync": "/__cawco/artifact/\(artifact)"], inFrame: nil, in: .page) { value, error in
                        if let error { done.resume(throwing: error) } else { done.resume(returning: (value as? NSNumber)?.intValue ?? 0) }
                    }
                }
                cardError = nil
                if failureOf == "send" { clearFailure() }
                #if DEBUG
                PreviewProbe.say("preview send ok pictures=\(pictures)")
                #else
                _ = pictures
                #endif
            } catch {
                let message = Self.sentence(error)
                if openPin != nil {
                    cardError = message
                } else {
                    failed(message, of: "send")
                }
                #if DEBUG
                PreviewProbe.say("preview send failed: \(message)")
                #endif
            }
            sending = false
            paintSend()
            paintCard()
            refresh()
        }
    }

    /// A script's thrown error in its own words (the page's `Error: …` without its prefix).
    private static func sentence(_ error: any Error) -> String {
        let said = (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription
        return said.hasPrefix("Error: ") ? String(said.dropFirst(7)) : said
    }

    /// The send, in the page: the overlay's pictures, then the listener's
    /// send (artifact-doc.ts `sendArtifact`); answers how many pictures went.
    private static let sendScript = """
    const drawn = await window.__cawcoSendPictures(20000);
    const body = { pictures: Array.isArray(drawn.pictures) ? drawn.pictures : [] };
    if (typeof drawn.url === "string") body.url = drawn.url;
    const response = await fetch(`${sync}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error((await response.text()).slice(0, 300) || "The hub didn't take the send. Send again.");
    }
    return body.pictures.length;
    """

    // MARK: Shown

    /// A load ended: the proxy's own page names the hop that did not answer
    /// (core `PREVIEW_DOWN_META`); otherwise the overlay has `silentAfter` to
    /// answer the hello before the page counts as not loaded.
    private func loaded(_ revision: String?) {
        guard let revision else { return }
        silence?.cancel()
        web.evaluateJavaScript("document.querySelector('meta[name=\"cawco-preview-down\"]')?.getAttribute('content') ?? null") { [weak self] value, _ in
            guard let self, let said = value as? String, let down = ShownFailure(rawValue: said), down != .page else { return }
            word(revision, failure: down)
        }
        silence = Task { [weak self] in
            try? await Task.sleep(for: Self.silentAfter)
            guard !Task.isCancelled, let self, self.revision == revision, !connected else { return }
            word(revision, failure: .page)
        }
    }

    /// What this view has to say of `revision`: the first word, or a ready that came after a silence it had not said yet.
    private func word(_ revision: String, failure: ShownFailure?) {
        let first = shownWord?.revision != revision
        let readyAfterAll = shownWord?.failure != nil && failure == nil
        guard first || readyAfterAll else { return }
        shownWord = (revision, failure)
        sayShown()
    }

    /// This view's word on the current revision, once, while the preview is
    /// on screen and the app in front (PreviewPane.svelte's `artifactShown`).
    private func sayShown() {
        guard let word = shownWord, word.revision == revision, shownFor != word.revision, let artifact = artifactId,
              isViewLoaded, view.window?.windowScene?.activationState == .foregroundActive else { return }
        shownFor = word.revision
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.artifactShown(artifact, in: instanceId, revision: word.revision, failure: word.failure)
                #if DEBUG
                PreviewProbe.say("preview shown \(word.failure.map { "failed \($0.rawValue)" } ?? "ok") revision=\(word.revision)")
                #endif
            } catch {
                // Unheard: the next appearance says it again.
                if shownFor == word.revision { shownFor = nil }
            }
        }
    }

    // MARK: Closing

    /// Close: the hub closes the preview, and the session's screen takes it
    /// away. `refused` hears when the hub keeps it open (the reason is said
    /// over the page), so a drawer swiped away can come back.
    func close(refused: @escaping () -> Void = {}) {
        guard !closing else { return }
        closing = true
        // A preview the hub keeps open comes back with the page taking taps.
        comment(false)
        closeCard()
        closeButton.isEnabled = false
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.closePreview(instanceId)
            } catch {
                failed(error.localizedDescription, of: nil)
                refused()
            }
            closing = false
            closeButton.isEnabled = true
        }
    }

    #if DEBUG
    // MARK: The simulator probe (scripts/probe-ios-preview-touch.ts)

    /// The header as the probe reads it: Comment's words and centre, the open
    /// pins and Pins' centre, Send's words and centre, Reload's, the
    /// grabber's, the commenting line's height, and the web view's frame.
    private func headLine() -> String {
        let centre = PreviewProbe.centre
        let words = commentButton.accessibilityLabel ?? "?"
        let sendWords = sendButton.configuration?.attributedTitle.map { String($0.characters) } ?? "?"
        let grab = grabArea.isHidden ? "none" : centre(grabber)
        let page = web.convert(web.bounds, to: nil)
        return "preview head comment=\(words)@\(centre(commentButton)) pins=\(comments.open)@\(centre(pinsButton)) send=\(sendWords)@\(centre(sendButton)) reload=\(centre(reloadButton)) grabber=\(grab) note=\(Int(commentingNote.bounds.height)) web=\(Int(page.minX.rounded())),\(Int(page.minY.rounded())),\(Int(page.width.rounded())),\(Int(page.height.rounded()))"
    }

    /// The header as last logged on a layout: logged again only when it moved.
    private var laidHead = ""

    /// A layout that moved the header (a drawer drag, a mode) says so at once,
    /// whatever the page's own posts do.
    private func probeLayout() {
        guard PreviewProbe.on, view.window != nil else { return }
        let line = headLine()
        guard line != laidHead else { return }
        laidHead = line
        PreviewProbe.say(line)
    }

    /// The probe's page posts `cawco:probe` with its state and the viewport
    /// rects of what the probe taps: logged with each rect's centre in the
    /// window's points, where a simulator touch lands, after the header's own
    /// line (Comment's words and its centre, Pins', Send's, Reload's, the
    /// grabber's, the commenting line's height, and the web view's frame in
    /// the window), so every post says where everything is now.
    private func probePage(_ body: [String: Any]) {
        guard PreviewProbe.on, let web else { return }
        PreviewProbe.say(headLine())
        if openPin != nil, !card.isHidden { PreviewProbe.say(card.probeLine()) }
        var parts = [Self.text(body["state"], 200) ?? ""]
        let rects = body["rects"] as? [String: Any] ?? [:]
        for name in rects.keys.sorted() {
            guard let rect = rects[name] as? [String: Any], let x = rect["x"] as? Double, let y = rect["y"] as? Double,
                  let width = rect["width"] as? Double, let height = rect["height"] as? Double else { continue }
            let at = web.convert(CGPoint(x: x + width / 2, y: y + height / 2), to: nil)
            parts.append("\(Self.text(name, 40) ?? "")=\(Int(at.x.rounded())),\(Int(at.y.rounded()))")
        }
        PreviewProbe.say("preview page \(parts.joined(separator: " "))")
    }
    #endif

    // MARK: What the page says (wire.ts)

    private static func text(_ value: Any?, _ max: Int) -> String? {
        (value as? String).map { String($0.prefix(max)) }
    }

    /// A pin's id (wire.ts `previewPinId`).
    private static func pinId(_ value: Any?) -> String? {
        guard let id = value as? String, id.wholeMatch(of: /[0-9a-f-]{36}/) != nil else { return nil }
        return id
    }

    /// Where a pin's disc stands in the page's viewport (wire.ts `previewPinAt`); nil when it is not on the page.
    private static func pinAt(_ body: [String: Any]) -> (x: Double, y: Double, r: Double)? {
        guard let x = body["x"] as? Double, let y = body["y"] as? Double, let r = body["r"] as? Double,
              x.isFinite, y.isFinite, r.isFinite else { return nil }
        return (x, y, r)
    }

    /// A picture the page drew (wire.ts `previewPng`).
    private static func png(_ value: String) -> Data? {
        guard !value.isEmpty, value.count <= 4_000_000 else { return nil }
        return Data(base64Encoded: value)
    }

    /// source.ts `previewPlace`: a page by its name, a folder by its leaf, a dev server by its port.
    private static func place(_ frame: PreviewFrame) -> String {
        if let page = frame.source?.value3?.page { return page }
        if let dir = frame.source?.value2?.dir { return (dir as NSString).lastPathComponent }
        if let port = frame.source?.value1?.port { return "localhost:\(Int(port))" }
        return ""
    }

    /// Stands in for the dashboard's window, the overlay's `window.parent`:
    /// what the page posts goes to the app, and what the app hands the page
    /// arrives at its message listeners from that same parent, on its own
    /// origin, as the overlay checks. A send's pictures stay in the page:
    /// `__cawcoSendPictures` asks the overlay for them and takes its answer
    /// here (PreviewPane.svelte `pagePictures`).
    private static let host = """
    (() => {
      const listeners = new Set();
      const asks = new Map();
      let nextAsk = 1;
      const host = {
        postMessage(data) {
          if (data && data.type === "cawco:send-pictures" && asks.has(data.ask)) {
            const answer = asks.get(data.ask);
            asks.delete(data.ask);
            answer(data);
            return;
          }
          window.webkit.messageHandlers.cawco.postMessage(JSON.stringify(data));
        },
      };
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
      window.__cawcoSendPictures = (ms) => new Promise((resolve, reject) => {
        const ask = nextAsk++;
        const timer = setTimeout(() => {
          asks.delete(ask);
          reject(new Error("The page didn't draw its pins' pictures, so nothing was sent. Send again."));
        }, ms);
        asks.set(ask, (data) => { clearTimeout(timer); resolve(data); });
        window.__cawcoDeliver({ type: "cawco:send-pictures", ask });
      });
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
