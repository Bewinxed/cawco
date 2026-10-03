import CawCoCore
import CawCoDesign
import CawCoTranscript
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// One session (SessionPane.svelte under PaneTabs.svelte, a phone's page):
/// the app bar, the session's folder tab on its shelf, the transcript
/// running to the foot of the screen under a 96pt recess fade, and the
/// floating composer over it with the parked permission and question cards
/// standing on it. Stop and Steer are the composer's own: the action box is
/// Stop while a turn runs, and the field is Steer.
final class SessionViewController: ObservedViewController, UIDragInteractionDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    let sessionId: String
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let transcriptHost = UIViewController()
    private let tabs = SessionTabsView()
    private let fade = RecessFade()
    private let composer = ComposerView()
    private var back: UIBarButtonItem!
    private var windowAction: UIWindowScene.ActivationAction!
    private var composerLeading: NSLayoutConstraint!
    private var composerTrailing: NSLayoutConstraint!
    private var composerBottom: NSLayoutConstraint!
    private var cards: [String: PromptCardView] = [:]
    private var sent: String?
    private var opened = true
    private var shownOnce = false
    var onClose: () -> Void = {}
    var onReturnToFleet: () -> Void = {}
    /// Opens another session, or a run's board row (`BoardRun.prefix + runId`), as a board row opens.
    var onOpenSession: (String) -> Void = { _ in }

    init(hub: HubConnection, id: String) {
        self.hub = hub
        sessionId = id
        transcript = hub.sessions.open(id)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("SessionViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        dressBar()

        addChild(transcriptHost)
        transcriptHost.view.backgroundColor = .clear
        transcriptHost.view.translatesAutoresizingMaskIntoConstraints = false
        transcriptView.translatesAutoresizingMaskIntoConstraints = false
        transcriptView.hub = hub
        transcriptView.onOpenSession = { [weak self] id in self?.onOpenSession(id) }
        transcriptView.onOpenRun = { [weak self] runId in self?.onOpenSession(BoardRun.prefix + runId) }
        transcriptHost.view.addSubview(transcriptView)
        view.addSubview(transcriptHost.view)
        transcriptHost.didMove(toParent: self)
        view.addSubview(tabs)
        view.addSubview(fade)
        view.addSubview(composer)

        tabs.onDetails = { [weak self] in self?.openDetails() }
        tabs.onClose = { [weak self] in self?.onReturnToFleet() }
        tabs.addInteraction(UIDragInteraction(delegate: self))

        composer.onSend = { [weak self] words, attachments in self?.send(words, attachments) }
        composer.onStop = { [weak self] in self?.stopTurn() }
        composer.onHeight = { [weak self] in self?.view.setNeedsLayout() }
        composer.attachMenu = attachMenu()

        let safe = view.safeAreaLayoutGuide
        // The composer 11pt from each edge, 7pt over the keyboard or the home indicator.
        composerLeading = composer.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space3)
        composerTrailing = composer.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space3)
        composerBottom = composer.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -Space.space2)
        NSLayoutConstraint.activate([
            tabs.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabs.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabs.topAnchor.constraint(equalTo: safe.topAnchor),
            transcriptHost.view.topAnchor.constraint(equalTo: tabs.bottomAnchor),
            transcriptHost.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            transcriptHost.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            transcriptHost.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            transcriptView.topAnchor.constraint(equalTo: transcriptHost.view.topAnchor),
            transcriptView.leadingAnchor.constraint(equalTo: transcriptHost.view.leadingAnchor),
            transcriptView.trailingAnchor.constraint(equalTo: transcriptHost.view.trailingAnchor),
            transcriptView.bottomAnchor.constraint(equalTo: transcriptHost.view.bottomAnchor),
            // The fade stands on the pane's foot: the keyboard's top while it is up.
            fade.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            fade.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            fade.bottomAnchor.constraint(equalTo: fadeGuide.topAnchor),
            fade.heightAnchor.constraint(equalToConstant: RecessFade.height),
            composer.topAnchor.constraint(greaterThanOrEqualTo: tabs.bottomAnchor, constant: Space.space3),
            composerLeading, composerTrailing, composerBottom,
        ])
    }

    /// The pane's foot: the screen's, or the keyboard's top while it is up.
    private lazy var fadeGuide: UILayoutGuide = {
        let guide = UILayoutGuide()
        view.addLayoutGuide(guide)
        let follow = guide.topAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        follow.priority = .defaultHigh
        NSLayoutConstraint.activate([
            follow,
            guide.topAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor),
            guide.heightAnchor.constraint(equalToConstant: 0),
            guide.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            guide.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        return guide
    }()

    /// The system bar, dressed as the web's app bar: the raised surface on a
    /// seam, its items drawn without the shared glass capsule.
    private func dressBar() {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = Palette.surfaceRaised
        appearance.shadowColor = Palette.seam
        navigationItem.standardAppearance = appearance
        navigationItem.scrollEdgeAppearance = appearance
        navigationItem.compactAppearance = appearance
        navigationItem.largeTitleDisplayMode = .never
        navigationItem.title = nil
        back = UIBarButtonItem(title: "Fleet", image: Glyph.chevronLeft.image.resized(to: Size.iconLg), primaryAction: UIAction { [weak self] _ in self?.onReturnToFleet() })
        back.tintColor = Palette.inkStrong
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            back.hidesSharedBackground = true
        }
        let activity = Self.activity(sessionId)
        windowAction = UIWindowScene.ActivationAction { _ in UIWindowScene.ActivationConfiguration(userActivity: activity) }
        windowAction.title = "Open in new window"
        windowAction.image = Glyph.window.image
        // A session in its own window, where windows can open (iPad, the
        // Duo's inner display, the Mac); a phone shows no overflow at all.
        NavigationItems.configure(navigationItem, leading: [back],
            overflow: UIApplication.shared.supportsMultipleScenes ? [windowAction] : [])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        requestRefresh()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        shownOnce = true
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isMovingFromParent || navigationController?.isBeingDismissed == true { close() }
    }

    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        onClose()
    }

    var restorationValues: [String: Any] {
        var values: [String: Any] = ["draft": composer.text]
        if let position = try? JSONEncoder().encode(transcriptView.restorationPosition) { values["transcriptPosition"] = position }
        return values
    }

    func restoreValues(_ values: [AnyHashable: Any]) {
        if let draft = values["draft"] as? String { composer.text = draft }
        if let data = values["transcriptPosition"] as? Data,
           let position = try? JSONDecoder().decode(TranscriptPosition.self, from: data) {
            transcriptView.restorePosition(position)
        }
    }

    // MARK: Model

    override func refreshContent() {
        let row = hub.fleet.byId[sessionId]
        tabs.configure(title: currentTitle, status: face(row))
        transcriptView.configure(transcript)

        let live = canControl
        composer.writable = live
        let command = sent.flatMap { hub.ledger.commands[$0] }
        if command?.stage == .submitted {
            composer.action = .sending
        } else {
            composer.action = transcript.tail?.busy == true && live ? .stop : .send
        }
        composer.sendError = command?.stage == .failed ? "Couldn't send that message.\(command?.reason.map { " \($0)" } ?? "")" : nil
        syncCards(machineId: row?.machineId)
    }

    /// SessionStatus.svelte's word for this session.
    private func face(_ row: InstanceRow?) -> SessionStatusView.Face {
        guard let row else { return .stored }
        if row.isFailed { return .failed }
        if row.isStale || hub.state != .connected { return .unreachable }
        if row.status == .sleeping { return .sleeping }
        if row.status == .stopped { return .stopped }
        if hub.needs.blocked(sessionId) { return .needsYou }
        if transcript.tail?.busy == true { return .working }
        return .idle
    }

    /// The parked asks as cards above the composer, in arrival order: a card
    /// that comes in while the session is on screen settles in, and one the
    /// hub has settled leaves.
    private func syncCards(machineId: String?) {
        let parked = hub.needs.parked[sessionId] ?? []
        let ids = parked.map(\.requestId)
        for (id, card) in cards where !ids.contains(id) {
            cards[id] = nil
            leave(card)
        }
        for (index, ask) in parked.enumerated() {
            let card = cards[ask.requestId] ?? {
                let made = PromptCardView(ask, arriving: shownOnce && view.window != nil)
                made.onAnswer = { [weak self] choice, picks in self?.answer(ask, choice, picks) }
                made.onHeight = { [weak self] in self?.view.setNeedsLayout() }
                cards[ask.requestId] = made
                composer.prompts.insertArrangedSubview(made, at: min(index, composer.prompts.arrangedSubviews.count))
                return made
            }()
            card.update(sent: hub.needs.answerSent(for: ask), connected: hub.state == .connected && machineId != nil)
        }
        composer.prompts.isHidden = composer.prompts.arrangedSubviews.isEmpty
    }

    private func leave(_ card: PromptCardView) {
        guard view.window != nil, !UIAccessibility.isReduceMotionEnabled else {
            card.removeFromSuperview()
            composer.prompts.isHidden = composer.prompts.arrangedSubviews.isEmpty
            return
        }
        let out = Motion.easeOut.animator(Motion.durExit) {
            card.alpha = 0
            card.isHidden = true
            self.view.layoutIfNeeded()
        }
        out.addCompletion { _ in
            card.removeFromSuperview()
            self.composer.prompts.isHidden = self.composer.prompts.arrangedSubviews.isEmpty
        }
        out.startAnimation()
    }

    private func answer(_ ask: ParkedAsk, _ choice: PromptCardView.Choice, _ picks: [String: [String]]) {
        guard hub.state == .connected, let row = hub.fleet.byId[sessionId] else { return }
        switch choice {
        case .allow: hub.needs.answer(ask, machineId: row.machineId, .allow)
        case .deny: hub.needs.answer(ask, machineId: row.machineId, .deny)
        case .answer: hub.needs.answerQuestion(ask, machineId: row.machineId, answers: picks)
        }
        requestRefresh()
    }

    // MARK: Layout

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard composerLeading != nil else { return }
        avoidFold()
        // The transcript runs under the composer and keeps its last line
        // clear of the pill (and of the cards standing on it).
        let clearance = max(0, view.bounds.maxY - composer.frame.minY - view.safeAreaInsets.bottom) + Space.space3
        if abs(transcriptHost.additionalSafeAreaInsets.bottom - clearance) > 0.5 {
            let following = transcriptView.restorationPosition.following
            transcriptHost.additionalSafeAreaInsets.bottom = clearance
            transcriptHost.view.layoutIfNeeded()
            if following { transcriptView.latest() }
        }
    }

    /// Duo: the composer stands clear of the fold, displaced, never hidden.
    private func avoidFold() {
        var leading = Space.space3
        var trailing = -Space.space3
        var bottom = -Space.space2
        if #available(iOS 27.1, macCatalyst 27.1, *) {
            let safe = view.bounds.inset(by: view.safeAreaInsets)
            let normal = CGRect(x: safe.minX + Space.space3,
                y: view.keyboardLayoutGuide.layoutFrame.minY - Space.space2 - composer.bounds.height,
                width: max(0, safe.width - Space.space3 * 2), height: composer.bounds.height)
            // Test the undisplaced pose, not the previous layout's displaced
            // frame; otherwise avoidance would toggle on and off every pass.
            for region in view.reservedRegions(kind: .division) where region.isActive && normal.intersects(region.frame) {
                let fold = region.frame // Includes the system's interactive-content margins.
                if fold.height > fold.width {
                    let before = fold.minX - safe.minX
                    let after = safe.maxX - fold.maxX
                    if after >= before { leading = max(leading, fold.maxX - safe.minX + Space.space3) }
                    else { trailing = min(trailing, fold.minX - safe.maxX - Space.space3) }
                } else {
                    bottom = min(bottom, fold.minY - view.keyboardLayoutGuide.layoutFrame.minY - Space.space3)
                }
            }
        }
        if composerLeading.constant != leading || composerTrailing.constant != trailing || composerBottom.constant != bottom {
            composerLeading.constant = leading; composerTrailing.constant = trailing; composerBottom.constant = bottom
        }
    }

    // MARK: Steer and Stop

    func focusComposer() { composer.focus() }
    var canControl: Bool { hub.fleet.byId[sessionId]?.isLive == true && hub.state == .connected }

    /// The first permission parked here, for the menu bar's Approve and Deny.
    private var pendingAsk: ParkedAsk? { hub.needs.parked[sessionId]?.first { !$0.isQuestion } }
    var answerTarget: (ask: ParkedAsk, machineId: String)? {
        guard hub.state == .connected, let ask = pendingAsk, let row = hub.fleet.byId[sessionId] else { return nil }
        let sent = hub.needs.answerSent(for: ask)
        return sent == nil || sent?.stage == .failed ? (ask, row.machineId) : nil
    }

    func stopTurn() {
        guard let row = hub.fleet.byId[sessionId], row.isLive, hub.state == .connected else { return }
        sent = hub.sessions.stop(row)
        requestRefresh()
    }

    private func send(_ words: String, _ attachments: [ComposerAttachment]) {
        guard let row = hub.fleet.byId[sessionId], row.isLive, hub.state == .connected else { return }
        var images: [(mediaType: String, data: Data)] = []
        var texts: [(name: String, content: String)] = []
        for attachment in attachments {
            switch attachment {
            case let .image(_, mediaType, data): images.append((mediaType, data))
            case let .text(name, content): texts.append((name, content))
            }
        }
        sent = hub.sessions.steer(row, text: words, images: images, texts: texts)
        if hub.ledger.commands[sent!]?.undelivered != true { composer.sent() }
        requestRefresh()
    }

    // MARK: Attach

    /// The sources a file input offers on iOS: the photo library and files.
    private func attachMenu() -> UIMenu {
        UIMenu(children: [
            UIAction(title: "Photo Library", image: Glyph.window.image) { [weak self] _ in self?.pickPhotos() },
            UIAction(title: "Choose File", image: Glyph.document.image) { [weak self] _ in self?.pickFiles() },
        ])
    }

    private func pickPhotos() {
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 0
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func pickFiles() {
        var types: [UTType] = [.image, .plainText, .text, .json, .commaSeparatedText, .log]
        if let markdown = UTType(filenameExtension: "md") { types.append(markdown) }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = self
        present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        for result in results {
            let provider = result.itemProvider
            let name = provider.suggestedName ?? "Image"
            provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, _ in
                guard let data, let image = Self.sendable(data) else { return }
                Task { @MainActor in self?.composer.attach(.image(name: name, mediaType: image.type, data: image.data)) }
            }
        }
    }

    func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        for url in urls {
            guard let data = try? Data(contentsOf: url) else { continue }
            let type = UTType(filenameExtension: url.pathExtension)
            if type?.conforms(to: .image) == true, let image = Self.sendable(data) {
                composer.attach(.image(name: url.lastPathComponent, mediaType: image.type, data: image.data))
            } else if let text = String(data: data, encoding: .utf8) {
                composer.attach(.text(name: url.lastPathComponent, content: text))
            }
        }
    }

    /// An image as a turn carries it: PNG stays PNG, anything else as JPEG.
    nonisolated private static func sendable(_ data: Data) -> (type: String, data: Data)? {
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("image/png", data) }
        guard let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9) else { return nil }
        return ("image/jpeg", jpeg)
    }

    // MARK: Details

    /// Session details, in the house sheet on its edge (PaneTabs.svelte).
    private func openDetails() {
        let row = hub.fleet.byId[sessionId]
        let location = transcript.location
        let details = SessionIdentityController(
            title: currentTitle,
            face: face(row),
            host: (row?.machineId ?? location?.machineId).map(hub.fleet.machineName) ?? "",
            cwd: row?.cwd ?? location?.cwd ?? ""
        )
        present(HouseSheetController(details, style: .edge), animated: true)
    }

    private var currentTitle: String {
        let row = hub.fleet.byId[sessionId]
        let location = transcript.location
        let stored = location.flatMap { hub.fleet.storedTitle(sessionKey: $0.sessionKey, machineId: $0.machineId) }
        return row.map(hub.fleet.title) ?? stored
            ?? Naming.sessionTitle(title: nil, firstMessage: transcript.blocks.first?.content, cwd: location?.cwd, id: sessionId)
    }

    // MARK: Keys

    override var keyCommands: [UIKeyCommand]? {
        var keys = [UIKeyCommand(title: "Stop", action: #selector(stopKey), input: ".", modifierFlags: .command),
                    UIKeyCommand(title: "Steer", action: #selector(steerKey), input: "l", modifierFlags: .command)]
        // The first question card owns the digits, Return and Escape while the field is not being written in.
        if !composer.isWriting, cards.values.contains(where: \.ask.isQuestion) {
            for digit in 1 ... 9 {
                keys.append(UIKeyCommand(input: "\(digit)", modifierFlags: [], action: #selector(cardKey(_:))))
            }
            keys.append(UIKeyCommand(input: "\r", modifierFlags: [], action: #selector(cardKey(_:))))
            keys.append(UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(cardKey(_:))))
        }
        return keys
    }

    @objc private func stopKey() { stopTurn() }
    @objc private func steerKey() { focusComposer() }
    @objc private func cardKey(_ command: UIKeyCommand) {
        let owner = composer.prompts.arrangedSubviews.compactMap { $0 as? PromptCardView }.first { $0.ask.isQuestion }
        if let input = command.input { owner?.key(input) }
    }

    static func activity(_ id: String) -> NSUserActivity {
        let activity = NSUserActivity(activityType: "dev.cawco.session")
        activity.userInfo = ["sessionId": id]
        activity.targetContentIdentifier = id
        return activity
    }

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        [UIDragItem(itemProvider: NSItemProvider(object: Self.activity(sessionId)))]
    }
}

/// The 96pt fade behind the composer (Composer.svelte `.fade`): the recess
/// at 22% up into clear, so the transcript sinks under the pill.
final class RecessFade: UIView {
    static let height = 96.0
    override class var layerClass: AnyClass { CAGradientLayer.self }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (fade: RecessFade, _: UITraitCollection) in fade.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("RecessFade is built in code") }

    private func paint() {
        guard let gradient = layer as? CAGradientLayer else { return }
        let recess = Palette.surfaceRecess.resolvedColor(with: traitCollection)
        gradient.colors = [recess.withAlphaComponent(0).cgColor, recess.cgColor, recess.cgColor]
        gradient.locations = [0, 0.78, 1]
    }
}

/// Session details' identity (SessionDetails.svelte `.identity`, `.meta`):
/// the title in the title role, then the status, host and working directory.
final class SessionIdentityController: UIViewController {
    private let titleText: String
    private let face: SessionStatusView.Face
    private let host: String
    private let cwd: String

    init(title: String, face: SessionStatusView.Face, host: String, cwd: String) {
        titleText = title
        self.face = face
        self.host = host
        self.cwd = cwd
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("SessionIdentityController is built in code") }

    /// The home folder as `~`, and a deep path as its first part and its leaf.
    static func shortPath(_ path: String) -> String {
        let parts = path.replacing(/^\/(home|Users)\/[^\/]+/, with: "~").split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count > 3, let first = parts.first, let last = parts.last else { return parts.joined(separator: "/") }
        return "\(first)/…/\(last)"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 3)
        title.role = TypeScale.typeTitle.with(weight: .medium, leading: TypeScale.leadingBody)
        title.text = titleText
        title.accessibilityTraits = .header
        let meta = UIStackView()
        meta.spacing = Space.space2
        meta.alignment = .center
        meta.addArrangedSubview(SessionStatusView(face))
        for (index, part) in [host, cwd].enumerated() where !part.isEmpty {
            let dot = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            dot.text = "·"
            dot.isAccessibilityElement = false
            meta.addArrangedSubview(dot)
            if index == 1 {
                let path = UIButton(type: .custom)
                var config = UIButton.Configuration.plain()
                config.contentInsets = .zero
                let role = TypeScale.typeLabel.with(weight: .regular, leading: TypeScale.leadingBody, family: FontFamily.fontMono)
                config.attributedTitle = AttributedString(Self.shortPath(part), attributes: AttributeContainer(role.attributes(color: Palette.inkMuted)))
                path.configuration = config
                path.accessibilityLabel = "Copy working directory \(part)"
                path.addAction(UIAction { _ in UIPasteboard.general.string = part }, for: .primaryActionTriggered)
                path.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
                meta.addArrangedSubview(path)
            } else {
                let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
                label.text = part
                meta.addArrangedSubview(label)
            }
        }
        meta.addArrangedSubview(UIView())
        let column = UIStackView(arrangedSubviews: [title, meta])
        column.axis = .vertical
        column.spacing = Space.space1
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space5),
            column.topAnchor.constraint(equalTo: view.topAnchor, constant: Space.space4),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -Space.space3),
        ])
    }
}
