import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import CawCoTranscript
import OSLog
import UIKit
import WebKit

/// One conversation's pane (SessionPane.svelte under PaneLeaf.svelte): the
/// transcript, running to the pane's foot. The pane draws no composer
/// (composer-dock.svelte.ts): it publishes what its composer would have been
/// given in `composerBinding` (its draft, its send and stop, its parked
/// permission and question cards) and its group draws one composer over the
/// active tab. The group says how far up the pane that composer stands
/// (`composerInset`), and the transcript keeps its last line clear of it.
final class SessionViewController: ObservedViewController {
    let sessionId: String
    private static let restoring = Logger(subsystem: "dev.cawco.app", category: "Restore")
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let transcriptHost = UIViewController()
    let composerBinding: SessionComposerBinding
    /// What rides with the words: picks, pastes and uploads.
    private var attacher: ComposerAttacher!
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
    /// A project's page: the one a "make this a project" answer joined.
    var onOpenProject: (String) -> Void = { _ in }
    /// The "make this a project" card, while the offer or what it joined stands.
    private var offerCard: ProjectOfferCard?

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
        attacher = ComposerAttacher(hub: hub, binding: composerBinding, presenter: self)
        composerBinding.onPasteItems = { [weak self] items in self?.attacher.pasted(items) }
        composerBinding.onRetryFile = { [weak self] id in self?.attacher.upload(id) }
        composerBinding.attachMenu = attacher.menu()
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
        // Its plan, as the hub keeps it, for as long as the tab is open (SessionPane.svelte's PlanRing).
        hub.plans.follow(id)
        planRing.addAction(UIAction { [weak self] _ in self?.openPlan() }, for: .touchUpInside)
    }

    // MARK: Its plan

    private let planRing = PlanRingButton()
    private weak var planSheet: UIViewController?
    /// The reader asked for the plan beside the conversation (its ring) and has not closed it (SideSplit.svelte `planAsked`).
    private var planAsked = false
    private var planSide: PlanSideController?

    /// The ring on the composer while the plan has something to show: how far it has got (PlanPane.svelte `planProgress`).
    private func syncPlan() {
        guard let plan = hub.plans.plans[sessionId], plan.shows else {
            composerBinding.ring = nil
            return
        }
        planRing.configure(done: plan.progress.done, total: plan.progress.total)
        // Pressed while the plan is on show: in its sheet on a compact width, on the side's front beside the transcript.
        planRing.open = planSheet != nil || (beside != nil && beside === planSide)
        composerBinding.ring = planRing
        #if DEBUG
        if PreviewProbe.openPlanAtLaunch, !planOpenedAtLaunch, view.window != nil {
            planOpenedAtLaunch = true
            openPlan()
        }
        #endif
    }

    #if DEBUG
    private var planOpenedAtLaunch = false
    #endif

    /// The plan whole: beside the transcript on a regular width, on the
    /// side's front (SideSplit.svelte `openPlan`); on a compact one, in the
    /// house sheet (PlanPane.svelte in SideSplit's sheet).
    private func openPlan() {
        if traitCollection.horizontalSizeClass == .regular {
            planAsked = true
            sideTab = .plan
            syncSide()
            syncPlan()
            #if DEBUG
            PreviewProbe.say("plan opened \(sessionId) beside")
            #endif
            return
        }
        let sheet = PlanSheetController(hub: hub, instanceId: sessionId)
        let house = HouseSheetController(sheet, title: PlanSheetController.title(hub.plans.plans[sessionId]), scroller: sheet.scroll)
        planSheet = house
        present(house, animated: true) { [weak sheet, sessionId] in
            #if DEBUG
            // The sheet stood: as tall as the plan it holds, up to its cap (never its title alone).
            guard let sheet else { return }
            let box = sheet.view.convert(sheet.view.bounds, to: nil)
            PreviewProbe.say("plan sheet \(sessionId) content=\(Int(box.minY)),\(Int(box.height)) plan=\(Int(sheet.scroll.contentSize.height))")
            #endif
        }
        planRing.open = true
        #if DEBUG
        PreviewProbe.say("plan opened \(sessionId)")
        #endif
    }

    // MARK: The composer's canvas

    /// The column the canvas stands in, in the window: the pane's height, and
    /// across, the transcript's share of it (the composer's group,
    /// ComposerDock `transcriptShare`), never the side preview beside it.
    private func canvasColumn() -> CGRect? {
        guard isViewLoaded, view.window != nil else { return nil }
        let pane = view.convert(view.bounds, to: nil)
        let transcript = transcriptHost.view.convert(transcriptHost.view.bounds, to: nil)
        return CGRect(x: transcript.minX, y: pane.minY, width: transcript.width, height: pane.height)
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
        syncSide()
        // Laid out expanded before it had a window (a relaunch): Esc is the pane's now.
        if expanded { takeKeys() }
    }

    /// Ends the subscription; PaneHost calls it when the tab closes.
    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        hub.plans.unfollow(sessionId)
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
        #if DEBUG
        PreviewProbe.say("transcript clearance=\(Int(clearance)) composer=\(Int(composerInset)) following=\(following)")
        #endif
    }

    // MARK: Model

    override func refreshContent() {
        syncAskAlone()
        transcriptView.configure(transcript)
        let prestart = syncMove()

        composerBinding.continuedIn = continuedIn()
        composerBinding.writable = canSend && !prestart && composerBinding.continuedIn == nil
        let command = sent.flatMap { hub.ledger.commands[$0] }
        let withdrawal = withdrawing.flatMap { hub.ledger.commands[$0] }
        if command?.stage == .submitted || withdrawal?.stage == .submitted || withdrawal?.stage == .accepted {
            composerBinding.action = .sending
        } else {
            composerBinding.action = transcript.tail?.busy == true && canStop ? .stop : .send
        }
        // Only the hub's refusal is a failure: a send it never answered waits on its row.
        composerBinding.sendError = editNote ?? (command?.refusedByHub == true ? Words.Transcript.notSent + (command?.reason.map { " \($0)" } ?? "") : nil)
        composerBinding.sendBlock = sendBlock(hub)
        syncCards()
        syncSide()
        syncPlan()
        composerBinding.publish()
        #if DEBUG
        sendForProbe()
        #endif
    }

    /// The session a continuation took this one's work item on in
    /// (SessionPane.svelte `continuedTo`): this one never runs again, so its
    /// composer's place says where the work went, a link to it.
    private func continuedIn() -> ContinuedIn? {
        // The rows while the board lists them; else its newest page's word.
        if let next = hub.fleet.byId[sessionId]?.session?.continuedInto, let row = hub.fleet.byId[next] {
            let title = Naming.sessionTitle(title: row.title, cwd: row.cwd, id: row.id)
            return ContinuedIn(title: title) { [weak self] in self?.onOpenSession(next) }
        }
        guard let said = transcript.continuedTo else { return nil }
        return ContinuedIn(title: said.title) { [weak self] in self?.onOpenSession(said.instanceId) }
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
        // A row-less ask a session made (a curator run's proposal): the shell
        // moves this tab to that session, whose composer draws it
        // (ShellController `moveToOrigins`). Nothing is read or said here meanwhile.
        if hub.askOrigin(sessionId) != nil {
            transcriptHost.view.isHidden = true
            return
        }
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

    /// What stands beside the conversation (SideSplit.svelte `Shown`): the plan or the preview.
    private enum SideTab { case plan, preview }
    /// The one chosen; on show while it is open, else the newest there is.
    private var sideTab = SideTab.plan
    /// The preview was open at the last sync: one opening now takes the front.
    private var previewWasOpen = false
    /// The switch, while both are open (SideSplit.svelte `switcher`), in the head of the one on show.
    private lazy var sideSwitch: KitSegmented = {
        let made = KitSegmented([Words.Side.plan, Words.Side.preview], selected: 0)
        made.accessibilityLabel = Words.Side.label
        made.addAction(UIAction { [weak self, weak made] _ in
            guard let self, let index = made?.selectedIndex else { return }
            sideTab = index == 0 ? .plan : .preview
            syncSide()
            syncPlan()
        }, for: .valueChanged)
        return made
    }()

    /// What the side holds, as the hub and the reader say (SideSplit.svelte
    /// `opened`, `shown`): the preview while the hub has it open, beside the
    /// transcript on a regular width (the web's split) or in a drawer above
    /// the composer on a compact one (its phone sheet); the plan beside the
    /// transcript while asked for and it has something to show (on a compact
    /// width it is the house sheet, `openPlan`). Both open, the switch stands
    /// in the head of the one on show; closed, each goes.
    private func syncSide() {
        let frame = hub.previews.byInstance[sessionId]
        // The artifact on show, and what its page has said of itself since (its title, its picture): the cards draw both.
        let page = frame.flatMap(hub.previews.page)
        let key = frame?.state == .open ? frame.flatMap(PreviewKey.of).map { "\($0)|\(page?.title ?? "")|\(page?.thumbnail?.light?.count ?? 0)|\(page?.thumbnail?.dark?.count ?? 0)" } : nil
        if key != drawnPreview {
            drawnPreview = key
            // The transcript's cards stand at full presence for the page now shown.
            transcriptView.previewChanged()
        }
        let previewOpen = frame?.state == .open
        // An agent showing a preview brings it to the front.
        if previewOpen, !previewWasOpen { sideTab = .preview }
        previewWasOpen = previewOpen
        let regular = traitCollection.horizontalSizeClass == .regular
        let planOpen = regular && planAsked && hub.plans.plans[sessionId]?.shows == true
        let opened = (planOpen ? [SideTab.plan] : []) + (previewOpen ? [.preview] : [])
        let shown = opened.contains(sideTab) ? sideTab : opened.last
        // Closing the last of them ends the expansion: what opens next opens
        // beside the conversation. Only a close counts: before the hub's
        // first word after a launch there was nothing to close.
        let closing = (preview != nil || planSide != nil) && shown == nil
        if !previewOpen { removePreview() }
        if !planOpen, let planSide {
            self.planSide = nil
            if planSide.parent === self { unembed(planSide) }
        }
        if closing, expandAsked { keepExpanded(false) }
        #if DEBUG
        probeSide(shown: shown, opened: opened, regular: regular)
        #endif
        guard let shown else { return }
        let card: SideCard = shown == .plan ? (planSide ?? makePlanSide()) : (preview ?? makePreview())
        let asDrawer = shown == .preview && !regular
        for other in [preview as SideCard?, planSide as SideCard?].compactMap(\.self)
            where other !== card && other.parent === self {
            unembed(other)
        }
        if card.parent === self, drawer != asDrawer {
            unembed(card)
        }
        if card.parent !== self {
            embed(card, drawer: asDrawer)
        }
        if opened.count > 1 {
            sideSwitch.select(shown == .plan ? 0 : 1, animated: false)
            card.showSwitcher(sideSwitch)
        } else {
            card.showSwitcher(nil)
        }
        preview?.show()
    }

    #if DEBUG
    private var probedSide = ""
    private var sideSwitched = false

    /// What the side holds as a simulator pass reads it, logged when it
    /// changed; with `-side-switch`, the switch pressed once both stand there.
    private func probeSide(shown: SideTab?, opened: [SideTab], regular: Bool) {
        guard PreviewProbe.on else { return }
        let line = "side \(sessionId) shown=\(shown.map { "\($0)" } ?? "none") opened=\(opened.map { "\($0)" }.joined(separator: ",")) regular=\(regular)"
        if line != probedSide {
            probedSide = line
            PreviewProbe.say(line)
        }
        guard PreviewProbe.sideSwitch, opened.count > 1, !sideSwitched, let shown else { return }
        sideSwitched = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.sideSwitch.choose(shown == .plan ? 1 : 0)
        }
    }
    #endif

    private func makePlanSide() -> PlanSideController {
        let controller = PlanSideController(hub: hub, instanceId: sessionId)
        controller.onClose = { [weak self] in
            guard let self else { return }
            planAsked = false
            syncSide()
            syncPlan()
        }
        planSide = controller
        return controller
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
        // unless the plan or the preview stands beside the transcript.
        var share: CGFloat = 1
        if let beside, beside.parent === self, view.bounds.width > 0 {
            share = min(1, max(0, (beside.view.frame.minX - Space.space2) / view.bounds.width))
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
        controller.standsInFront(inFront)
        // Open in new tab: the artifact in a tab of its own, beside this one.
        controller.onOpenTab = { [weak self] id in self?.onOpenSession(ArtifactTabs.tabId(id)) }
        // Undock, or Done while docked: this conversation's composer takes the canvas, out of where the panel draws it.
        controller.onGiveBack = { [weak self] id, name, folded in
            guard let self else { return }
            composerBinding.takeBack(canvas: id, name: name, folded: folded, from: canvasPanel(showing: id)?.shown)
        }
        preview = controller
        return controller
    }

    /// This conversation is the tab in front of its group: behind, or parked
    /// a swipe aside, its preview lets its page go until it comes forward.
    private var inFront = true

    func standsInFront(_ front: Bool) {
        inFront = front
        preview?.standsInFront(front)
    }

    /// The web's wide layout: the preview beside the transcript, its share of
    /// the pane's width, never under its 320pt floor. On a compact width the
    /// phone's drawer (PreviewSheet): over the transcript, its floor the top
    /// of the composer, so the conversation's composer stays there to write
    /// and send in; 60% of the room above the composer, or all of it.
    private func embed(_ card: SideCard, drawer: Bool) {
        addChild(card)
        card.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card.view)
        card.view.layer.cornerRadius = Radius.radiusLg
        card.view.layer.cornerCurve = .continuous
        card.view.boxShadow = Shadow.shadowDrawer
        self.drawer = drawer
        (card as? PreviewController)?.standsAsDrawer(drawer)
        if drawer, let controller = card as? PreviewController {
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
            previewLeading: card.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewTrailing: card.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewTop: card.view.topAnchor.constraint(equalTo: view.topAnchor),
            previewBottom: card.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            dividerCentre: divider.centerXAnchor.constraint(equalTo: view.leadingAnchor),
            dividerWidth: divider.widthAnchor.constraint(equalToConstant: Size.cSideDividerHit)
        )
        self.split = split
        beside = card
        NSLayoutConstraint.activate(split.all + [
            divider.topAnchor.constraint(equalTo: card.view.topAnchor),
            divider.bottomAnchor.constraint(equalTo: card.view.bottomAnchor),
        ])
        divider.onDrag = { [weak self] pan in self?.dragSplit(pan) }
        divider.onStep = { [weak self] step in self?.stepSplit(step) }
        card.onExpand = { [weak self] in self?.toggleExpanded() }
        card.onEscapeLeft = { [weak self] in self?.collapse() }
        applySplit(sliding: false)
        card.didMove(toParent: self)
    }

    private func unembed(_ card: SideCard) {
        card.willMove(toParent: nil)
        card.view.removeFromSuperview()
        card.removeFromParent()
        if beside === card { beside = nil }
        card.showSwitcher(nil)
        // The drawer's handles go with it: an embed beside the transcript has none.
        if let controller = card as? PreviewController {
            for handle in [controller.dragArea!, controller.grabArea] as [UIView] {
                handle.gestureRecognizers?.filter { $0 is UIPanGestureRecognizer }.forEach(handle.removeGestureRecognizer)
            }
            controller.grabArea.removeTarget(self, action: #selector(cycleDrawer), for: .primaryActionTriggered)
        }
        drawerSettle?.stopAnimation(true)
        drawerSettle = nil
        drawerLeaving = false
        card.view.transform = .identity
        drawerHeight = nil
        drawerFloor = nil
        if let split {
            // The split goes with the preview: the transcript has the whole pane again.
            slide?.stopAnimation(true)
            slide = nil
            NSLayoutConstraint.deactivate(split.all)
            self.split = nil
            divider.removeFromSuperview()
            card.onExpand = {}
            card.onEscapeLeft = {}
            card.standsExpanded(false)
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

    /// The card beside the transcript: nil in the phone's drawer or with nothing beside.
    private var split: Split?
    /// What stands in the split: the plan or the preview.
    private weak var beside: SideCard?
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
        guard let card = beside, split != nil else { return }
        let whole = expanded
        slide?.stopAnimation(true)
        slide = nil
        divider.expanded = whole
        putTranscript(away: whole)
        // The card's shadow would fall outside the pane once it meets the edges.
        card.view.boxShadow = whole ? [] : Shadow.shadowDrawer
        placeSplit()
        if whole {
            takeKeys()
        } else if isFirstResponder {
            resignFirstResponder()
        }
        let lay = { [self] in
            card.standsExpanded(whole)
            card.view.layer.cornerRadius = whole ? 0 : Radius.radiusLg
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
    // A question card standing, it takes the keyboard too, for the card's keys.
    override var canBecomeFirstResponder: Bool { expanded || composerBinding.standsQuestion }

    /// A question card standing and nothing holding the keyboard: the pane
    /// takes it, so the card's digits and Return reach it (UIKit gathers key
    /// commands from the first responder up, WWDC20 10109).
    private func claimCardKeys() {
        guard composerBinding.standsQuestion, view.window != nil, !isFirstResponder,
              UIResponder.current == nil else { return }
        becomeFirstResponder()
    }

    private func takeKeys() {
        guard view.window != nil, beside?.holdsKeys != true, !isFirstResponder else { return }
        becomeFirstResponder()
    }

    /// Esc, expanded: the preview's open pin card first, then its Comment mode, then the conversation comes back.
    @objc private func escapeKey() {
        if beside?.escape() == true { return }
        collapse()
    }

    #if DEBUG
    private var probedSplit = ""

    /// The split as a simulator pass reads it, logged when it moved: the
    /// pane's bounds, the preview's frame, the transcript's width, the kept
    /// and shown shares, the state, and the composer's share.
    private func probeSplit() {
        guard PreviewProbe.on, let card = beside, split != nil, view.window != nil else { return }
        let width = view.bounds.width
        let side = (card as? PreviewController)?.probeExpand ?? "card=plan"
        let line = "split pane=\(Self.probeRect(view.bounds)) preview=\(Self.probeRect(card.view.frame)) transcript=\(Int(transcriptHost.view.frame.width.rounded())) divider=\(Int(divider.center.x.rounded())),\(Int(divider.bounds.width.rounded())) kept=\(String(format: "%.3f", sideShare)) shown=\(String(format: "%.3f", shownShare(width))) expanded=\(expanded) away=\(!transcriptHost.view.isUserInteractionEnabled) composerShare=\(String(format: "%.3f", transcriptShare)) keys=\(isFirstResponder) \(side) dividerAt=\(PreviewProbe.centre(divider))"
        guard line != probedSplit else { return }
        probedSplit = line
        PreviewProbe.say(line)
    }

    /// `-split-scrub`: a slide is held still and read at 0, 50 and 100% of
    /// its clock (the pane's layer at `speed` 0, `timeOffset` stepped from the
    /// slide's begin), then let go.
    private func scrubSlide() {
        guard PreviewProbe.on, ProcessInfo.processInfo.arguments.contains("-split-scrub"), let beside else { return }
        CATransaction.flush()
        let pane = view.layer
        let card = beside.view.layer
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
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.horizontalSizeClass != traitCollection.horizontalSizeClass { syncSide() }
    }

    /// The asks this conversation made: its own in arrival order, then those
    /// parked elsewhere that it made (a memory curator run's proposal, on
    /// machine "hub"; SessionPane.svelte `parked`).
    private var madeAsks: [ParkedAsk] { (hub.needs.parked[sessionId] ?? []) + hub.needs.madeIn(sessionId) }

    /// The asks this conversation made as the composer's cards: a card that
    /// comes in while the session is on screen settles in, and one the hub
    /// has settled leaves. Each is answered on the machine its envelope
    /// named, so one no session row stands behind answers too.
    /// One ask at a time (SessionPane.svelte `firstAsk`): the first waiting
    /// stands on the composer, "N of M" in its head, the rest counted; the
    /// next moves in as it is answered.
    private func syncCards() {
        let parked = madeAsks
        let place = askRun.place(first: parked.first?.requestId, more: max(0, parked.count - 1))
        let standing = parked.prefix(1)
        let ids = Set(standing.map(\.requestId))
        for id in cards.keys where !ids.contains(id) { cards[id] = nil }
        var ordered: [UIView] = []
        for ask in standing {
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
            if let place { card.setPlace(at: place.at, of: place.of, more: place.more) }
            #if DEBUG
            let said = "\(ask.requestId) on \(ask.machineId): \(card.probeState) place \(card.probePlace)"
            if probeCards[ask.requestId] != said {
                probeCards[ask.requestId] = said
                Self.restoring.notice("probe card \(said, privacy: .public)")
            }
            #endif
            ordered.append(card)
        }
        // The quiet one: "make this a project", standing beside the parked asks (SessionPane.svelte `offer`).
        let offer = hub.offers.offers[sessionId]
        let joined = hub.offers.joins[sessionId]
        if offer != nil || joined != nil {
            let card = offerCard ?? {
                let made = ProjectOfferCard(hub: hub, instanceId: sessionId, arriving: shownOnce && composerBinding.composer != nil)
                made.onHeight = { [weak self] in self?.composerBinding.composer?.onHeight() }
                made.onSetupThread = { [weak self] id in self?.onOpenSession(ThreadTabs.tabId(id)) }
                made.onOpenProject = { [weak self] id in self?.onOpenProject(id) }
                offerCard = made
                return made
            }()
            card.show(offer: offer, joined: joined)
            ordered.append(card)
        } else {
            offerCard = nil
        }
        composerBinding.prompts = ordered
        claimCardKeys()
    }

    #if DEBUG
    private static let probeLog = Logger(subsystem: "dev.cawco.app", category: "Probe")

    /// `-probe-send <words>`: once this pane can send, its Send sends `words`
    /// with one picture of about 2 MB (noise, which does not compress), once
    /// per launch, for a simulator pass (probe-kit spec `ios-send-outbox`).
    private static let probeSendWords: String? = {
        let args = ProcessInfo.processInfo.arguments
        return args.firstIndex(of: "-probe-send").flatMap { args.indices.contains($0 + 1) ? args[$0 + 1] : nil }
    }()
    private static var probeSent = false

    private func sendForProbe() {
        guard let words = Self.probeSendWords, !Self.probeSent, canSend else { return }
        Self.probeSent = true
        var noise = [UInt8](repeating: 0, count: 720 * 720 * 4)
        for at in noise.indices { noise[at] = .random(in: 0 ... 255) }
        let png = noise.withUnsafeMutableBytes { bytes -> Data in
            let context = CGContext(data: bytes.baseAddress, width: 720, height: 720, bitsPerComponent: 8,
                                    bytesPerRow: 720 * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
            return context?.makeImage().flatMap { UIImage(cgImage: $0).pngData() } ?? Data()
        }
        Self.probeLog.notice("probe send: \(words, privacy: .public) with a picture of \(png.count) bytes")
        send(words, [.image(name: "probe.png", mediaType: "image/png", data: png)])
    }
    #endif

    /// Where the standing ask is among the ones answered here and still waiting.
    private var askRun = AskRun()

    #if DEBUG
    /// What each card last said to a simulator pass's log.
    private var probeCards: [String: String] = [:]

    /// The asks this pane draws as its card, one at a time, by request id, in their order.
    var probeAsks: [String] { madeAsks.map(\.requestId) }

    /// A card's Approve (or Deny), as its button answers it.
    func probeAnswer(_ requestId: String, allow: Bool) {
        guard let ask = madeAsks.first(where: { $0.requestId == requestId }) else { return }
        answer(ask, allow ? .allow : .deny, [:])
    }
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

    func focusComposer() { composerBinding.focus() }
    /// Composer.svelte's rule: a conversation on the board takes a message
    /// whatever its status, while the hub is there. The hub wakes a sleeping
    /// or stopped session to read it (server.ts `deliverSend`).
    var canSend: Bool { hub.state == .connected && hub.fleet.byId[sessionId]?.isListed == true }
    /// Stop has a turn to end only in a live session (Composer.svelte `busy`).
    var canStop: Bool { hub.state == .connected && hub.fleet.byId[sessionId]?.isLive == true }

    /// The first permission this conversation made, for the menu bar's Approve and Deny.
    private var pendingAsk: ParkedAsk? { madeAsks.first { !$0.isQuestion } }
    var answerTarget: ParkedAsk? {
        guard hub.state == .connected, let ask = pendingAsk else { return nil }
        let sent = hub.needs.answerSent(for: ask)
        return sent == nil || sent?.stage == .failed ? ask : nil
    }

    func stopTurn() {
        guard canStop, let row = hub.fleet.byId[sessionId]?.session else { return }
        sent = hub.sessions.stop(row)
        requestRefresh()
    }

    private func send(_ words: String, _ attachments: [ComposerAttachment]) {
        guard canSend, let row = hub.fleet.byId[sessionId]?.session else { return }
        editNote = nil
        // The composer sends nothing while a pick is being read or a file is not on the hub.
        guard let carried = ComposerAttacher.carried(attachments) else { return }
        // Kept with all it carries from here (`SendOutbox`): the field is free at once.
        sent = hub.sessions.steer(row, text: words, images: carried.images, texts: carried.texts, files: carried.files)
        composerBinding.sent()
        requestRefresh()
    }

    // MARK: A queued message

    /// The harness the session runs.
    private var harness: String? {
        hub.fleet.byId[sessionId]?.harness?.rawValue ?? transcript.facts?.harness ?? transcript.location?.harness.rawValue
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
        guard let row = hub.fleet.byId[sessionId]?.session, canWithdraw(id) else {
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
                guard let url = mediaURL(image.src), let fetched = try? await URLSession.shared.data(for: .hub(url)) else {
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
                // Kept like any send (`SendOutbox`): with no hub to take it now, it goes once one is back.
                sent = hub.sessions.steer(row, text: text, images: images, texts: texts, files: files, replaces: id)
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

    // MARK: Keys

    override var keyCommands: [UIKeyCommand]? {
        var keys = [UIKeyCommand(title: "Stop", action: #selector(stopKey), input: ".", modifierFlags: .command),
                    UIKeyCommand(title: "Steer", action: #selector(steerKey), input: "l", modifierFlags: .command)]
        // The question card's digits and Return, unless a field or the preview's page holds the keyboard: what is typed in keeps its keys.
        if !UIResponder.isTyping, !PreviewKeys.pageHolds { keys += composerBinding.cardKeys(#selector(cardKey(_:))) }
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
    @objc private func cardKey(_ command: UIKeyCommand) { composerBinding.cardKey(command) }

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
