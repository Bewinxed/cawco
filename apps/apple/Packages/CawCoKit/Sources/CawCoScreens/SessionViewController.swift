import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
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
    private static let restoring = Logger(subsystem: "dev.cawco.app", category: "Restore")
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let transcriptHost = UIViewController()
    let composerBinding: SessionComposerBinding
    private var cards: [String: PromptCardView] = [:]
    private var sent: String?
    /// The `send.withdraw` taking a queued message back to send its edit in its place.
    private var withdrawing: String?
    /// Why the last edit of a queued message did not go in, in the composer's error line.
    private var editNote: String?
    private var opened = true
    private var shownOnce = false
    var onClose: () -> Void = {}
    var onReturnToFleet: () -> Void = {}
    /// Opens another session, or a run's board row (`BoardRun.prefix + runId`), as a board row opens.
    var onOpenSession: (String) -> Void = { _ in }

    /// How far up from the pane's foot the group's composer (and the cards
    /// standing on it) reaches; the transcript's last line clears it.
    var composerInset: CGFloat = 0 {
        didSet {
            guard abs(composerInset - oldValue) > 0.5 else { return }
            clearComposer()
            placeDrawer()
        }
    }

    init(hub: HubConnection, id: String) {
        self.hub = hub
        sessionId = id
        transcript = hub.sessions.open(id)
        composerBinding = SessionComposerBinding(sessionId: id)
        super.init(nibName: nil, bundle: nil)
        composerBinding.onSend = { [weak self] words, attachments in self?.send(words, attachments) }
        composerBinding.onStop = { [weak self] in self?.stopTurn() }
        composerBinding.onPasteItems = { [weak self] items in self?.attachPasted(items) }
        composerBinding.onRetryFile = { [weak self] id in self?.upload(id) }
        composerBinding.attachMenu = attachMenu()
        composerBinding.recall = { [weak self] in self.map { SentMessages.recall($0.transcript) } ?? [] }
        composerBinding.editableQueued = { [weak self] in self?.editableQueued() }
        composerBinding.foldQueued = { [weak self] id, folded, replacement in
            self?.transcriptView.foldQueued(id, folded: folded, replacement: replacement)
        }
        composerBinding.queuedWords = { [weak self] id in self?.transcriptView.queuedWords(id) }
        composerBinding.flashQueued = { [weak self] id in self?.transcriptView.flashQueued(id) }
        composerBinding.onReplaceQueued = { [weak self] id, text in self?.replaceQueued(id, with: text) }
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
        transcriptView.canEditQueued = { [weak self] id in self?.canWithdraw(id) ?? false }
        transcriptView.onEditQueued = { [weak self] id in self?.liftQueued(id) }
        transcriptView.onOpenPreview = { [weak self] input in self?.openPreview(input) }
        transcriptHost.view.addSubview(transcriptView)
        view.addSubview(transcriptHost.view)
        transcriptHost.didMove(toParent: self)
        transcriptTrailing = transcriptHost.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        NSLayoutConstraint.activate([
            transcriptHost.view.topAnchor.constraint(equalTo: view.topAnchor),
            transcriptHost.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            transcriptTrailing,
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
        // An open preview whose sheet could not be shown off screen is shown now.
        syncPreview()
    }

    /// Ends the subscription; PaneHost calls it when the tab closes.
    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        onClose()
    }

    var restorationValues: [String: Any] {
        var values: [String: Any] = ["draft": composerBinding.draft]
        let position = transcriptView.restorationPosition
        Self.restoring.notice("place saved for \(self.sessionId.prefix(8), privacy: .public): following \(position.following), anchor \(position.anchor ?? "none", privacy: .public) +\(position.offset, format: .fixed(precision: 1))")
        if let data = try? JSONEncoder().encode(position) { values["transcriptPosition"] = data }
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

        composerBinding.writable = canSend
        let command = sent.flatMap { hub.ledger.commands[$0] }
        let withdrawal = withdrawing.flatMap { hub.ledger.commands[$0] }
        if command?.stage == .submitted || withdrawal?.stage == .submitted || withdrawal?.stage == .accepted {
            composerBinding.action = .sending
        } else {
            composerBinding.action = transcript.tail?.busy == true && canStop ? .stop : .send
        }
        composerBinding.sendError = editNote ?? (command?.stage == .failed ? "Couldn't send that message.\(command?.reason.map { " \($0)" } ?? "")" : nil)
        composerBinding.sendBlock = sendBlock()
        syncCards(machineId: row?.machineId)
        composerBinding.publish()
        syncPreview()
    }

    // MARK: The preview (SessionPane's preview split, PreviewSheet)

    private var preview: PreviewController?
    private var transcriptTrailing: NSLayoutConstraint!
    /// The preview's key the transcript's cards were last drawn against.
    private var drawnPreview: String?

    /// A `show_preview` card was tapped: the hub opens its page (again), and
    /// the frame it answers with puts the preview on screen.
    private func openPreview(_ input: [String: Any]) {
        if let shown = hub.previews.byInstance[sessionId], shown.state == .open,
           PreviewKey.of(shown) == PreviewKey.of(ask: input), let preview {
            reveal(preview)
            return
        }
        Task { [weak self] in
            guard let self else { return }
            do { try await hub.openPreview(sessionId, ask: input) } catch { Toast.error(error.localizedDescription, in: view) }
        }
    }

    /// The preview as the hub says it: open, beside the transcript on a
    /// regular width (the web's split) or in a drawer above the composer on a
    /// compact one (its phone sheet); closed, gone.
    private func syncPreview() {
        let frame = hub.previews.byInstance[sessionId]
        let key = frame?.state == .open ? frame.flatMap(PreviewKey.of) : nil
        if key != drawnPreview {
            drawnPreview = key
            // The transcript's cards stand at full presence for the page now shown.
            transcriptView.previewChanged()
        }
        guard frame?.state == .open else {
            removePreview()
            return
        }
        let controller = preview ?? makePreview()
        let side = traitCollection.horizontalSizeClass == .regular
        if controller.parent === self, drawer != !side {
            unembed(controller)
        }
        if controller.parent !== self {
            embed(controller, drawer: !side)
        }
        controller.show()
    }

    /// The preview stands as the phone's drawer (over the transcript, above
    /// the composer) rather than beside the transcript.
    private var drawer = false
    /// The drawer is at the full height above the composer, not its middle.
    private var drawerFull = false
    private var drawerHeight: NSLayoutConstraint?
    private var drawerFloor: NSLayoutConstraint?

    /// The room above the composer the drawer may take.
    private var drawerRoom: CGFloat {
        max(0, view.bounds.height - view.safeAreaInsets.top - composerInset - Space.space2)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        placeDrawer()
        // The group's composer stands over this share of the pane: all of it,
        // unless the preview stands beside the transcript.
        var share: CGFloat = 1
        if !drawer, let preview, preview.parent === self, view.bounds.width > 0 {
            share = min(1, max(0, (preview.view.frame.minX - Space.space2) / view.bounds.width))
        }
        if abs(share - transcriptShare) > 0.001 {
            transcriptShare = share
            onTranscriptShare()
        }
    }

    /// How much of the pane's width, from its leading edge, the transcript
    /// holds (SessionPane.svelte's `transcriptShare`).
    private(set) var transcriptShare: CGFloat = 1
    var onTranscriptShare: () -> Void = {}

    /// The drawer follows the composer (it grows with a draft, rises with
    /// the keyboard) and the pane's height, at its middle or full height.
    private func placeDrawer() {
        guard drawer, let drawerHeight, let drawerFloor, !dragging else { return }
        let height = drawerRoom * (drawerFull ? 1 : 0.6)
        guard abs(drawerFloor.constant + composerInset) > 0.5 || abs(drawerHeight.constant - height) > 0.5 else { return }
        drawerFloor.constant = -composerInset
        drawerHeight.constant = height
        view.layoutIfNeeded()
    }

    private var dragging = false
    private var dragFrom: CGFloat = 0

    /// The drawer's header follows the finger; let go, it snaps to the middle
    /// or the full height, and below the middle by a quarter (or a flick
    /// down) the preview closes, as Close does.
    @objc private func dragDrawer(_ pan: UIPanGestureRecognizer) {
        guard let drawerHeight else { return }
        let room = drawerRoom
        let followed = min(room, max(0, dragFrom - pan.translation(in: view).y))
        switch pan.state {
        case .began:
            dragging = true
            dragFrom = drawerHeight.constant
        case .changed:
            drawerHeight.constant = followed
        case .ended, .cancelled:
            dragging = false
            let velocity = pan.velocity(in: view).y
            // Where the finger let go, not the last height drawn: a quick
            // drag may end before a single change was delivered.
            let height = followed
            let middle = room * 0.6
            if velocity > 900 || height < middle * 0.75 {
                preview?.close()
                return
            }
            drawerFull = velocity < -500 || height > (middle + room) / 2
            drawerHeight.constant = room * (drawerFull ? 1 : 0.6)
            Motion.easeOut.animator(Motion.durPanel) { self.view.layoutIfNeeded() }.startAnimation()
        default:
            break
        }
    }

    private func makePreview() -> PreviewController {
        let controller = PreviewController(hub: hub, instanceId: sessionId)
        controller.onSelect = { [weak self] attachments in
            guard let self else { return }
            for attachment in attachments { composerBinding.attach(attachment) }
        }
        preview = controller
        return controller
    }

    /// The web's wide layout: the preview beside the transcript, its share of
    /// the pane's width, never under its 320pt floor. On a compact width the
    /// phone's drawer (PreviewSheet): over the transcript, its floor the top
    /// of the composer, so a picked element goes to a composer still there
    /// to write and send in; 60% of the room above the composer, or all of it.
    private func embed(_ controller: PreviewController, drawer: Bool) {
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controller.view)
        controller.view.layer.cornerRadius = Radius.radiusLg
        controller.view.layer.cornerCurve = .continuous
        controller.view.boxShadow = Shadow.shadowDrawer
        self.drawer = drawer
        if drawer {
            drawerFull = false
            let height = controller.view.heightAnchor.constraint(equalToConstant: drawerRoom * 0.6)
            let floor = controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -composerInset)
            drawerHeight = height
            drawerFloor = floor
            NSLayoutConstraint.activate([
                controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                height, floor,
            ])
            controller.dragArea.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragDrawer)))
            controller.didMove(toParent: self)
            if !UIAccessibility.isReduceMotionEnabled {
                controller.view.transform = CGAffineTransform(translationX: 0, y: drawerRoom * 0.6)
                Motion.easeOut.animator(Motion.durPanel) { controller.view.transform = .identity }.startAnimation()
            }
            return
        }
        transcriptTrailing.isActive = false
        let share = controller.view.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.45)
        share.priority = .defaultHigh
        transcriptTrailing = transcriptHost.view.trailingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: -Space.space2)
        NSLayoutConstraint.activate([
            controller.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: Space.space2),
            controller.view.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Space.space2),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space2),
            share,
            controller.view.widthAnchor.constraint(greaterThanOrEqualToConstant: 320),
            transcriptTrailing,
        ])
        controller.didMove(toParent: self)
    }

    private func unembed(_ controller: PreviewController) {
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        drawerHeight = nil
        drawerFloor = nil
        if !drawer {
            transcriptTrailing.isActive = false
            transcriptTrailing = transcriptHost.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)
            transcriptTrailing.isActive = true
        }
        view.setNeedsLayout()
    }

    /// Back to its middle height (client.svelte.ts `revealPreview`).
    private func reveal(_ controller: PreviewController) {
        guard drawer, controller.parent === self, let drawerHeight else { return }
        drawerFull = false
        drawerHeight.constant = drawerRoom * 0.6
        Motion.easeOut.animator(Motion.durPanel) { self.view.layoutIfNeeded() }.startAnimation()
    }

    private func removePreview() {
        guard let controller = preview else { return }
        preview = nil
        if controller.parent === self { unembed(controller) }
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.horizontalSizeClass != traitCollection.horizontalSizeClass { syncPreview() }
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
                // Each change stands at most the token's share of the screen, scrolling inside.
                let cap = (view.window?.bounds.height ?? view.bounds.height) * Size.cAskDiffShare
                let made = PromptCardView(ask, arriving: shownOnce && composerBinding.composer != nil) { change in
                    DiffView(path: change.path, old: change.before, new: change.after, cap: cap)
                }
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

    /// Why nothing can be sent here now, other than an empty field: the
    /// composer's action box wears it as its warning state and explains on a
    /// tap. Nothing is said unasked (HIG Alerts: "Avoid using an alert merely
    /// to provide information"). The first seconds of a connect, and a swipe,
    /// are too brief to explain.
    private func sendBlock() -> SendBlock? {
        // The hub answered in a shape this app cannot read (HubConnection
        // `incompatible`, the same check, words and `/health` version the
        // connect screen uses): the fix is an update, so it is told in an alert.
        if let incompatible = hub.incompatible {
            return SendBlock(reason: HubConnection.Incompatible.title) { [weak self] in
                self?.explainIncompatible(incompatible)
            }
        }
        if hub.state == .unreachable {
            let reason = "Reconnecting to the hub…"
            return SendBlock(reason: reason, menu: UIMenu(title: reason, children: [
                UIAction(title: "Reconnect", image: Glyph.refresh.image) { [weak hub] _ in hub?.reconnectNow() },
            ]))
        }
        return nil
    }

    /// The one reason that carries its fix in an alert: this app and the hub
    /// don't match, and either update fixes it (HubMismatchController's words).
    private func explainIncompatible(_ incompatible: HubConnection.Incompatible) {
        let alert = UIAlertController(title: HubConnection.Incompatible.title,
                                      message: incompatible.message(host: hub.address?.host() ?? "your hub"), preferredStyle: .alert)
        let open = UIAlertAction(title: "Open TestFlight", style: .default) { _ in
            UIApplication.shared.open(HubConnection.Incompatible.testFlight)
        }
        alert.addAction(open)
        alert.addAction(UIAlertAction(title: "Reconnect", style: .default) { [weak hub] _ in hub?.reconnect() })
        alert.preferredAction = open
        present(alert, animated: true)
    }

    func focusComposer() { composerBinding.focus() }
    /// Composer.svelte's rule: a conversation on the board takes a message
    /// whatever its status, while the hub is there. The hub wakes a sleeping
    /// or stopped session to read it (server.ts `deliverSend`).
    var canSend: Bool { hub.state == .connected && hub.fleet.byId[sessionId]?.isListed == true }
    /// Stop has a turn to end only in a live session (Composer.svelte `busy`).
    var canStop: Bool { hub.state == .connected && hub.fleet.byId[sessionId]?.isLive == true }

    /// The first permission parked here, for the menu bar's Approve and Deny.
    private var pendingAsk: ParkedAsk? { hub.needs.parked[sessionId]?.first { !$0.isQuestion } }
    var answerTarget: (ask: ParkedAsk, machineId: String)? {
        guard hub.state == .connected, let ask = pendingAsk, let row = hub.fleet.byId[sessionId] else { return nil }
        let sent = hub.needs.answerSent(for: ask)
        return sent == nil || sent?.stage == .failed ? (ask, row.machineId) : nil
    }

    func stopTurn() {
        guard canStop, let row = hub.fleet.byId[sessionId] else { return }
        sent = hub.sessions.stop(row)
        requestRefresh()
    }

    private func send(_ words: String, _ attachments: [ComposerAttachment]) {
        guard canSend, let row = hub.fleet.byId[sessionId] else { return }
        editNote = nil
        var images: [(mediaType: String, data: Data)] = []
        var texts: [(name: String, content: String)] = []
        var files: [SentFile] = []
        for attachment in attachments {
            switch attachment {
            case let .image(_, mediaType, data): images.append((mediaType, data))
            case let .text(name, content): texts.append((name, content))
            case let .file(_, name, mediaType, size, .ready(ref)): files.append(SentFile(name: name, mediaType: mediaType, size: size, ref: ref))
            // The composer sends nothing while a pick is being read or a file is not on the hub.
            case .file, .pending: return
            }
        }
        let id = hub.sessions.steer(row, text: words, images: images, texts: texts, files: files)
        sent = id
        if hub.ledger.commands[id]?.undelivered != true { composerBinding.sent() }
        requestRefresh()
    }

    // MARK: A queued message

    /// The harness the session runs.
    private var harness: String? {
        hub.fleet.byId[sessionId]?.harness ?? transcript.facts?.harness ?? transcript.location?.harness
    }

    /// client.svelte.ts `canWithdraw`: a send still waiting to be read, on
    /// Claude's harness (the only one that recalls a single pending send),
    /// with the session live and the hub there.
    private func canWithdraw(_ id: String) -> Bool {
        canStop && harness == "claude" && SentMessages.isQueued(id, in: transcript)
    }

    /// The reader's newest message, when it is queued and can be withdrawn.
    private func editableQueued() -> RecallEntry? {
        guard let newest = SentMessages.recall(transcript).first, newest.queued, canWithdraw(newest.id) else { return nil }
        return newest
    }

    /// A tap on a queued bubble: its words into the composer.
    private func liftQueued(_ id: String) {
        guard canWithdraw(id), let entry = SentMessages.recall(transcript).first(where: { $0.id == id }) else { return }
        composerBinding.editQueued(entry)
    }

    /// client.svelte.ts `replaceQueued`: withdraw the queued send, and once
    /// the hub says it was withdrawn before the session read it, send the
    /// edited words in its place (`replaces`), carrying what the send carried.
    /// Read first, the edit stays the reader's, as a draft, and the
    /// composer's error line says why.
    private func replaceQueued(_ id: String, with text: String) {
        guard let row = hub.fleet.byId[sessionId], canWithdraw(id) else {
            let note = SentMessages.isQueued(id, in: transcript)
                ? "Couldn't edit your queued message: the session can't be reached. Your edit is back in the composer."
                : "Claude Code had already read your queued message, so it went as it was. Your edit is back in the composer."
            keepEdit(id, text, note)
            return
        }
        editNote = nil
        let extras = SentMessages.extras(of: id, in: transcript)
        Task { [weak self] in
            var images: [(mediaType: String, data: Data)] = []
            for image in extras.images {
                guard let self else { return }
                guard let url = mediaURL(image.src), let fetched = try? await URLSession.shared.data(from: url) else {
                    keepEdit(id, text, "Couldn't edit your queued message: a picture it carries couldn't be read. Your edit is back in the composer.")
                    return
                }
                images.append((image.mediaType, fetched.0))
            }
            self?.withdraw(id, row: row, text: text, images: images, texts: extras.texts, files: extras.files)
        }
    }

    private func withdraw(_ id: String, row: InstanceRow, text: String, images: [(mediaType: String, data: Data)],
                          texts: [(name: String, content: String)], files: [SentFile]) {
        var command = ""
        command = hub.sessions.withdraw(row, sendId: id) { [weak self] stage, reason in
            guard let self else { return }
            if stage == .applied, hub.ledger.commands[command]?.outcome == "withdrawn" {
                let replacement = hub.sessions.steer(row, text: text, images: images, texts: texts, files: files, replaces: id)
                sent = replacement
                // Withdrawn and its replacement never left this device: the words are only here, so they go back
                // to the composer (as a plain send keeps its draft). A later failure stays a failed row to try again.
                if hub.ledger.commands[replacement]?.undelivered == true {
                    keepEdit(id, text, "Couldn't send your edit, and your queued message was already taken back. Your edit is back in the composer.")
                }
            } else if stage == .applied {
                keepEdit(id, text, "Claude Code had already read your queued message, so it went as it was. Your edit is back in the composer.")
            } else {
                keepEdit(id, text, "Couldn't edit your queued message.\(reason.map { " \($0)" } ?? "") Your edit is back in the composer.")
            }
            requestRefresh()
        }
        withdrawing = command
        requestRefresh()
    }

    /// The edit did not go in: the message shows its own words again, and
    /// the edited words are the reader's, after any draft they have written since.
    private func keepEdit(_ id: String, _ text: String, _ note: String) {
        transcriptView.dropReplacement(id)
        editNote = note
        let draft = composerBinding.draft
        composerBinding.setDraft(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? text : draft + "\n\n" + text)
        requestRefresh()
    }

    /// A picture's hub path or address, resolved against the hub.
    private func mediaURL(_ src: String) -> URL? {
        if let absolute = URL(string: src), absolute.scheme != nil { return absolute }
        guard let base = hub.address else { return nil }
        return URL(string: src, relativeTo: base)?.absoluteURL
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
        config.filter = .any(of: [.images, .videos])
        // A video as it is stored, not transcoded first.
        config.preferredAssetRepresentationMode = .current
        config.selectionLimit = 0
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: true)
    }

    /// Any file at all: a picture, a text, or anything else, which uploads.
    private func pickFiles() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = self
        present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        for result in results {
            let provider = result.itemProvider
            if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                loadFile(provider, type: .movie)
            } else {
                loadImage(provider)
            }
        }
    }

    func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        for url in urls {
            let type = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType) ?? UTType(filenameExtension: url.pathExtension)
            ingest(url, name: url.lastPathComponent, type: type)
        }
    }

    /// Whatever is pasted into the composer that is not words: a picture as
    /// a picture, anything else as Choose File takes it, by its own type
    /// rather than the link Files copies beside it; and a bare link to a file,
    /// as the file it names.
    private func attachPasted(_ items: [NSItemProvider]) {
        for provider in items {
            let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                loadImage(provider)
            } else if let type = types.first(where: { !$0.conforms(to: .url) }) {
                loadFile(provider, type: type)
            } else if types.contains(where: { $0.conforms(to: .fileURL) }) {
                loadLinkedFile(provider)
            }
        }
    }

    /// A pasted link to a file: the file it names, copied while it may be read.
    private func loadLinkedFile(_ provider: NSItemProvider) {
        let slot = reserve(provider.suggestedName ?? "File")
        _ = provider.loadObject(ofClass: URL.self) { [weak self] url, error in
            let scoped = url?.startAccessingSecurityScopedResource() ?? false
            let kept = url.flatMap { Self.keep($0, name: $0.lastPathComponent) }
            if scoped { url?.stopAccessingSecurityScopedResource() }
            let reason = error?.localizedDescription ?? "The file couldn't be read."
            Task { @MainActor in
                guard let self else { return }
                guard let kept else {
                    self.composerBinding.resolve(slot, with: nil)
                    Toast.error("Couldn't attach that file. \(reason)", in: self.view)
                    return
                }
                let type = (try? kept.resourceValues(forKeys: [.contentTypeKey]).contentType) ?? UTType(filenameExtension: kept.pathExtension)
                self.ingest(kept, name: kept.lastPathComponent, type: type, slot: slot)
            }
        }
    }

    /// A pick or paste is read off its source in the background. Its place
    /// in the draft is taken now, under its own id, and what it becomes
    /// fills that place and no other: a read that lands after the place is
    /// gone (removed, or sent) is dropped rather than riding the next message.
    private func reserve(_ name: String) -> String {
        let id = UUID().uuidString
        composerBinding.attach(.pending(id: id, name: name))
        return id
    }

    private func loadImage(_ provider: NSItemProvider) {
        let name = provider.suggestedName ?? "Image"
        let slot = reserve(name)
        provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, error in
            let image = data.flatMap(Self.sendable)
            Task { @MainActor in
                guard let self else { return }
                guard let image else {
                    self.composerBinding.resolve(slot, with: nil)
                    Toast.error("Couldn't attach \(name). \(error?.localizedDescription ?? "The picture couldn't be read.")", in: self.view)
                    return
                }
                self.composerBinding.resolve(slot, with: .image(name: name, mediaType: image.type, data: image.data))
            }
        }
    }

    /// A provider's file, copied out of the callback (its copy is gone once
    /// the callback returns) and taken as a picked file, in its own place.
    private func loadFile(_ provider: NSItemProvider, type: UTType) {
        let suggested = provider.suggestedName
        let slot = reserve(suggested ?? "File")
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [weak self] url, error in
            let kept = url.flatMap { Self.keep($0, name: Self.fileName(suggested, url: $0, type: type)) }
            // The copy's own type is the narrower one (a video picked as any movie is a QuickTime movie).
            let actual = kept.flatMap { UTType(filenameExtension: $0.pathExtension) }.flatMap { $0.conforms(to: type) ? $0 : nil } ?? type
            let reason = error?.localizedDescription ?? "The file couldn't be read."
            Task { @MainActor in
                guard let self else { return }
                guard let kept else {
                    self.composerBinding.resolve(slot, with: nil)
                    Toast.error("Couldn't attach that file. \(reason)", in: self.view)
                    return
                }
                self.ingest(kept, name: kept.lastPathComponent, type: actual, slot: slot)
            }
        }
    }

    /// The largest text that rides as text, folded into the turn.
    private static let textLimit = 1024 * 1024

    /// What a file becomes (Composer.svelte `addFiles`): a picture, through
    /// `sendable`; a text, when it is one, reads as UTF-8 and is at most
    /// 1 MB; anything else a file, uploading to the hub at once.
    /// `slot`: the place a pick reserved, which this fills; without one the
    /// attachment is added at the end.
    private func ingest(_ url: URL, name: String, type: UTType?, slot: String? = nil) {
        let place = { [composerBinding] (attachment: ComposerAttachment) -> Bool in
            guard let slot else {
                composerBinding.attach(attachment)
                return true
            }
            return composerBinding.resolve(slot, with: attachment)
        }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if type?.conforms(to: .image) == true, let data = try? Data(contentsOf: url), let image = Self.sendable(data) {
            place(.image(name: name, mediaType: image.type, data: image.data))
            return
        }
        if type?.conforms(to: .text) == true, size <= Self.textLimit,
           let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) {
            place(.text(name: name, content: text))
            return
        }
        let id = slot ?? UUID().uuidString
        let mediaType = type?.preferredMIMEType ?? "application/octet-stream"
        guard place(.file(id: id, name: name, mediaType: mediaType, size: size, state: .uploading(0))) else { return }
        uploads[id] = Upload(url: url, name: name, mediaType: mediaType)
        upload(id)
    }

    /// A file on its way to the hub, kept until the hub has it so a failed
    /// upload can be tried again. `attempt` lets a late word from an earlier
    /// try fall on the floor.
    private struct Upload {
        let url: URL
        let name: String
        let mediaType: String
        var attempt = 0
    }

    private var uploads: [String: Upload] = [:]

    /// Uploads (again) the file `id`; its chip follows along.
    private func upload(_ id: String) {
        guard var job = uploads[id] else { return }
        job.attempt += 1
        uploads[id] = job
        let attempt = job.attempt
        composerBinding.updateFile(id, .uploading(0))
        // Heard on URLSession's queue; the chip moves on the main actor.
        let report: @Sendable (Double) -> Void = { [weak self] fraction in
            Task { @MainActor in
                guard let self, self.uploads[id]?.attempt == attempt else { return }
                self.composerBinding.updateFile(id, .uploading(fraction))
            }
        }
        Task { [weak self, hub] in
            do {
                let file = try await hub.uploadFile(at: job.url, name: job.name, mediaType: job.mediaType, progress: report)
                guard let self, uploads[id]?.attempt == attempt else { return }
                uploads[id] = nil
                composerBinding.updateFile(id, .ready(file.ref))
                if job.url.path.hasPrefix(Self.keptFiles.path) { try? FileManager.default.removeItem(at: job.url.deletingLastPathComponent()) }
            } catch {
                guard let self, uploads[id]?.attempt == attempt else { return }
                // A later progress word from this try must not bring the ring back.
                uploads[id]?.attempt += 1
                composerBinding.updateFile(id, .failed(error.localizedDescription))
            }
        }
    }

    /// Where pasted and picked files wait to upload: a folder of their own each.
    nonisolated private static var keptFiles: URL {
        FileManager.default.temporaryDirectory.appending(path: "cawco-uploads", directoryHint: .isDirectory)
    }

    nonisolated private static func keep(_ url: URL, name: String) -> URL? {
        let folder = keptFiles.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let kept = folder.appending(path: name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: kept)
            return kept
        } catch {
            return nil
        }
    }

    /// The name a pasted or picked file goes by: the name its source
    /// suggested, with its type's extension, else the copy's own.
    nonisolated private static func fileName(_ suggested: String?, url: URL, type: UTType) -> String {
        // A pasted item names nothing, and its copy's name is a hash: it goes by its kind ("PDF document.pdf").
        let suggested = suggested.flatMap { $0.isEmpty ? nil : $0 } ?? type.localizedDescription ?? "File"
        guard let ext = type.preferredFilenameExtension ?? (url.pathExtension.isEmpty ? nil : url.pathExtension),
              (suggested as NSString).pathExtension.isEmpty else { return suggested }
        return "\(suggested).\(ext)"
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
