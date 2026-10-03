import CawCoCore
import CawCoDesign
import CawCoTranscript
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// One conversation's pane (SessionPane.svelte under PaneLeaf.svelte): the
/// transcript, running to the pane's foot. The pane draws no composer
/// (composer-dock.svelte.ts): it publishes what its composer would have been
/// given in `composerBinding` (its draft, its send and stop, its parked
/// permission and question cards) and its group draws one composer over the
/// active tab. The group says how far up the pane that composer stands
/// (`composerInset`), and the transcript keeps its last line clear of it.
final class SessionViewController: ObservedViewController, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    let sessionId: String
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let transcriptHost = UIViewController()
    let composerBinding: SessionComposerBinding
    private var cards: [String: PromptCardView] = [:]
    private var sent: String?
    private var opened = true
    private var shownOnce = false
    var onClose: () -> Void = {}
    var onReturnToFleet: () -> Void = {}
    /// Opens another session, or a run's board row (`BoardRun.prefix + runId`), as a board row opens.
    var onOpenSession: (String) -> Void = { _ in }

    /// How far up from the pane's foot the group's composer (and the cards
    /// standing on it) reaches; the transcript's last line clears it.
    var composerInset: CGFloat = 0 {
        didSet { if abs(composerInset - oldValue) > 0.5 { clearComposer() } }
    }

    init(hub: HubConnection, id: String) {
        self.hub = hub
        sessionId = id
        transcript = hub.sessions.open(id)
        composerBinding = SessionComposerBinding(sessionId: id)
        super.init(nibName: nil, bundle: nil)
        composerBinding.onSend = { [weak self] words, attachments in self?.send(words, attachments) }
        composerBinding.onStop = { [weak self] in self?.stopTurn() }
        composerBinding.attachMenu = attachMenu()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("SessionViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        addChild(transcriptHost)
        transcriptHost.view.backgroundColor = .clear
        transcriptHost.view.translatesAutoresizingMaskIntoConstraints = false
        transcriptView.translatesAutoresizingMaskIntoConstraints = false
        transcriptView.hub = hub
        transcriptView.onOpenSession = { [weak self] id in self?.onOpenSession(id) }
        transcriptView.onOpenRun = { [weak self] runId in self?.onOpenSession(BoardRun.prefix + runId) }
        transcriptView.onReturnToFleet = { [weak self] in self?.onReturnToFleet() }
        transcriptHost.view.addSubview(transcriptView)
        view.addSubview(transcriptHost.view)
        transcriptHost.didMove(toParent: self)
        NSLayoutConstraint.activate([
            transcriptHost.view.topAnchor.constraint(equalTo: view.topAnchor),
            transcriptHost.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            transcriptHost.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            transcriptHost.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            transcriptView.topAnchor.constraint(equalTo: transcriptHost.view.topAnchor),
            transcriptView.leadingAnchor.constraint(equalTo: transcriptHost.view.leadingAnchor),
            transcriptView.trailingAnchor.constraint(equalTo: transcriptHost.view.trailingAnchor),
            transcriptView.bottomAnchor.constraint(equalTo: transcriptHost.view.bottomAnchor),
        ])
        clearComposer()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        clearComposer()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        requestRefresh()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        shownOnce = true
    }

    /// Ends the subscription; PaneHost calls it when the tab closes.
    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        onClose()
    }

    var restorationValues: [String: Any] {
        var values: [String: Any] = ["draft": composerBinding.draft]
        if let position = try? JSONEncoder().encode(transcriptView.restorationPosition) { values["transcriptPosition"] = position }
        return values
    }

    func restoreValues(_ values: [AnyHashable: Any]) {
        if let draft = values["draft"] as? String { composerBinding.setDraft(draft) }
        if let data = values["transcriptPosition"] as? Data,
           let position = try? JSONDecoder().decode(TranscriptPosition.self, from: data) {
            transcriptView.restorePosition(position)
        }
    }

    /// The transcript's last line stands a step above the composer.
    private func clearComposer() {
        guard isViewLoaded else { return }
        let clearance = max(0, composerInset - view.safeAreaInsets.bottom) + Space.space3
        guard abs(transcriptHost.additionalSafeAreaInsets.bottom - clearance) > 0.5 else { return }
        let following = transcriptView.restorationPosition.following
        transcriptHost.additionalSafeAreaInsets.bottom = clearance
        transcriptHost.view.layoutIfNeeded()
        if following { transcriptView.latest() }
    }

    // MARK: Model

    override func refreshContent() {
        let row = hub.fleet.byId[sessionId]
        transcriptView.configure(transcript)

        let live = canControl
        composerBinding.writable = live
        let command = sent.flatMap { hub.ledger.commands[$0] }
        if command?.stage == .submitted {
            composerBinding.action = .sending
        } else {
            composerBinding.action = transcript.tail?.busy == true && live ? .stop : .send
        }
        composerBinding.sendError = command?.stage == .failed ? "Couldn't send that message.\(command?.reason.map { " \($0)" } ?? "")" : nil
        syncCards(machineId: row?.machineId)
        composerBinding.publish()
    }

    /// The parked asks as the composer's cards, in arrival order: a card that
    /// comes in while the session is on screen settles in, and one the hub
    /// has settled leaves.
    private func syncCards(machineId: String?) {
        let parked = hub.needs.parked[sessionId] ?? []
        let ids = Set(parked.map(\.requestId))
        for id in cards.keys where !ids.contains(id) { cards[id] = nil }
        var ordered: [UIView] = []
        for ask in parked {
            let card = cards[ask.requestId] ?? {
                let made = PromptCardView(ask, arriving: shownOnce && composerBinding.composer != nil)
                made.onAnswer = { [weak self] choice, picks in self?.answer(ask, choice, picks) }
                made.onHeight = { [weak self] in self?.composerBinding.composer?.onHeight() }
                cards[ask.requestId] = made
                return made
            }()
            card.update(sent: hub.needs.answerSent(for: ask), connected: hub.state == .connected && machineId != nil)
            ordered.append(card)
        }
        composerBinding.prompts = ordered
    }

    private func answer(_ ask: ParkedAsk, _ choice: PromptCardView.Choice, _ picks: [String: [String]]) {
        guard hub.state == .connected, let row = hub.fleet.byId[sessionId] else {
            cards[ask.requestId]?.refuse("Couldn't send that answer. The hub is unreachable.")
            return
        }
        let sent = switch choice {
        case .allow: hub.needs.answer(ask, machineId: row.machineId, .allow)
        case .deny: hub.needs.answer(ask, machineId: row.machineId, .deny)
        case .answer: hub.needs.answerQuestion(ask, machineId: row.machineId, answers: picks)
        }
        if !sent { cards[ask.requestId]?.refuse("Couldn't send that answer.") }
        requestRefresh()
    }

    // MARK: Steer and Stop

    func focusComposer() { composerBinding.focus() }
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
        let id = hub.sessions.steer(row, text: words, images: images, texts: texts)
        sent = id
        if hub.ledger.commands[id]?.undelivered != true { composerBinding.sent() }
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
                Task { @MainActor in self?.composerBinding.attach(.image(name: name, mediaType: image.type, data: image.data)) }
            }
        }
    }

    func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        for url in urls {
            guard let data = try? Data(contentsOf: url) else { continue }
            let type = UTType(filenameExtension: url.pathExtension)
            if type?.conforms(to: .image) == true, let image = Self.sendable(data) {
                composerBinding.attach(.image(name: url.lastPathComponent, mediaType: image.type, data: image.data))
            } else if let text = String(data: data, encoding: .utf8) {
                composerBinding.attach(.text(name: url.lastPathComponent, content: text))
            }
        }
    }

    /// An image as a turn carries it: PNG stays PNG, anything else as JPEG.
    nonisolated private static func sendable(_ data: Data) -> (type: String, data: Data)? {
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("image/png", data) }
        guard let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9) else { return nil }
        return ("image/jpeg", jpeg)
    }

    // MARK: Keys

    override var keyCommands: [UIKeyCommand]? {
        var keys = [UIKeyCommand(title: "Stop", action: #selector(stopKey), input: ".", modifierFlags: .command),
                    UIKeyCommand(title: "Steer", action: #selector(steerKey), input: "l", modifierFlags: .command)]
        // The first question card owns the digits, Return and Escape while the field is not being written in.
        if !composerBinding.isWriting, cards.values.contains(where: \.ask.isQuestion) {
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
        let owner = composerBinding.prompts.compactMap { $0 as? PromptCardView }.first { $0.ask.isQuestion }
        if let input = command.input { owner?.key(input) }
    }

    static func activity(_ id: String) -> NSUserActivity {
        let activity = NSUserActivity(activityType: "dev.cawco.session")
        activity.userInfo = ["sessionId": id]
        activity.targetContentIdentifier = id
        return activity
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
