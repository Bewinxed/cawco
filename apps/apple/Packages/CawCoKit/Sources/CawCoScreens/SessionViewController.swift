import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import CawCoTranscript
import OSLog
import PhotosUI
import UIKit
import UniformTypeIdentifiers
import WebKit

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
    /// What `supportedCommands` last answered: every command with its prose.
    /// Nil until the session has answered once.
    private var supported: [Components.Schemas.SlashCommand]?
    private var commandsPending = false
    private var commandsAt = Date.distantPast
    private static let commandsLog = Logger(subsystem: "dev.cawco.app", category: "Commands")
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
        composerBinding.readOlder = { [weak self] in
            guard let self else { return }
            hub.sessions.readOlderPage(sessionId)
        }
        composerBinding.editableQueued = { [weak self] in self?.editableQueued() }
        composerBinding.foldQueued = { [weak self] id, folded, replacement in
            self?.transcriptView.foldQueued(id, folded: folded, replacement: replacement)
        }
        composerBinding.queuedWords = { [weak self] id in self?.transcriptView.queuedWords(id) }
        composerBinding.flashQueued = { [weak self] id in self?.transcriptView.flashQueued(id) }
        composerBinding.onReplaceQueued = { [weak self] id, text in self?.replaceQueued(id, with: text) }
        composerBinding.commands = { [weak self] in self?.availableCommands() ?? [] }
        composerBinding.onMenu = { [weak self] in self?.refreshCommands() }
        // The composer's canvas: it stands in this pane's column and docks into its artifact panel.
        composerBinding.canvasHost = CanvasHost(hub: hub, column: { [weak self] in self?.canvasColumn() },
                                                panel: { [weak self] id in self?.canvasPanel(showing: id) })
    }

    // MARK: The composer's canvas

    /// The pane's box in the window: the column the canvas stands in.
    private func canvasColumn() -> CGRect? {
        guard isViewLoaded, view.window != nil else { return nil }
        return view.convert(view.bounds, to: nil)
    }

    /// The artifact panel's page (its web view, inside the well) in the
    /// window while the panel shows the canvas `id`: at rest, and as drawn
    /// this frame (the drawer's slide, settle or drag).
    private func canvasPanel(showing id: String) -> CanvasPanel? {
        guard let preview, preview.parent === self, preview.isViewLoaded, view.window != nil,
              let frame = hub.previews.byInstance[sessionId], frame.state == .open, frame.artifact.id == id else { return nil }
        var views: [UIView] = [preview.view]
        var found: WKWebView?
        while found == nil, let next = views.popLast() {
            found = next as? WKWebView
            views += next.subviews
        }
        guard let page = found else { return nil }
        let drawn = page.layer.presentation() ?? page.layer
        return CanvasPanel(rest: page.convert(page.bounds, to: nil), shown: drawn.convert(drawn.bounds, to: nil))
    }

    // MARK: The `/` menu

    /// One session's `/` menu (client.svelte.ts `availableCommands`): every
    /// name it listed, wearing whatever `supportedCommands` has since said
    /// about it, ordered skills, plugin commands, built-ins, MCP prompts,
    /// each family by name. The init frame's list leads until the session
    /// answers, with the details it has pushed meanwhile.
    private func availableCommands() -> [ComposerCommand] {
        let facts = transcript.facts?.commands
        let detailed = supported ?? facts?.detailed ?? []
        let details = Dictionary(detailed.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        let listed = facts.map { $0.names.isEmpty ? detailed.map(\.name) : $0.names } ?? detailed.map(\.name)
        let names = supported?.map(\.name) ?? listed
        // An answer whose commands carry kinds says which are skills itself.
        let tagged = supported.flatMap { answer -> [String]? in
            answer.contains { $0.kind != nil } ? answer.filter { $0.kind?.rawValue == "skill" }.map(\.name) : nil
        }
        let skills = tagged ?? facts?.skills ?? []
        return names.map { name in
            let known = details[name]
            return ComposerCommand(name: name, description: known?.description, argumentHint: known?.argumentHint,
                                   kind: known?.kind.flatMap { Self.commandKind($0.rawValue) }, skills: skills)
        }.sorted { $0.kind != $1.kind ? $0.kind < $1.kind : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private static func commandKind(_ raw: String) -> ComposerCommand.Kind? {
        switch raw {
        case "skill": .skill
        case "custom": .custom
        case "builtin": .builtin
        case "mcp": .mcp
        default: nil
        }
    }

    /// The menu asks the session what it has each time a `/` word starts,
    /// at most once every three seconds (client.svelte.ts `refreshCommands`);
    /// the init frame's list is the free prefill until it answers.
    private func refreshCommands() {
        guard !commandsPending, Date.now.timeIntervalSince(commandsAt) >= 3,
              let machineId = hub.fleet.byId[sessionId]?.machineId else { return }
        commandsPending = true
        Task { [weak self, hub, sessionId] in
            do {
                let answer = try await hub.supportedCommands(instanceId: sessionId, machineId: machineId)
                self?.supported = answer
                self?.composerBinding.publish()
            } catch {
                // A session in custody (handed back after an agent restart) refuses for a moment; the next `/` asks again.
                if !error.localizedDescription.contains("(custody)") {
                    Self.commandsLog.error("supportedCommands on \(sessionId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
                }
            }
            self?.commandsAt = .now
            self?.commandsPending = false
        }
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
        transcriptFill = transcriptView.trailingAnchor.constraint(equalTo: transcriptHost.view.trailingAnchor)
        transcriptPinned = transcriptView.widthAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            transcriptHost.view.topAnchor.constraint(equalTo: view.topAnchor),
            transcriptHost.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            transcriptTrailing,
            transcriptHost.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            transcriptView.topAnchor.constraint(equalTo: transcriptHost.view.topAnchor),
            transcriptView.leadingAnchor.constraint(equalTo: transcriptHost.view.leadingAnchor),
            transcriptFill,
            transcriptView.bottomAnchor.constraint(equalTo: transcriptHost.view.bottomAnchor),
        ])
        clearComposer()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        clearComposer()
        placeSplit()
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
        // Laid out expanded before it had a window (a relaunch): Esc is the pane's now.
        if expanded { takeKeys() }
    }

    /// Ends the subscription; PaneHost calls it when the tab closes.
    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        onClose()
    }

    var restorationValues: [String: Any] {
        var values: [String: Any] = ["draft": composerBinding.draft]
        // The draft's canvas comes back as its chip.
        if let canvas = composerBinding.canvas { values["canvas"] = [canvas.id, canvas.name] }
        let position = transcriptView.restorationPosition
        Self.restoring.notice("place saved for \(self.sessionId.prefix(8), privacy: .public): following \(position.following), anchor \(position.anchor ?? "none", privacy: .public) +\(position.offset, format: .fixed(precision: 1))")
        if let data = try? JSONEncoder().encode(position) { values["transcriptPosition"] = data }
        return values
    }

    func restoreValues(_ values: [AnyHashable: Any]) {
        if let draft = values["draft"] as? String { composerBinding.setDraft(draft) }
        if let canvas = values["canvas"] as? [String], canvas.count == 2 { composerBinding.restoreCanvas(id: canvas[0], name: canvas[1]) }
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
        syncAskAlone()
        transcriptView.configure(transcript)
        let prestart = syncMove()

        composerBinding.writable = canSend && !prestart
        let command = sent.flatMap { hub.ledger.commands[$0] }
        let withdrawal = withdrawing.flatMap { hub.ledger.commands[$0] }
        if command?.stage == .submitted || withdrawal?.stage == .submitted || withdrawal?.stage == .accepted {
            composerBinding.action = .sending
        } else {
            composerBinding.action = transcript.tail?.busy == true && canStop ? .stop : .send
        }
        composerBinding.sendError = editNote ?? (command?.stage == .failed ? "Couldn't send that message.\(command?.reason.map { " \($0)" } ?? "")" : nil)
        composerBinding.sendBlock = sendBlock()
        syncCards()
        composerBinding.publish()
        syncPreview()
    }

    // MARK: An ask standing alone (SessionPane.svelte `askAlone`)

    /// The hub held an ask under this id and no session (`HubConnection.askAlone`,
    /// a memory proposal): the pane is that ask's card alone, no transcript
    /// and no "isn't reachable". Kept once seen, so nothing is said in the
    /// moment between the answer and the pane's close.
    private var askHeld = false
    private var askClosed = false
    #if DEBUG
    private var probeAlone = ""
    #endif

    private func syncAskAlone() {
        let asking = hub.askAlone(sessionId)
        if asking { askHeld = true }
        transcriptHost.view.isHidden = askHeld
        let leaving = askHeld && !asking && hub.fleet.byId[sessionId] == nil
        #if DEBUG
        let said = "probe alone \(sessionId): asking \(asking) transcript \(askHeld ? "hidden" : "shown")\(leaving ? " leaving" : "")"
        if askHeld, said != probeAlone {
            probeAlone = said
            Self.restoring.notice("\(said, privacy: .public)")
        }
        #endif
        // Answered, or settled anywhere: the pane closes as its tab's own close does.
        guard leaving, !askClosed else { return }
        askClosed = true
        DispatchQueue.main.async { [weak self] in self?.onReturnToFleet() }
    }

    // MARK: A project moving for this session (move/MoveWait.svelte)

    /// The staged wait: the whole pane until the move starts the session,
    /// then over its transcript until that has rows (design §2e: the moved
    /// line is the transcript's first row by then).
    private var moveWait: MoveWaitView?
    /// The transcript was read again once the move started the session: its first read found nothing.
    private var readAfterStart = false
    #if DEBUG
    /// What the move's wait last said to a simulator pass's log.
    private var probeSaid = ""
    #endif

    /// Shows or takes away the move's wait; true while the session does not exist yet.
    private func syncMove() -> Bool {
        guard let move = hub.fleet.move(for: sessionId) else {
            removeMoveWait()
            return false
        }
        let prestart = move.stage != .started
        if !prestart, !readAfterStart, hub.fleet.byId[sessionId] != nil {
            readAfterStart = true
            hub.sessions.read(sessionId, because: .moveStarted)
        }
        guard prestart || transcript.blocks.isEmpty else {
            removeMoveWait()
            return false
        }
        let wait = moveWait ?? makeMoveWait()
        wait.show(move) { [hub] id in hub.fleet.machineName(id) }
        #if DEBUG
        let said = "move \(move.id.prefix(8)): \(move.stage.rawValue) · \(wait.said)"
        if said != probeSaid {
            probeSaid = said
            Self.restoring.notice("probe \(said, privacy: .public)")
        }
        #endif
        return prestart
    }

    private func makeMoveWait() -> MoveWaitView {
        let wait = MoveWaitView()
        wait.onCancel = { [weak self] in self?.cancelMove() }
        wait.onRetry = { [weak self] in self?.retryMove() }
        wait.onClose = { [weak self] in self?.onReturnToFleet() }
        wait.onAnswer = { [weak self] moveIt in self?.answerMove(moveIt) }
        view.addSubview(wait)
        NSLayoutConstraint.activate([
            wait.topAnchor.constraint(equalTo: view.topAnchor),
            wait.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            wait.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            wait.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        moveWait = wait
        return wait
    }

    /// The wait fades from over the transcript.
    private func removeMoveWait() {
        guard let wait = moveWait else { return }
        moveWait = nil
        guard view.window != nil, !UIAccessibility.isReduceMotionEnabled else {
            wait.removeFromSuperview()
            return
        }
        let fade = Motion.easeOut.animator(Motion.durFade) { wait.alpha = 0 }
        fade.addCompletion { _ in wait.removeFromSuperview() }
        fade.startAnimation()
    }

    /// Cancel: the hub stops the step in flight; the tab closes and says what stayed on disk.
    private func cancelMove() {
        guard let move = hub.fleet.move(for: sessionId) else { return }
        Task { [weak self] in
            guard let self else { return }
            do {
                let stopped = try await hub.cancelMove(id: move.id)
                Toast.show((["Stopped.", stopped.kept].compactMap(\.self)).joined(separator: " "), in: view.window)
                onReturnToFleet()
            } catch {
                Toast.error("Couldn't stop the move. \(error.localizedDescription)", in: view)
            }
        }
    }

    private func retryMove() {
        guard let move = hub.fleet.move(for: sessionId) else { return }
        Task { [weak self] in
            guard let self else { return }
            do { try await hub.retryMove(id: move.id) } catch { Toast.error("Couldn't retry the move. \(error.localizedDescription)", in: view) }
        }
    }

    /// The approval card's answer, through the same channel as every ask's:
    /// parked on this session's own row, which reads "Needs you" until now.
    private func answerMove(_ moveIt: Bool) {
        guard let move = hub.fleet.move(for: sessionId),
              let ask = hub.needs.parked[move.targetInstanceId]?.first(where: { $0.requestId == move.askId }),
              let question = ask.questions.first?.question else { return }
        hub.needs.answerQuestion(ask, answers: [question: [moveIt ? "Move it" : "Don't move"]])
    }

    // MARK: The preview (SessionPane's preview split, PreviewSheet)

    private var preview: PreviewController?
    /// The transcript to the pane's trailing edge: active unless the preview stands beside it.
    private var transcriptTrailing: NSLayoutConstraint!
    /// The transcript fills its host; collapsed, it keeps the width it had
    /// (`transcriptPinned`) while its host closes over it, so it is covered
    /// rather than laid out again at every frame of the slide.
    private var transcriptFill: NSLayoutConstraint!
    private var transcriptPinned: NSLayoutConstraint!
    /// The preview's key the transcript's cards were last drawn against.
    private var drawnPreview: String?

    /// A preview card was pressed while the preview shows its artifact, or
    /// once the hub opened it (the card's `artifact_show` route, ToolGroup's
    /// `revealPreview` after `showArtifact`): the open preview comes into view.
    private func openPreview(_: [String: Any]) {
        guard hub.previews.byInstance[sessionId]?.state == .open, let preview else { return }
        reveal(preview)
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
        // A new width (a rotation, a resized window) holds the split to its floors again.
        placeSplit()
        // A docked canvas stands over the panel's page: it follows it as it moves.
        composerBinding.panelMoved()
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
        #if DEBUG
        probeSplit()
        #endif
    }

    /// How much of the pane's width, from its leading edge, the transcript
    /// holds (SessionPane.svelte's `transcriptShare`).
    private(set) var transcriptShare: CGFloat = 1
    var onTranscriptShare: () -> Void = {}

    /// The drawer follows the composer (it grows with a draft, rises with
    /// the keyboard) and the pane's height, at its middle or full height.
    private func placeDrawer() {
        guard drawer, let drawerHeight, let drawerFloor, !dragging, !drawerLeaving else { return }
        let height = drawerRoom * (drawerFull ? 1 : 0.6)
        guard abs(drawerFloor.constant + composerInset) > 0.5 || abs(drawerHeight.constant - height) > 0.5 else { return }
        drawerFloor.constant = -composerInset
        drawerHeight.constant = height
        view.layoutIfNeeded()
    }

    private var dragging = false
    private var dragFrom: CGFloat = 0
    /// The drawer settling on a height, which a new drag catches where it is.
    private var drawerSettle: UIViewPropertyAnimator?

    /// The drawer's grabber and header follow the finger 1:1 between its
    /// heights. Let go, where the finger was headed decides (its release
    /// projected on: UIScrollView's normal deceleration): projected past 30%
    /// under the middle height the preview closes, as Close does; otherwise
    /// it settles on the nearer of the middle and the full height, on the
    /// settle spring at the finger's speed.
    @objc private func dragDrawer(_ pan: UIPanGestureRecognizer) {
        guard let drawerHeight, let preview, !drawerLeaving else { return }
        let room = drawerRoom
        let followed = min(room, max(0, dragFrom - pan.translation(in: view).y))
        switch pan.state {
        case .began:
            dragging = true
            // Caught mid-settle: the drawer stays where it is drawn.
            if let drawerSettle, drawerSettle.state == .active {
                drawerSettle.stopAnimation(true)
                drawerHeight.constant = preview.view.frame.height
            }
            drawerSettle = nil
            dragFrom = drawerHeight.constant
        case .changed:
            drawerHeight.constant = followed
        case .ended, .cancelled:
            dragging = false
            // Toward the drawer's top is a taller drawer.
            let speed = -pan.velocity(in: view).y
            // Where the finger let go, not the last height drawn: a quick
            // drag may end before a single change was delivered.
            let height = followed
            let middle = room * 0.6
            let rate = UIScrollView.DecelerationRate.normal.rawValue
            let projected = height + speed / 1000 * rate / (1 - rate)
            if pan.state == .ended, projected < middle * 0.7 {
                dismissDrawer(speed: speed)
                return
            }
            drawerFull = projected > (middle + room) / 2
            settleDrawer(from: height, speed: speed)
        default:
            break
        }
    }

    /// The drawer swiped away is leaving while the hub closes its preview.
    private var drawerLeaving = false

    /// Swiped away: the drawer leaves downward past the screen's foot on the
    /// settle spring at the finger's speed, and the hub closes the preview as
    /// Close does. Should the hub keep it open, the drawer comes back to its
    /// middle height, with the hub's reason over the page.
    private func dismissDrawer(speed: CGFloat) {
        guard let preview, let drawerHeight else { return }
        drawerLeaving = true
        let away = drawerHeight.constant + composerInset
        // Downward is negative speed (taller is positive).
        let spring = UISpringTimingParameters(duration: Motion.durSettle, bounce: 0,
                                              initialVelocity: CGVector(dx: 0, dy: away > 0.5 ? max(0, -speed) / away : 0))
        let animator = UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: spring)
        animator.addAnimations { preview.view.transform = CGAffineTransform(translationX: 0, y: away) }
        animator.startAnimation()
        drawerSettle = animator
        composerBinding.panelMoved()
        preview.close { [weak self, weak preview] in
            guard let self, let preview, preview === self.preview, preview.parent === self else { return }
            drawerLeaving = false
            drawerFull = false
            settleDrawer(from: self.drawerHeight?.constant ?? 0, speed: 0)
        }
    }

    /// A tap on the grabber moves the drawer to its other height (SideSheet.svelte `cycleSnap`).
    @objc private func cycleDrawer() {
        guard let drawerHeight, !dragging, !drawerLeaving else { return }
        drawerFull.toggle()
        settleDrawer(from: drawerHeight.constant, speed: 0)
    }

    /// To the height `drawerFull` names, on the settle spring, leaving at
    /// `speed` (points a second, taller positive).
    private func settleDrawer(from height: CGFloat, speed: CGFloat) {
        guard let drawerHeight else { return }
        // A settle under way is caught where it is drawn, and this one goes on from there.
        if let running = drawerSettle, running.state == .active { running.stopAnimation(true) }
        let target = drawerRoom * (drawerFull ? 1 : 0.6)
        drawerHeight.constant = target
        let distance = target - height
        let spring = UISpringTimingParameters(duration: Motion.durSettle, bounce: 0,
                                              initialVelocity: CGVector(dx: 0, dy: abs(distance) > 0.5 ? speed / distance : 0))
        let animator = UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: spring)
        animator.isInterruptible = true
        // A drawer that was leaving comes back from where it is drawn.
        let drawn = preview?.view
        animator.addAnimations {
            drawn?.transform = .identity
            self.view.layoutIfNeeded()
        }
        animator.startAnimation()
        drawerSettle = animator
        preview?.grabArea.accessibilityValue = drawerFull ? "Full height" : "Half height"
    }

    private func makePreview() -> PreviewController {
        let controller = PreviewController(hub: hub, instanceId: sessionId)
        preview = controller
        return controller
    }

    /// The web's wide layout: the preview beside the transcript, its share of
    /// the pane's width, never under its 320pt floor. On a compact width the
    /// phone's drawer (PreviewSheet): over the transcript, its floor the top
    /// of the composer, so the conversation's composer stays there to write
    /// and send in; 60% of the room above the composer, or all of it.
    private func embed(_ controller: PreviewController, drawer: Bool) {
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controller.view)
        controller.view.layer.cornerRadius = Radius.radiusLg
        controller.view.layer.cornerCurve = .continuous
        controller.view.boxShadow = Shadow.shadowDrawer
        self.drawer = drawer
        controller.standsAsDrawer(drawer)
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
            for handle in [controller.dragArea!, controller.grabArea] as [UIView] {
                let pan = UIPanGestureRecognizer(target: self, action: #selector(dragDrawer))
                pan.maximumNumberOfTouches = 1
                handle.addGestureRecognizer(pan)
            }
            controller.grabArea.addTarget(self, action: #selector(cycleDrawer), for: .primaryActionTriggered)
            controller.grabArea.accessibilityValue = "Half height"
            controller.didMove(toParent: self)
            if !UIAccessibility.isReduceMotionEnabled {
                controller.view.transform = CGAffineTransform(translationX: 0, y: drawerRoom * 0.6)
                Motion.easeOut.animator(Motion.durPanel) { controller.view.transform = .identity }.startAnimation()
            }
            return
        }
        // Beside the transcript, past the divider (SideSplit.svelte): every
        // edge a constant `placeSplit` sets from the kept share, so dragging,
        // Expand and Back move one set of constraints on one clock.
        transcriptTrailing.isActive = false
        view.addSubview(divider)
        let split = Split(
            transcriptWidth: transcriptHost.view.widthAnchor.constraint(equalToConstant: 0),
            previewLeading: controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewTrailing: controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewTop: controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            previewBottom: controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            dividerCentre: divider.centerXAnchor.constraint(equalTo: view.leadingAnchor),
            dividerWidth: divider.widthAnchor.constraint(equalToConstant: Size.cSideDividerHit)
        )
        self.split = split
        NSLayoutConstraint.activate(split.all + [
            divider.topAnchor.constraint(equalTo: controller.view.topAnchor),
            divider.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor),
        ])
        divider.onDrag = { [weak self] pan in self?.dragSplit(pan) }
        divider.onStep = { [weak self] step in self?.stepSplit(step) }
        controller.onExpand = { [weak self] in self?.toggleExpanded() }
        controller.onEscapeLeft = { [weak self] in self?.collapse() }
        applySplit(sliding: false)
        controller.didMove(toParent: self)
    }

    private func unembed(_ controller: PreviewController) {
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        // The drawer's handles go with it: an embed beside the transcript has none.
        for handle in [controller.dragArea!, controller.grabArea] as [UIView] {
            handle.gestureRecognizers?.filter { $0 is UIPanGestureRecognizer }.forEach(handle.removeGestureRecognizer)
        }
        controller.grabArea.removeTarget(self, action: #selector(cycleDrawer), for: .primaryActionTriggered)
        drawerSettle?.stopAnimation(true)
        drawerSettle = nil
        drawerLeaving = false
        controller.view.transform = .identity
        drawerHeight = nil
        drawerFloor = nil
        if let split {
            // The split goes with the preview: the transcript has the whole pane again.
            slide?.stopAnimation(true)
            slide = nil
            NSLayoutConstraint.deactivate(split.all)
            self.split = nil
            divider.removeFromSuperview()
            controller.onExpand = {}
            controller.onEscapeLeft = {}
            controller.standsExpanded(false)
            putTranscript(away: false)
            transcriptHost.view.clipsToBounds = false
            transcriptTrailing.isActive = true
            if isFirstResponder { resignFirstResponder() }
        }
        view.setNeedsLayout()
    }

    // MARK: The split (SideSplit.svelte)

    /// The split's edges, each a constant `placeSplit` sets.
    private struct Split {
        let transcriptWidth: NSLayoutConstraint
        let previewLeading: NSLayoutConstraint
        let previewTrailing: NSLayoutConstraint
        let previewTop: NSLayoutConstraint
        let previewBottom: NSLayoutConstraint
        let dividerCentre: NSLayoutConstraint
        let dividerWidth: NSLayoutConstraint
        var all: [NSLayoutConstraint] {
            [transcriptWidth, previewLeading, previewTrailing, previewTop, previewBottom, dividerCentre, dividerWidth]
        }
    }

    /// The preview beside the transcript: nil in the phone's drawer or with no preview.
    private var split: Split?
    private let divider = SplitDivider()
    /// Expand or Back sliding on the panel's clock.
    private var slide: UIViewPropertyAnimator?
    /// The kept share when the divider was taken: a drag that ends at the edge gives it back.
    private var splitFrom = 0.0
    /// How far right of the divider's place the finger went down: the drag holds the handle there.
    private var splitGrip = 0.0

    /// Between the transcript and the preview's card, the divider's hairline at its middle.
    private static let splitGap = Space.space2
    /// The preview's narrowest beside the transcript.
    private static let previewFloor = 320.0
    /// The transcript's narrowest share beside the preview (SideSplit.svelte
    /// `CONVERSATION_MIN`). Dragged past it, the transcript collapses: the preview is expanded.
    private static let conversationMin = 0.3
    /// A first visit's share (SideSplit.svelte `savedWidth`).
    private static let firstShare = 0.45

    private var widthKey: String { "cawco.preview.width.\(sessionId)" }
    private var expandedKey: String { "cawco.preview.expanded.\(sessionId)" }

    /// The preview's share of the pane beside the transcript, from the
    /// divider to the trailing edge: this conversation's own, kept across launches.
    private lazy var sideShare: Double = {
        let kept = UserDefaults.standard.double(forKey: widthKey)
        return kept > 0 ? min(1 - Self.conversationMin, kept) : Self.firstShare
    }()

    /// Expand asked for, by the head or by the divider reaching the edge: one
    /// state, kept per conversation beside its share, and ended by a close.
    private lazy var expandAsked = UserDefaults.standard.bool(forKey: expandedKey)

    /// The preview has the whole pane: asked for, with the preview beside the
    /// transcript. The phone's drawer keeps the word for a wider screen.
    private var expanded: Bool { expandAsked && split != nil }

    private func keepExpanded(_ next: Bool) {
        expandAsked = next
        if next {
            UserDefaults.standard.set(true, forKey: expandedKey)
        } else {
            UserDefaults.standard.removeObject(forKey: expandedKey)
        }
    }

    /// The preview's narrowest share of a pane `width` wide: its floor, the gap and the card's inset.
    private func floorShare(_ width: Double) -> Double {
        min(1, (Self.previewFloor + Self.splitGap * 1.5) / width)
    }

    /// The share beside the transcript: the kept one, held to the transcript's narrowest and the preview's floor.
    private func besideShare(_ width: Double) -> Double {
        max(floorShare(width), min(1 - Self.conversationMin, sideShare))
    }

    /// The share the split stands at: all of the pane while expanded.
    private func shownShare(_ width: Double) -> Double {
        expanded ? 1 : besideShare(width)
    }

    /// Every edge of the split from the share it stands at. Beside the
    /// transcript the card keeps its inset and the divider's hairline stands
    /// in the gap; expanded, the card meets the pane's edges and the
    /// divider's hit area stands just inside the leading one, past the rail's
    /// grip over it (SideSplit.svelte `.expanded .side-divider::after`).
    private func placeSplit() {
        guard let split, isViewLoaded else { return }
        let width = view.bounds.width
        guard width > 0 else { return }
        let gap = Self.splitGap
        let whole = expanded
        let at = width * (1 - shownShare(width))
        let insets = view.safeAreaInsets
        Self.place(split.transcriptWidth, whole ? 0 : max(0, at - gap / 2))
        Self.place(split.previewLeading, whole ? 0 : at + gap / 2)
        Self.place(split.previewTrailing, whole ? 0 : -gap)
        Self.place(split.previewTop, whole ? 0 : insets.top + gap)
        Self.place(split.previewBottom, whole ? 0 : -(insets.bottom + gap))
        Self.place(split.dividerWidth, whole ? Space.space3 : Size.cSideDividerHit)
        Self.place(split.dividerCentre, whole ? Space.space1 + Space.space3 / 2 : at)
        Self.place(transcriptPinned, max(0, width * (1 - besideShare(width)) - gap / 2))
    }

    private static func place(_ constraint: NSLayoutConstraint, _ value: Double) {
        if abs(constraint.constant - value) > 0.25 { constraint.constant = value }
    }

    /// Collapsed under the expanded preview, the transcript is put away
    /// (SideSplit.svelte's `inert`): it keeps the width it had under its
    /// closing host, and nothing in it takes a touch, the keyboard or VoiceOver.
    private func putTranscript(away: Bool) {
        let host: UIView = transcriptHost.view
        if away {
            host.endEditing(true)
            transcriptFill.isActive = false
            transcriptPinned.isActive = true
            host.clipsToBounds = true
        } else {
            transcriptPinned.isActive = false
            transcriptFill.isActive = true
        }
        host.isUserInteractionEnabled = !away
        host.accessibilityElementsHidden = away
    }

    /// Lays the split out as `expanded` says, and the card's look with it:
    /// sliding on the panel's clock (`durPanel`, the drawer's ease, as the
    /// web's `.sliding`) when the reader watches it change by Expand, Back or
    /// Esc; at once under a drag, when the split is made, and with Reduce Motion.
    private func applySplit(sliding: Bool) {
        guard let preview, split != nil else { return }
        let whole = expanded
        slide?.stopAnimation(true)
        slide = nil
        divider.expanded = whole
        putTranscript(away: whole)
        // The card's shadow would fall outside the pane once it meets the edges.
        preview.view.boxShadow = whole ? [] : Shadow.shadowDrawer
        placeSplit()
        if whole {
            takeKeys()
        } else if isFirstResponder {
            resignFirstResponder()
        }
        let lay = { [self] in
            preview.standsExpanded(whole)
            preview.view.layer.cornerRadius = whole ? 0 : Radius.radiusLg
            view.layoutIfNeeded()
        }
        guard sliding, view.window != nil, !UIAccessibility.isReduceMotionEnabled else {
            lay()
            transcriptHost.view.clipsToBounds = whole
            return
        }
        let animator = Motion.easeDrawer.animator(Motion.durPanel) { lay() }
        animator.addCompletion { [weak self] position in
            guard let self, position == .end else { return }
            transcriptHost.view.clipsToBounds = expanded
        }
        animator.startAnimation()
        slide = animator
        #if DEBUG
        scrubSlide()
        #endif
    }

    /// The head's Expand, or Back to conversation: the same state as the divider at the edge.
    private func toggleExpanded() {
        guard split != nil else { return }
        keepExpanded(!expanded)
        applySplit(sliding: true)
    }

    /// Back to the last share beside the transcript (Back, Esc); false when it was not expanded.
    @discardableResult
    private func collapse() -> Bool {
        guard expanded else { return false }
        keepExpanded(false)
        applySplit(sliding: true)
        return true
    }

    /// The divider follows the finger or the pointer with no animation. The
    /// transcript dragged under its narrowest stands at it, and past halfway
    /// to nothing collapses (paneforge 1.0.2 `getAdjustedSizeForCollapsible`,
    /// the web's handle): the preview is expanded. Dragged back out, the
    /// transcript stands at its narrowest, then follows. A drag that ends at
    /// the edge was never a width: Back gives the one it started from.
    private func dragSplit(_ pan: UIPanGestureRecognizer) {
        let width = view.bounds.width
        guard split != nil, width > 0 else { return }
        switch pan.state {
        case .began:
            slide?.stopAnimation(true)
            slide = nil
            splitFrom = sideShare
            splitGrip = divider.downX - width * (1 - shownShare(width))
        case .changed, .ended:
            follow(transcript: (pan.location(in: view).x - splitGrip) / width, width: width)
            if pan.state == .ended { endDrag() }
        case .cancelled, .failed:
            endDrag()
        default:
            break
        }
    }

    private func follow(transcript raw: Double, width: Double) {
        var transcript = raw
        if transcript < Self.conversationMin {
            transcript = transcript < Self.conversationMin / 2 ? 0 : Self.conversationMin
        }
        let whole = transcript <= 0
        if !whole { sideShare = max(floorShare(width), min(1 - Self.conversationMin, 1 - transcript)) }
        if whole != expandAsked {
            keepExpanded(whole)
            applySplit(sliding: false)
        } else {
            placeSplit()
            view.layoutIfNeeded()
        }
    }

    private func endDrag() {
        if expandAsked { sideShare = splitFrom }
        UserDefaults.standard.set(sideShare, forKey: widthKey)
    }

    /// VoiceOver's increment widens the preview 5% of the pane, its decrement
    /// narrows it, and from expanded gives the conversation back.
    private func stepSplit(_ step: Int) {
        let width = view.bounds.width
        guard split != nil, width > 0 else { return }
        if expanded {
            if step < 0 { collapse() }
            return
        }
        follow(transcript: 1 - (besideShare(width) + Double(step) * 0.05), width: width)
        UserDefaults.standard.set(sideShare, forKey: widthKey)
    }

    // Expanded, Esc is the pane's (SideSplit.svelte `escapeExpanded`): it
    // takes the keyboard unless something in the preview has it, whose own
    // Esc reaches it up the chain, or from the page through `onEscapeLeft`.
    override var canBecomeFirstResponder: Bool { expanded }

    private func takeKeys() {
        guard view.window != nil, preview?.holdsKeys != true, !isFirstResponder else { return }
        becomeFirstResponder()
    }

    /// Esc, expanded: an open pin's card first, then Comment mode, then the conversation comes back.
    @objc private func escapeKey() {
        if preview?.escape() == true { return }
        collapse()
    }

    #if DEBUG
    private var probedSplit = ""

    /// The split as a simulator pass reads it, logged when it moved: the
    /// pane's bounds, the preview's frame, the transcript's width, the kept
    /// and shown shares, the state, and the composer's share.
    private func probeSplit() {
        guard PreviewProbe.on, let preview, split != nil, view.window != nil else { return }
        let width = view.bounds.width
        let line = "split pane=\(Self.probeRect(view.bounds)) preview=\(Self.probeRect(preview.view.frame)) transcript=\(Int(transcriptHost.view.frame.width.rounded())) divider=\(Int(divider.center.x.rounded())),\(Int(divider.bounds.width.rounded())) kept=\(String(format: "%.3f", sideShare)) shown=\(String(format: "%.3f", shownShare(width))) expanded=\(expanded) away=\(!transcriptHost.view.isUserInteractionEnabled) composerShare=\(String(format: "%.3f", transcriptShare)) keys=\(isFirstResponder) \(preview.probeExpand) dividerAt=\(PreviewProbe.centre(divider))"
        guard line != probedSplit else { return }
        probedSplit = line
        PreviewProbe.say(line)
    }

    /// `-split-scrub`: a slide is held still and read at 0, 50 and 100% of
    /// its clock (the pane's layer at `speed` 0, `timeOffset` stepped from the
    /// slide's begin), then let go.
    private func scrubSlide() {
        guard PreviewProbe.on, ProcessInfo.processInfo.arguments.contains("-split-scrub"), let preview else { return }
        CATransaction.flush()
        let pane = view.layer
        let card = preview.view.layer
        let begun = card.animationKeys()?.compactMap { card.animation(forKey: $0)?.beginTime }.first { $0 > 0 }
        let begin = begun ?? pane.convertTime(CACurrentMediaTime(), from: nil)
        pane.speed = 0
        for fraction in [0.0, 0.5, 1.0] {
            pane.timeOffset = begin + Motion.durPanel * fraction
            CATransaction.flush()
            let drawn = card.presentation()?.frame ?? card.frame
            let transcript = transcriptHost.view.layer.presentation()?.bounds.width ?? -1
            let corner = card.presentation()?.cornerRadius ?? -1
            PreviewProbe.say("split scrub t=\(fraction) preview=\(Self.probeRect(drawn)) transcript=\(Int(transcript.rounded())) corner=\(String(format: "%.1f", corner)) eased=\(String(format: "%.3f", Motion.easeDrawer.value(at: fraction))) begin=\(begun == nil ? "now" : "animation") keys=\(card.animationKeys()?.joined(separator: ",") ?? "none")")
        }
        pane.speed = 1
        pane.timeOffset = 0
    }

    private static func probeRect(_ box: CGRect) -> String {
        "\(Int(box.minX.rounded())),\(Int(box.minY.rounded())),\(Int(box.width.rounded())),\(Int(box.height.rounded()))"
    }
    #endif

    /// Back to its middle height (client.svelte.ts `revealPreview`).
    private func reveal(_ controller: PreviewController) {
        guard drawer, controller.parent === self, drawerHeight != nil, !dragging, !drawerLeaving else { return }
        drawerFull = false
        settleDrawer(from: controller.view.frame.height, speed: 0)
    }

    private func removePreview() {
        guard let controller = preview else { return }
        preview = nil
        if controller.parent === self { unembed(controller) }
        // Closing the preview ends the expansion: what opens next opens beside
        // the conversation. Only a close counts: before the hub's first word
        // after a launch there was no preview to close.
        if expandAsked { keepExpanded(false) }
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.horizontalSizeClass != traitCollection.horizontalSizeClass { syncPreview() }
    }

    /// The parked asks as the composer's cards, in arrival order: a card that
    /// comes in while the session is on screen settles in, and one the hub
    /// has settled leaves. Each is answered on the machine its envelope named,
    /// so one no session row stands behind (a memory proposal) answers too.
    private func syncCards() {
        let parked = hub.needs.parked[sessionId] ?? []
        let ids = Set(parked.map(\.requestId))
        for id in cards.keys where !ids.contains(id) { cards[id] = nil }
        var ordered: [UIView] = []
        for ask in parked {
            let card = cards[ask.requestId] ?? {
                // Each change stands at most the token's share of the screen, scrolling inside.
                let cap = (view.window?.bounds.height ?? view.bounds.height) * Size.cAskDiffShare
                let made = PromptCardView(ask, arriving: shownOnce && composerBinding.composer != nil,
                                          face: { CawMark(status: .needsYou, side: 16) }) { change in
                    DiffView(path: change.path, old: change.before, new: change.after, cap: cap)
                }
                made.onAnswer = { [weak self] choice, picks in self?.answer(ask, choice, picks) }
                made.onHeight = { [weak self] in self?.composerBinding.composer?.onHeight() }
                cards[ask.requestId] = made
                return made
            }()
            card.update(sent: hub.needs.answerSent(for: ask), connected: hub.state == .connected)
            #if DEBUG
            let said = "\(ask.requestId) on \(ask.machineId): \(card.probeState)"
            if probeCards[ask.requestId] != said {
                probeCards[ask.requestId] = said
                Self.restoring.notice("probe card \(said, privacy: .public)")
            }
            #endif
            ordered.append(card)
        }
        composerBinding.prompts = ordered
    }

    #if DEBUG
    /// What each card last said to a simulator pass's log.
    private var probeCards: [String: String] = [:]
    #endif

    private func answer(_ ask: ParkedAsk, _ choice: PromptCardView.Choice, _ picks: [String: [String]]) {
        guard hub.state == .connected else {
            cards[ask.requestId]?.refuse("Couldn't send that answer. The hub is unreachable.")
            return
        }
        let sent = switch choice {
        case .allow: hub.needs.answer(ask, .allow)
        case .deny: hub.needs.answer(ask, .deny)
        case .answer: hub.needs.answerQuestion(ask, answers: picks)
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
        // Local Network privacy refuses the hub: known as soon as the socket is
        // refused, so said from then (no outage grace), and its one fix is the
        // status line's, Open Settings (no Reconnect: trying again can't help).
        if hub.localNetworkDenied {
            let reason = LocalNetwork.refusal
            return SendBlock(reason: reason, menu: UIMenu(title: reason, children: [
                UIAction(title: LocalNetwork.settingsAction, image: Glyph.settings.image) { _ in UIApplication.shared.open(LocalNetwork.settingsURL) },
            ]))
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
    var answerTarget: ParkedAsk? {
        guard hub.state == .connected, let ask = pendingAsk else { return nil }
        let sent = hub.needs.answerSent(for: ask)
        return sent == nil || sent?.stage == .failed ? ask : nil
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
        // The first question card owns the digits and Return while the field is not being written in.
        // Never Escape: a question is put down only by its own Dismiss button.
        if !composerBinding.isWriting, cards.values.contains(where: \.ask.isQuestion) {
            for digit in 1 ... 9 {
                keys.append(UIKeyCommand(input: "\(digit)", modifierFlags: [], action: #selector(cardKey(_:))))
            }
            keys.append(UIKeyCommand(input: "\r", modifierFlags: [], action: #selector(cardKey(_:))))
        }
        // Expanded, Esc gives the conversation back, after the preview's own
        // card and Comment mode; the composer, and its cards, are put away.
        if expanded {
            let escape = UIKeyCommand(title: "Back to Conversation", action: #selector(escapeKey),
                                      input: UIKeyCommand.inputEscape)
            escape.wantsPriorityOverSystemBehavior = true
            keys.append(escape)
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
