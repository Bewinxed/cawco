import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import CawCoTranscript
import OSLog
import UIKit

/// A thread with a project's Caw, as a session tab (ThreadPane.svelte): the
/// thread's messages shaped into the transcript's session, so the real
/// transcript draws them, and the group's one composer lent to it. Your
/// words are your turns, Caw's are his, his face on the speaker line, the
/// tasks they are about as cards and the files he wrote as chips under
/// them; what woke him is a code line. His question, and every ask made in
/// this thread, stands on the composer as its card; answered, it is drawn
/// as its settled question row; withdrawn, a quiet line says so.
///
/// Caw sits on the composer: his ledge peek over the pill's top-leading
/// corner, playing the thread's status, and his plan's ring at the row's
/// other end. On or off, your words start him; only when he cannot start
/// (no machine for him) does the composer give way to a line that says why.
///
/// What you write goes to the thread through the hub's thread route, never
/// to his session. `thread:new:<project>` is a thread not yet started: its
/// first message makes it, and the tab is re-addressed to the thread the
/// hub made.
final class ThreadViewController: ObservedViewController, ComposerPane {
    private(set) var viewId: String
    private let hub: HubConnection
    private var threadId: String?
    /// The thread's project: the hub's word on the thread, which a tab
    /// opened at launch may be built before (a push, a restore); a new
    /// thread's is in its id.
    private var projectId: String {
        threadId.flatMap { hub.threads.byId[$0]?.projectId } ?? ThreadTabs.newProject(of: viewId) ?? ""
    }
    private let transcriptView = TranscriptView()
    private let transcriptHost = UIViewController()
    let composerBinding: SessionComposerBinding
    private var transcript: SessionTranscript
    private var cards: [String: PromptCardView] = [:]
    private var shownOnce = false
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Thread")

    /// A conversation's own back or close: its tab closes.
    var onReturnToFleet: () -> Void = {}
    var onOpenSession: (String) -> Void = { _ in }
    /// A task card's tap: its sheet over its project's page.
    var onOpenTask: (_ projectId: String, _ taskId: String) -> Void = { _, _ in }
    /// "Open the board": the project's page.
    var onOpenProject: (String) -> Void = { _ in }
    /// "Check machines": the machines card.
    var onCheckMachines: (UIView) -> Void = { _ in }
    /// A new thread's first message made it: its tab is re-addressed.
    var onRetarget: (_ from: String, _ to: String) -> Void = { _, _ in }
    /// Whether it takes a composer changed (Caw can or cannot start now).
    var onComposes: () -> Void = {}
    var onTranscriptShare: () -> Void = {}
    /// A thread has no side preview: its transcript holds the whole width.
    let transcriptShare: CGFloat = 1

    /// How far up from the pane's foot the group's composer reaches.
    var composerInset: CGFloat = 0 {
        didSet {
            guard abs(composerInset - oldValue) > 0.5 else { return }
            clearComposer()
        }
    }

    init(hub: HubConnection, id: String) {
        self.hub = hub
        viewId = id
        threadId = ThreadTabs.threadId(of: id)
        transcript = threadId.map(hub.threads.transcript) ?? hub.threads.blank(ThreadTabs.newProject(of: id) ?? "")
        composerBinding = SessionComposerBinding(sessionId: id)
        seat = CawView(status: .ready, ledge: .peek)
        super.init(nibName: nil, bundle: nil)
        composerBinding.agentName = "Caw"
        composerBinding.placeholder = "Message the project…"
        composerBinding.delegates = false
        composerBinding.attachMenu = nil
        composerBinding.perch = seatBox
        composerBinding.onSend = { [weak self] words, _ in self?.send(words) }
        composerBinding.onStop = { [weak self] in self?.stopTurn() }
        composerBinding.recall = { [weak self] in self?.recall() ?? [] }
        planRing.addAction(UIAction { [weak self] _ in self?.openPlan() }, for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ThreadViewController is built in code") }

    /// The thread as the hub has it now, when it has been started.
    private var thread: ThreadSummary? { threadId.flatMap { hub.threads.byId[$0] } }

    // MARK: The pane

    private let veil = UIStackView()
    private let problem = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private let off = UIView()
    private let offWords = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private var offAction: UIButton?

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
        view.hold(transcriptHost.view)
        transcriptHost.didMove(toParent: self)
        transcriptHost.view.hold(transcriptView)

        // The rows still on their way: the skeleton stands in for them and
        // goes the moment they are drawn (TranscriptSkeleton).
        veil.axis = .vertical
        veil.spacing = Space.space4
        veil.isLayoutMarginsRelativeArrangement = true
        veil.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space6, leading: Space.space5, bottom: 0, trailing: Space.space5)
        veil.translatesAutoresizingMaskIntoConstraints = false
        veil.backgroundColor = Palette.surfaceRecess
        for width in [0.42, 0.9, 0.76, 0.34, 0.85] {
            let bar = SkeletonView(height: TypeScale.textBody * TypeScale.leadingBody)
            let row = UIView()
            row.addSubview(bar)
            bar.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: row.leadingAnchor), bar.topAnchor.constraint(equalTo: row.topAnchor),
                bar.bottomAnchor.constraint(equalTo: row.bottomAnchor), bar.widthAnchor.constraint(equalTo: row.widthAnchor, multiplier: width),
            ])
            veil.addArrangedSubview(row)
        }
        view.addSubview(veil)
        NSLayoutConstraint.activate([
            veil.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            veil.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            veil.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        // The thread could not be read: said where it would stand (`.problem`).
        problem.wrap = .pretty
        problem.textAlignment = .center
        problem.isHidden = true
        problem.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(problem)
        NSLayoutConstraint.activate([
            problem.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            problem.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            problem.widthAnchor.constraint(lessThanOrEqualToConstant: 46 * 8),
            problem.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: Space.space6),
        ])

        // Where the composer stands when there is one (`.off`): why Caw
        // cannot start, and the one thing that changes it.
        off.backgroundColor = Palette.surfaceRaised
        off.layer.cornerRadius = Radius.radiusLg
        off.layer.cornerCurve = .continuous
        off.layer.borderWidth = 1
        off.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: Self, _) in
            self.off.layer.borderColor = Palette.borderControl.resolvedColor(with: self.traitCollection).cgColor
        }
        off.boxShadow = Shadow.shadowTile
        off.isHidden = true
        off.translatesAutoresizingMaskIntoConstraints = false
        offWords.wrap = .pretty
        offWords.accessibilityTraits = .staticText
        let check = KitButton.make("Check machines", variant: .outline, height: .sm) { [weak self] in
            guard let self, let button = offAction else { return }
            onCheckMachines(button)
        }
        offAction = check
        let line = UIStackView(arrangedSubviews: [offWords, check])
        line.spacing = Space.space3
        line.alignment = .center
        check.setContentHuggingPriority(.required, for: .horizontal)
        check.setContentCompressionResistancePriority(.required, for: .horizontal)
        off.hold(line, insets: UIEdgeInsets(top: Space.space3, left: Space.space4, bottom: Space.space3, right: Space.space3))
        view.addSubview(off)
        NSLayoutConstraint.activate([
            off.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: Space.space3),
            off.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -Space.space3),
            off.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Space.space2),
        ])
        placeSeat()
        clearComposer()
        Self.log.notice("thread screen \(self.viewId, privacy: .public) loaded")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        requestRefresh()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        shownOnce = true
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        clearComposer()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        placeSeat()
    }

    /// The tab closed: the plan it followed, and his session it watched, are let go.
    func close() {
        if let followed { hub.plans.unfollow(followed) }
        followed = nil
        if let hearingLead { hub.sessions.unwatchDelegate(hearingLead) }
        hearingLead = nil
    }

    var restorationValues: [String: Any] { ["draft": composerBinding.draft] }

    func restoreValues(_ values: [AnyHashable: Any]) {
        if let draft = values["draft"] as? String { composerBinding.setDraft(draft) }
    }

    func focusComposer() { composerBinding.focus() }

    /// The transcript's last line stands a step above the composer, or above
    /// the line that stands in its place.
    private func clearComposer() {
        guard isViewLoaded else { return }
        let reach = writable ? composerInset : (off.isHidden ? 0 : off.bounds.height + Space.space2 + view.safeAreaInsets.bottom)
        let clearance = max(0, reach - view.safeAreaInsets.bottom) + Space.space3
        guard abs(transcriptHost.additionalSafeAreaInsets.bottom - clearance) > 0.5 else { return }
        let following = transcriptView.restorationPosition.following
        transcriptHost.additionalSafeAreaInsets.bottom = clearance
        transcriptHost.view.layoutIfNeeded()
        if following { transcriptView.latest() }
    }

    // MARK: Model

    /// The hub's view of Caw, once read (`cawOf`).
    private var caw: CawLeadView?
    /// What his view was last read on: the connection and the thread's status.
    private var cawReadOn = ""
    private var readProblem: String?
    private var readAsked = false
    /// You can write to Caw, on or off: your words start him. Only a reason
    /// he cannot start (no machine for him) takes the composer away.
    private var writable: Bool { caw != nil && caw?.problem == nil }
    private var composing = false
    /// The group's composer writes here: Caw can start.
    var composes: Bool { writable }

    override func refreshContent() {
        let connected = hub.state == .connected
        let status = thread?.status
        // The thread is read whole on each connection; frames keep it from then on.
        if !connected { readAsked = false }
        if connected, !readAsked, let threadId, !projectId.isEmpty {
            readAsked = true
            read(threadId)
        }
        // A thread's status moves with the lead; his view is read again with it.
        let on = "\(connected)|\(status?.rawValue ?? "")|\(projectId)"
        if connected, !projectId.isEmpty, on != cawReadOn {
            cawReadOn = on
            readCaw()
        }
        transcriptView.voice = TranscriptVoice(name: "Caw", extras: threadId.map(hub.threads.extras) ?? [:], revision: tasksRead + wakesDrawn) { [weak self] extras, blockId in
            self?.accessory(extras, blockId: blockId)
        }
        transcriptView.configure(transcript)
        _ = transcript.blockRevision

        let veiled = transcript.loading && readProblem == nil
        veil.isHidden = !veiled
        problem.text = readProblem.map { "The thread could not be read: \($0)" }
        problem.isHidden = readProblem == nil
        transcriptHost.view.isHidden = readProblem != nil

        // The seat plays the thread's status.
        seat.status = switch status {
        case .working: .working
        case .needsYou: .needsYou
        default: .ready
        }

        // Why Caw cannot start, where the composer would stand.
        let cannot = caw?.problem
        offWords.text = cannot
        offAction?.isHidden = !(cannot != nil && hub.fleet.machines.allSatisfy { $0.status != "online" })
        if off.isHidden != (cannot == nil) { off.isHidden = cannot == nil }

        follow(caw?.leadInstanceId)
        hear()
        syncPlan()
        syncTasks()

        composerBinding.writable = connected && writable
        composerBinding.action = sending ? .sending : (status == .working ? .stop : .send)
        composerBinding.sendError = sendError
        composerBinding.sendBlock = sendBlock(hub)
        syncCards()
        composerBinding.publish()
        if composing != writable {
            composing = writable
            onComposes()
        }
        clearComposer()
        #if DEBUG
        probe()
        #endif
    }

    private func read(_ threadId: String) {
        Task { [weak self, hub, projectId] in
            do {
                try await hub.threads.read(projectId: projectId, threadId: threadId)
                self?.readProblem = nil
            } catch {
                self?.readProblem = ThreadsStore.failureWords(error)
                Self.log.error("thread \(threadId, privacy: .public) unreadable: \(error.localizedDescription, privacy: .public)")
            }
            self?.requestRefresh()
        }
    }

    private func readCaw() {
        guard !projectId.isEmpty else { return }
        Task { [weak self, hub, projectId] in
            guard let read = try? await hub.threads.caw(projectId) else { return }
            self?.caw = read
            self?.requestRefresh()
        }
    }

    // MARK: Caw, the lead

    /// His still box on the composer: 56pt at a desk, 48pt on a phone.
    private var seatSize: CGFloat { (view.window?.bounds.width ?? view.bounds.width) < 900 ? 48 : 56 }
    private let seat: CawView
    /// The seat's box: his width, and the part of him above the ledge line.
    private lazy var seatBox: UIView = {
        let box = UIView()
        box.isUserInteractionEnabled = false
        box.isAccessibilityElement = false
        seat.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(seat)
        seatWidth = box.widthAnchor.constraint(equalToConstant: 48)
        seatHeight = box.heightAnchor.constraint(equalToConstant: 48 * CawView.ledgeLine)
        NSLayoutConstraint.activate([
            seatWidth, seatHeight,
            seat.leadingAnchor.constraint(equalTo: box.leadingAnchor), seat.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            seat.topAnchor.constraint(equalTo: box.topAnchor), seat.bottomAnchor.constraint(equalTo: box.bottomAnchor),
        ])
        return box
    }()
    private var seatWidth: NSLayoutConstraint!
    private var seatHeight: NSLayoutConstraint!

    private func placeSeat() {
        _ = seatBox
        let side = seatSize
        guard abs(seatWidth.constant - side) > 0.5 else { return }
        seatWidth.constant = side
        seatHeight.constant = side * CawView.ledgeLine
        composerBinding.composer?.onHeight()
    }

    // MARK: His plan, the thread's

    /// The lead's session, whose plan is the thread's (it is no tab here, so it is followed alone).
    private var followed: String?
    private let planRing = PlanRingButton()

    private func follow(_ lead: String?) {
        guard lead != followed else { return }
        if let followed { hub.plans.unfollow(followed) }
        followed = lead
        if let lead { hub.plans.follow(lead) }
    }

    // MARK: His words as he writes them

    /// His session, watched while his turn answers your words here (the
    /// thread's `hearing`): it is no tab of this app's (ThreadPane.svelte
    /// `hearingLead`).
    private var hearingLead: String?

    private func hear() {
        let lead = thread?.hearing?.instanceId
        if lead != hearingLead {
            if let hearingLead { hub.sessions.unwatchDelegate(hearingLead) }
            hearingLead = lead
            if let lead { hub.sessions.watchDelegate(lead) }
        }
        if let threadId { hub.threads.hear(threadId) }
    }

    private func syncPlan() {
        let plan = followed.flatMap { hub.plans.plans[$0] }
        if let plan, plan.shows {
            planRing.configure(done: plan.done, total: plan.steps.count)
            composerBinding.ring = planRing
        } else {
            composerBinding.ring = nil
        }
    }

    private func openPlan() {
        guard let lead = followed else { return }
        let sheet = PlanSheetController(hub: hub, instanceId: lead)
        present(HouseSheetController(sheet, title: "Plan", scroller: sheet.scroll), animated: true)
    }

    // MARK: His asks, on the composer

    /// Every ask made in this thread, oldest first: his questions, a project
    /// setting, a memory proposal he asked about, wherever the hub parked
    /// it, each answered on the machine its envelope named.
    private func syncCards() {
        let asks = threadId.map { id in
            hub.needs.parked.values.joined().filter { $0.threadId == id }
                .sorted { ($0.raisedAt ?? .infinity, $0.requestId) < ($1.raisedAt ?? .infinity, $1.requestId) }
        } ?? []
        // One at a time (ThreadPane.svelte `firstAsk`): the first stands, "N of M", the rest counted.
        let place = askRun.place(first: asks.first?.requestId, more: max(0, asks.count - 1))
        let standing = asks.prefix(1)
        let ids = Set(standing.map(\.requestId))
        for id in cards.keys where !ids.contains(id) { cards[id] = nil }
        var ordered: [UIView] = []
        for ask in standing {
            let card = cards[ask.requestId] ?? {
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
            // The session pane's card line, for the same simulator passes (memory-proposal).
            let said = "\(ask.requestId) on \(ask.machineId): \(card.probeState) place \(card.probePlace)"
            if probeCards[ask.requestId] != said {
                probeCards[ask.requestId] = said
                Self.cards.notice("probe card \(said, privacy: .public)")
            }
            #endif
            ordered.append(card)
        }
        composerBinding.prompts = ordered
        claimCardKeys()
    }

    // A question card standing, the pane may take the keyboard, for the card's keys.
    override var canBecomeFirstResponder: Bool { composerBinding.standsQuestion }

    /// A question card standing and nothing holding the keyboard: the pane
    /// takes it, so the card's digits and Return reach it (UIKit gathers key
    /// commands from the first responder up, WWDC20 10109).
    private func claimCardKeys() {
        guard composerBinding.standsQuestion, view.window != nil, !isFirstResponder,
              UIResponder.current == nil else { return }
        becomeFirstResponder()
    }

    /// Where the standing ask is among the ones answered here and still waiting.
    private var askRun = AskRun()

    /// His question card owns the digits and Return, as a session's does,
    /// unless a field or a preview's page holds the keyboard: what is typed in keeps its keys.
    override var keyCommands: [UIKeyCommand]? {
        UIResponder.isTyping || PreviewKeys.pageHolds ? [] : composerBinding.cardKeys(#selector(cardKey(_:)))
    }

    @objc private func cardKey(_ command: UIKeyCommand) { composerBinding.cardKey(command) }

    #if DEBUG
    /// What each card last said to a simulator pass's log.
    private var probeCards: [String: String] = [:]
    private static let cards = Logger(subsystem: "dev.cawco.app", category: "Restore")
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
        Self.log.notice("thread \(self.threadId ?? "new", privacy: .public) ask \(ask.requestId, privacy: .public) answered: \(String(describing: choice), privacy: .public) \(picks.description, privacy: .public)")
        requestRefresh()
    }

    // MARK: The tasks his replies are about

    private var tasks: [TaskSummary] = []
    private var tasksReadOn = ""
    /// Each read of the tasks that landed: the cards under his replies are drawn again.
    private var tasksRead = 0

    private func syncTasks() {
        let named = (threadId.flatMap { hub.threads.messages[$0] } ?? []).filter { !$0.tasks.isEmpty }
        guard !named.isEmpty, !projectId.isEmpty else { return }
        // Read again when a reply may name new tasks, and when the project's tasks change.
        let on = "\(named.count)|\(hub.tasksChanged[projectId] ?? 0)"
        guard on != tasksReadOn else { return }
        tasksReadOn = on
        Task { [weak self, hub, projectId] in
            guard let list = try? await ProjectTasks(hub: hub, projectId: projectId).list() else { return }
            self?.tasks = list.tasks
            self?.tasksRead += 1
            self?.requestRefresh()
        }
    }

    /// What one of his replies carries: its tasks' cards, its files' chips,
    /// and under the Setup thread's newest reply that names files, the way
    /// to the board (ThreadPane.svelte `taskCards`, `folderFiles`).
    private func accessory(_ extras: ThreadExtras, blockId: String) -> UIView? {
        if let woken = extras.notWoken { return notWoken(woken, note: blockId, again: extras.wakeAgain) }
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = Space.space3
        column.alignment = .fill
        let cards = extras.tasks.compactMap { id in tasks.first { $0.id == id } }.map { task in
            let card = TaskCardView()
            card.configure(task, waitsOn: [])
            card.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                onOpenTask(projectId, task.id)
            }, for: .touchUpInside)
            return card
        }
        if !cards.isEmpty { column.addArrangedSubview(TaskGridView(cards)) }
        if !extras.files.isEmpty {
            let files = FolderFilesView(files: extras.files) { [weak self] path in self?.openFile(path) }
            column.addArrangedSubview(files)
            if blockId == boardAfter {
                let board = KitButton.make("Open the board", variant: .outline, height: .sm) { [weak self] in
                    guard let self else { return }
                    onOpenProject(projectId)
                }
                let row = UIStackView(arrangedSubviews: [board, UIView()])
                column.addArrangedSubview(row)
            }
        }
        return column.arrangedSubviews.isEmpty ? nil : column
    }

    // MARK: Your words he has not read

    /// What Try again last came to, by note: under way, or the refusal.
    private var wakingAgain: [String: String?] = [:] {
        didSet { wakesDrawn += 1 }
    }
    /// Moves with `wakingAgain`: the notes' lines are drawn again.
    private var wakesDrawn = 0

    /// A not-woken note's reason, in the hub's words, and the way on with
    /// the words he has not read where the note still stands for them
    /// (ThreadPane.svelte `eventUnder`, RowFault).
    private func notWoken(_ woken: ThreadNotWoken, note: String, again: Bool) -> UIView {
        let refused = wakingAgain[note] ?? nil
        let reason = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
        reason.text = refused ?? "Caw hasn't read your message: \(woken.words)"
        reason.accessibilityIdentifier = "not-woken-\(woken.reason)"
        let line = UIStackView(arrangedSubviews: [reason])
        line.axis = .vertical
        line.alignment = .leading
        line.spacing = Space.space1
        line.isLayoutMarginsRelativeArrangement = true
        line.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: 0)
        if again {
            let trying = wakingAgain.keys.contains(note) && refused == nil
            let button = KitButton.make(trying ? "Waking Caw…" : "Try again", glyph: .refresh, variant: .ghost, height: .xs) { [weak self] in
                self?.wakeAgain(note)
            }
            button.isEnabled = !trying
            button.accessibilityIdentifier = "wake-again"
            line.addArrangedSubview(button)
        }
        return line
    }

    private func wakeAgain(_ note: String) {
        guard let threadId, !projectId.isEmpty, wakingAgain[note] != .some(nil) else { return }
        wakingAgain[note] = .some(nil)
        requestRefresh()
        Task { [weak self, hub, projectId] in
            do {
                try await hub.threads.wake(projectId: projectId, threadId: threadId, note: note)
                self?.wakingAgain[note] = nil
            } catch {
                self?.wakingAgain[note] = .some(ThreadsStore.failureWords(error))
                Self.log.error("thread \(threadId, privacy: .public) not woken again: \(error.localizedDescription, privacy: .public)")
            }
            self?.requestRefresh()
        }
    }

    /// The Setup thread's newest reply that names files: setup ends there.
    private var boardAfter: String? {
        guard thread?.setup == true, let threadId else { return nil }
        return hub.threads.messages[threadId]?.last { $0.author == .caw && !$0.files.isEmpty }?.id
    }

    /// A file a reply names, read as it is in the project's folder on the hub.
    private func openFile(_ path: String) {
        let sheet = FolderFileController(hub: hub, projectId: projectId, path: path)
        present(HouseSheetController(sheet, title: path, scroller: sheet.scroll), animated: true)
    }

    // MARK: The composer

    private var sending = false
    private var sendError: String?
    /// The words a send got no answer for, and the id they went as
    /// (ThreadPane.svelte `unanswered`): the hub may have kept them, so the
    /// same words sent again go under the same id, which the hub answers with
    /// the message it kept rather than a second one.
    private var unanswered: (words: String, id: String)?

    /// Your words go to the thread as one message (ThreadPane.svelte
    /// `onsubmit`): its row lands them however soon its frame draws it; a
    /// refusal gives them back to the field with why.
    private func send(_ words: String) {
        guard hub.state == .connected, writable, !sending, !projectId.isEmpty else { return }
        let id = unanswered.flatMap { $0.words == words ? $0.id : nil } ?? UUID().uuidString.lowercased()
        sending = true
        sendError = nil
        composerBinding.sent()
        requestRefresh()
        Task { [weak self, hub, projectId, threadId] in
            do {
                let said = try await hub.threads.say(projectId: projectId, threadId: threadId, body: words, id: id)
                self?.unanswered = nil
                if threadId == nil { self?.started(said.id) }
            } catch {
                self?.composerBinding.setDraft(words)
                let unreached = ThreadsStore.unreachable(error)
                self?.unanswered = unreached ? (words, id) : nil
                self?.sendError = unreached ? ThreadsStore.sendUnreached : ThreadsStore.failureWords(error)
                Self.log.error("thread send refused: \(error.localizedDescription, privacy: .public)")
            }
            self?.sending = false
            self?.requestRefresh()
        }
    }

    /// The first message made the thread: the tab is the thread's now.
    private func started(_ threadId: String) {
        let from = viewId
        self.threadId = threadId
        viewId = ThreadTabs.tabId(threadId)
        transcript = hub.threads.transcript(threadId)
        readAsked = true
        onRetarget(from, viewId)
        requestRefresh()
    }

    /// Stop interrupts the lead's turn.
    private func stopTurn() {
        guard let lead = caw?.leadInstanceId, let row = hub.fleet.byId[lead] else { return }
        _ = hub.sessions.stop(row)
    }

    /// What you wrote in this thread, newest first: the recall wheel's.
    private func recall() -> [RecallEntry] {
        guard let threadId else { return [] }
        return (hub.threads.messages[threadId] ?? []).filter { $0.author == .you && !$0.body.isEmpty }.reversed().map {
            RecallEntry(id: $0.id, text: $0.body, date: Date(timeIntervalSince1970: $0.createdAt / 1000), queued: false)
        }
    }

    #if DEBUG
    private var probed = ""

    /// A simulator pass reads the thread here: its messages in order, Caw's
    /// state, and the asks standing on its composer.
    private func probe() {
        guard let threadId else { return }
        let notes = hub.threads.messages[threadId] ?? []
        let said = "probe thread \(threadId) status \(thread?.status.rawValue ?? "?") messages \(notes.count) ["
            + notes.map { "\($0.author):\($0.body.prefix(40).replacingOccurrences(of: "\n", with: " "))" }.joined(separator: " | ")
            + "] asks [\(cards.keys.sorted().joined(separator: ","))] place \(cards.values.first?.probePlace ?? "none") composer \(writable ? "on" : "off")"
        guard said != probed else { return }
        probed = said
        Self.log.notice("\(said, privacy: .public)")
    }
    #endif
}
