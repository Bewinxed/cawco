import CawCoAPI
import CawCoCore
import CawCoDesign
#if DEBUG
import OSLog
#endif
import UIKit

/// A project's views (routes/project/[id]/+page.svelte): the head, then the
/// view strip and the view. Board, Table and Pipeline, then each view kept
/// in `views/`, then each Caw drafted, marked `draft`, with Keep and Discard
/// over it (ProjectViewPane); Needs you is a filter, not a stage — the tasks
/// whose stage is of kind `you`. The tasks are the hub's: the page shows
/// what the hub answered and reads the list again after each of its own
/// writes, whenever the hub says the project's tasks changed, on a
/// reconnect, and when the app comes back (ProjectTaskList). A card or a
/// row, in the board or in a view, opens the task's sheet, the same one a
/// push opens.
final class ProjectViewController: ObservedViewController {
    enum Tab: Hashable {
        case board, table, pipeline
        /// The project's routines, its event sources and approved actions: always there.
        case routines
        /// The project's decision pages, always: an empty one starts Caw on one.
        case decisions
        /// What the project's tasks made, while one has made something.
        case made
        /// A project's own view, by its name.
        case custom(String)

        static let fixed: [Tab] = [.board, .table, .pipeline, .routines, .decisions]

        /// A page that holds blocks, as its tab.
        init(_ page: BlockPage) {
            self = switch page {
            case .board: .board
            case .table: .table
            case .pipeline: .pipeline
            case .routines: .routines
            }
        }

        /// The tab's name (`viewLabel`: a view's name as a stage's is said).
        var label: String {
            switch self {
            case .board: "Board"
            case .table: "Table"
            case .pipeline: "Pipeline"
            case .routines: Words.Routines.tab
            case .decisions: Words.Decisions.tab
            case .made: Words.Made.tab
            case let .custom(name): TaskWords.stage(name)
            }
        }
    }

    private let projectId: String
    private let context: ShellContext
    private let store: ProjectTaskList

    private var current = Tab.board
    private var needsOnly = false
    private var adding = false

    // The head.
    private let head = UIStackView()
    private let who = UIStackView()
    private let acts = UIStackView()
    private let actsGap = UIView()
    private let name = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    /// The name, edited where it stands: a tap on it puts this field in its place.
    private let nameEditor = ProjectNameEditor()
    private let osGlyph = GlyphView(.server, size: Size.iconSm, tint: Palette.inkMuted)
    private let place = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private var places: UIButton!
    private var startButton: UIButton!
    private var spinOff: UIButton!
    private let spinOffProblem = TaskSheetController.problemLabel()
    private var spinning = false
    /// The hub's refusal of a move, on the card it refused, until that card moves again.
    private var refusals: [String: (reason: String, stage: String)] = [:]
    private var more: UIButton!
    /// The project's Caw: his seat on the head, and his words in the line's place while he has some.
    private lazy var lead = ProjectCawLead(hub: context.hub, projectId: projectId)
    private let seat = ProjectCawSeat()
    private let cawWords = UIButton(configuration: .plain())
    /// The line under the name: where the project lives, while Caw has nothing to say.
    private var placeLine: UIView?
    private var leadReadOn = ""
    private var headTop: NSLayoutConstraint!
    private var headLeading: NSLayoutConstraint!
    private var headTrailing: NSLayoutConstraint!

    // Notices, the strip and the pane.
    private let notices = UIStackView()
    /// The head, the notices and the strip, over the pane.
    private let page = UIStackView()
    private let strip = UIStackView()
    private let tabsScroll = UIScrollView()
    private let tabs = SegmentedTabs(Tab.fixed.map { SegmentedTabs.Item($0.label) })
    /// What the strip holds now, in its order.
    private var stripTabs = Tab.fixed
    /// A strip longer than its room fades at the edge it goes on past (`scrollable kit-edge-fade`).
    private var tabsFade: EdgeFade?
    private let rule = UIView()
    private let needs = NeedsYouToggle()
    private var newTask: UIButton!
    /// Ask Caw for a view, while he can start.
    private var askView: UIButton!
    private let pane = UIView()
    private let board = TaskBoardView()
    private let scroller = UIScrollView()
    private let column = UIStackView()
    private let table = TaskTableView()
    private let pipeline = PipelineView()
    private var custom: ProjectViewPane!
    /// The Decisions tab: its grid of pages, or the page open in it.
    private var decisionsPane: DecisionsPane!
    /// Pages are blocks: each page's arrangement as the hub keeps it.
    private lazy var blocks = ProjectBlocks(hub: context.hub, projectId: projectId)
    /// The Routines tab: its three blocks.
    private var routinesPane: RoutinesPane!
    /// The Made tab: each task's outputs.
    private var madePane: MadePane!
    /// A task view's page with views placed beside its view.
    private let blocksPane = BlocksPane()
    /// Board, Table and Pipeline as pages of blocks, made as one is framed.
    private var taskPages: [BlockPage: BlockPageView] = [:]
    /// Each task view block's count of the tasks it shows.
    private var taskCounts: [BlockPage: KitLabel] = [:]
    /// The table's block: the new task's tile over the table.
    private let tableBlock = UIStackView()
    /// Each view placed on a page, its block's body by name, kept while it is placed.
    private var viewBlocks: [String: ViewBlockView] = [:]
    /// The page's leading gutter, which the board scrolls to the edge from.
    private var gutter = 0.0
    private let tableAdd = UIView()
    private var boardForm: NewTaskForm!
    private var tableForm: NewTaskForm!
    private var edgeConstraints: [NSLayoutConstraint] = []
    private let missing = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private var shown: String?

    init(projectId: String, context: ShellContext) {
        self.projectId = projectId
        self.context = context
        store = ProjectTaskList(hub: context.hub, projectId: projectId)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectViewController is built in code")
    }

    // MARK: Building

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        buildHead()
        buildStrip()
        buildPane()
        #if DEBUG
        // Under the probe, each touch, where it landed and what took it, and the gestures that held it.
        if ViewsProbe.on {
            ReachWindow.touched = { touch in
                let at = touch.location(in: nil)
                let phase = switch touch.phase {
                case .began: "began"
                case .ended: "ended"
                default: "cancelled"
                }
                let chain = sequence(first: touch.view, next: { $0?.superview }).prefix(4).compactMap { $0.map { "\(type(of: $0))" } }.joined(separator: "<")
                let gestures = (touch.gestureRecognizers ?? []).map { "\(type(of: $0)):\($0.state.rawValue)" }.joined(separator: ",")
                ViewsProbe.say("views touch \(phase) \(Int(at.x)),\(Int(at.y)) view=\(chain) gestures=\(gestures)")
                // A press on a menu's button: whether a menu stands once it has had time to open, and whether it stays.
                guard touch.phase == .ended, touch.view is UIButton else { return }
                for wait in [0.8, 2.0, 4.0] {
                    DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
                        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
                        func menus(_ view: UIView) -> Bool {
                            "\(type(of: view))".contains("ContextMenu") || view.subviews.contains(where: menus)
                        }
                        ViewsProbe.say("views menu after \(Int(at.x)),\(Int(at.y)) +\(wait)s shown=\(windows.contains { menus($0) })")
                    }
                }
            }
        }
        #endif

        let safe = view.safeAreaLayoutGuide
        for part in [head, notices, strip] { page.addArrangedSubview(part) }
        page.axis = .vertical
        page.translatesAutoresizingMaskIntoConstraints = false
        notices.axis = .vertical
        notices.spacing = Space.space3
        notices.isLayoutMarginsRelativeArrangement = true
        view.addSubview(page)
        view.addSubview(pane)
        // The head and the strip stand at their content's height: the pane,
        // which has none of its own, takes the rest. Without this pull the
        // board's pane left the head free to stretch; it gives way only to
        // the page's own content (compression resists at 750), never to a
        // pane's content hugging its height (250), which pushed the strip
        // 470pt down the phone's screen.
        let snug = page.heightAnchor.constraint(equalToConstant: 0)
        snug.priority = .defaultHigh - 1
        snug.isActive = true
        headTop = page.topAnchor.constraint(equalTo: safe.topAnchor, constant: Space.space6)
        headLeading = page.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space7)
        headTrailing = page.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space6)
        NSLayoutConstraint.activate([
            headTop, headLeading, headTrailing,
            pane.topAnchor.constraint(equalTo: page.bottomAnchor),
            pane.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            pane.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            pane.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        missing.text = "No such project. It may have been removed; pick another from the rail."
        missing.textAlignment = .center
        missing.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(missing)
        NSLayoutConstraint.activate([
            missing.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            missing.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            missing.widthAnchor.constraint(lessThanOrEqualTo: safe.widthAnchor, constant: -Space.space6 * 2),
        ])

        // Another hand may have changed the tasks while the app was away.
        NotificationCenter.default.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.view.window != nil else { return }
                Task { await self.store.refresh() }
                Task { await self.decisionsPane.decisions.read() }
                Task { await self.routinesPane.routines.read() }
                Task { await self.blocks.read() }
            }
        }
        if context.hub.state == .connected {
            Task { await store.refresh() }
            Task { await decisionsPane.decisions.read() }
            Task { await routinesPane.routines.read() }
            Task { await blocks.read() }
        }
    }

    private func buildHead() {
        // The line: the os mark and where the project lives, then `· N places`.
        place.lineBreakMode = .byTruncatingMiddle
        place.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        places = UIButton(configuration: .plain(), primaryAction: UIAction { [weak self] _ in self?.showPlaces() })
        places.configuration?.contentInsets = .zero
        places.setContentCompressionResistancePriority(.required, for: .horizontal)
        places.setContentHuggingPriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [osGlyph, place, places])
        line.spacing = Space.space2
        line.alignment = .center
        name.wrap = .balance
        name.accessibilityTraits = [.header, .button]
        name.accessibilityHint = "Renames the project"
        name.isUserInteractionEnabled = true
        name.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(editName)))
        name.addInteraction(UIPointerInteraction(delegate: nil))
        nameEditor.isHidden = true
        nameEditor.save = { [weak self] next in
            guard let self else { return }
            try await context.hub.editProject(id: projectId, name: next)
        }
        nameEditor.onEnd = { [weak self] in
            guard let self else { return }
            name.isHidden = false
            UIAccessibility.post(notification: .layoutChanged, argument: name)
        }
        who.addArrangedSubview(name)
        who.addArrangedSubview(nameEditor)
        who.addArrangedSubview(line)
        nameEditor.widthAnchor.constraint(equalTo: who.widthAnchor).isActive = true
        let room = nameEditor.widthAnchor.constraint(greaterThanOrEqualToConstant: 280)
        room.priority = .defaultHigh
        room.isActive = true
        who.axis = .vertical
        who.spacing = Space.space1
        who.alignment = .leading

        // New session opens its popover from the button's end; Spin off starts one at once.
        // With no checkout yet, New session is the New Session form, which asks for the machine and folder.
        startButton = KitButton.make("New session", variant: .action) { [weak self] in
            guard let self else { return }
            guard project?.primaryPlace != nil else {
                context.startSession(nil, nil, projectId)
                return
            }
            KitPopover.present(ProjectStartController { [weak self] prompt in try await self?.start(scratch: false, prompt: prompt) },
                               from: startButton, in: self, align: .end)
        }
        spinOff = KitButton.make("Spin off", variant: .outline) { [weak self] in self?.spinOffNow() }
        more = KitButton.make("", glyph: .more, variant: .ghost) {}
        more.showsMenuAsPrimaryAction = true
        more.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.moreMenu() ?? []) }])
        actsGap.setContentHuggingPriority(.init(1), for: .horizontal)
        for part in [startButton!, spinOff!, actsGap, more!] as [UIView] { acts.addArrangedSubview(part) }
        acts.spacing = Space.space2
        acts.alignment = .center
        for button in [startButton!, spinOff!, more!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        // A refused Spin off says why under the row it was asked from.
        let actions = UIStackView(arrangedSubviews: [acts, spinOffProblem])
        actions.axis = .vertical
        actions.spacing = Space.space1
        // Caw on the head's leading edge (ProjectHead.svelte): his panel on a tap.
        seat.addAction(UIAction { [weak self] _ in self?.openCaw() }, for: .touchUpInside)
        let identity = UIStackView(arrangedSubviews: [seat, who])
        identity.spacing = Space.space3
        identity.alignment = .center
        cawWords.addAction(UIAction { [weak self] _ in self?.openAsk() }, for: .touchUpInside)
        cawWords.configuration?.contentInsets = .zero
        cawWords.contentHorizontalAlignment = .leading
        cawWords.isHidden = true
        who.addArrangedSubview(cawWords)
        head.addArrangedSubview(identity)
        head.addArrangedSubview(actions)
        head.isLayoutMarginsRelativeArrangement = true
    }

    private func buildStrip() {
        tabs.addAction(UIAction { [weak self] _ in
            guard let self, stripTabs.indices.contains(tabs.selectedIndex) else { return }
            choose(stripTabs[tabs.selectedIndex])
        }, for: .valueChanged)
        tabs.accessibilityLabel = "Views"
        tabsScroll.addSubview(tabs)
        tabsScroll.showsHorizontalScrollIndicator = false
        tabsScroll.translatesAutoresizingMaskIntoConstraints = false
        let fit = tabsScroll.widthAnchor.constraint(equalTo: tabs.widthAnchor)
        fit.priority = .defaultHigh - 1
        NSLayoutConstraint.activate([
            tabs.topAnchor.constraint(equalTo: tabsScroll.contentLayoutGuide.topAnchor),
            tabs.bottomAnchor.constraint(equalTo: tabsScroll.contentLayoutGuide.bottomAnchor),
            tabs.leadingAnchor.constraint(equalTo: tabsScroll.contentLayoutGuide.leadingAnchor),
            tabs.trailingAnchor.constraint(equalTo: tabsScroll.contentLayoutGuide.trailingAnchor),
            tabsScroll.heightAnchor.constraint(equalTo: tabs.heightAnchor),
            fit,
        ])
        tabsScroll.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        tabsFade = EdgeFade(tabsScroll, axis: .horizontal)
        #if DEBUG
        if ViewsProbe.on { tabsScroll.delegate = self }
        #endif

        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([rule.widthAnchor.constraint(equalToConstant: 1), rule.heightAnchor.constraint(equalToConstant: Size.cBtnHSm)])
        needs.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            needsOnly = !filtering
            requestRefresh()
        }, for: .touchUpInside)
        newTask = KitButton.make("New task", glyph: .plus, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            if current != .table { choose(.board) }
            setAdding(true)
        }
        askView = KitButton.make(Words.Views.ask, glyph: .sparkles, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            askForView(from: askView)
        }
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        for part in [tabsScroll, rule, needs, newTask!, askView!, rest] as [UIView] { strip.addArrangedSubview(part) }
        for part in [needs, newTask!, askView!] as [UIView] {
            part.setContentCompressionResistancePriority(.required, for: .horizontal)
            part.setContentHuggingPriority(.required, for: .horizontal)
        }
        strip.spacing = Space.space3
        strip.setCustomSpacing(Space.space2, after: needs)
        strip.alignment = .center
        strip.isLayoutMarginsRelativeArrangement = true
    }

    private func buildPane() {
        pane.translatesAutoresizingMaskIntoConstraints = false
        pane.clipsToBounds = true
        boardForm = NewTaskForm(picksStage: false) { [weak self] title, stage in try await self?.store.create(title: title, stage: stage) }
        boardForm.onOpenChange = { [weak self] open in self?.setAdding(open) }
        tableForm = NewTaskForm(picksStage: true) { [weak self] title, stage in try await self?.store.create(title: title, stage: stage) }
        tableForm.onOpenChange = { [weak self] open in self?.setAdding(open) }
        board.onOpen = { [weak self] id in self?.open(id) }
        board.onMove = { [weak self] id, stage in self?.move(id, to: stage) }
        board.onRetry = { [weak self] id in
            guard let self, let stage = refusals[id]?.stage else { return }
            move(id, to: stage)
        }
        board.allowed = { [weak self] stage in self?.store.allowed(from: stage) ?? [] }
        table.onOpen = { [weak self] id in self?.open(id) }

        // The table's new task, in a raised tile (`max-inline-size: 36rem`).
        let tile = TileView(radius: Radius.radiusLg)
        tile.addSubview(tableForm)
        tableAdd.addSubview(tile)
        let measure = tile.widthAnchor.constraint(equalToConstant: 576)
        measure.priority = .defaultHigh
        NSLayoutConstraint.activate([
            tableForm.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            tableForm.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
            tableForm.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space3),
            tableForm.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space3),
            tile.topAnchor.constraint(equalTo: tableAdd.topAnchor),
            tile.bottomAnchor.constraint(equalTo: tableAdd.bottomAnchor),
            tile.leadingAnchor.constraint(equalTo: tableAdd.leadingAnchor),
            tile.trailingAnchor.constraint(lessThanOrEqualTo: tableAdd.trailingAnchor),
            measure,
        ])

        // A project's own view: Keep and Discard answer in place, as the web's
        // do; a discarded draft leaves the board in its place.
        custom = ProjectViewPane(hub: context.hub)
        custom.onOpenTask = { [weak self] id in self?.open(id) }
        custom.onOpenFile = { [weak self] path in self?.openFile(path) }
        custom.keep = { [weak self] name in try await self?.store.keepView(name) }
        custom.discard = { [weak self] name in
            guard let self else { return }
            try await store.discardView(name)
            choose(.board)
        }
        custom.place = { [weak self] name, page in self?.placeView(name, on: page) }
        custom.isHidden = true
        pane.addSubview(custom)

        decisionsPane = DecisionsPane(hub: context.hub, home: context.home, projectId: projectId)
        decisionsPane.onChange = { [weak self] in self?.requestRefresh() }
        decisionsPane.openCaw = { [weak self] from, words in self?.openCaw(from: from, ask: words) }
        decisionsPane.newSession = { [weak self] in
            guard let self else { return }
            context.startSession(nil, nil, projectId)
        }
        decisionsPane.openTask = { [weak self] id in self?.open(id) }
        decisionsPane.taskOf = { [weak self] id in
            self?.store.tasks.first { $0.id == id }.map { ($0.kind, $0.title) }
        }
        decisionsPane.isHidden = true
        pane.addSubview(decisionsPane)

        // A block naming a view no longer kept is dropped from its page.
        blocks.kept = { [weak self] in self?.store.views.map { $0.filter { !$0.draft }.map(\.name) } }
        // A view placed or made a tab elsewhere moves the strip: the views are read with the arrangement.
        blocks.onChanged = { [weak self] in
            guard let self else { return }
            Task { await self.store.readViews() }
        }
        routinesPane = RoutinesPane(hub: context.hub, projectId: projectId, blocks: blocks)
        routinesPane.onChange = { [weak self] in self?.requestRefresh() }
        routinesPane.openThread = { [weak self] id in self?.context.openSession(ThreadTabs.tabId(id)) }
        routinesPane.viewItems = { [weak self] in self?.viewItems(on: .routines) ?? [:] }
        routinesPane.isHidden = true
        pane.addSubview(routinesPane)

        tableBlock.axis = .vertical
        tableBlock.spacing = Space.space3
        blocksPane.isHidden = true
        pane.addSubview(blocksPane)

        madePane = MadePane(hub: context.hub, projectId: projectId)
        madePane.onOpenTask = { [weak self] id in self?.open(id) }
        madePane.isHidden = true
        pane.addSubview(madePane)

        mountBoard()
        scroller.translatesAutoresizingMaskIntoConstraints = false
        scroller.alwaysBounceVertical = true
        pane.addSubview(scroller)
        column.axis = .vertical
        column.spacing = Space.space3
        column.translatesAutoresizingMaskIntoConstraints = false
        scroller.addSubview(column)
        NSLayoutConstraint.activate([
            custom.topAnchor.constraint(equalTo: pane.topAnchor),
            custom.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            custom.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            custom.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            decisionsPane.topAnchor.constraint(equalTo: pane.topAnchor),
            decisionsPane.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            decisionsPane.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            decisionsPane.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            routinesPane.topAnchor.constraint(equalTo: pane.topAnchor),
            routinesPane.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            routinesPane.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            routinesPane.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            madePane.topAnchor.constraint(equalTo: pane.topAnchor),
            madePane.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            madePane.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            madePane.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            blocksPane.topAnchor.constraint(equalTo: pane.topAnchor),
            blocksPane.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            blocksPane.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            blocksPane.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            scroller.topAnchor.constraint(equalTo: pane.topAnchor),
            scroller.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            scroller.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            scroller.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
            column.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor),
            column.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            scroller.contentLayoutGuide.widthAnchor.constraint(equalTo: scroller.frameLayoutGuide.widthAnchor),
        ])
    }

    // MARK: Reading

    private var project: ProjectRow? { context.hub.fleet.projects.first { $0.id == projectId } }

    /// The filter holds only while something needs you.
    private var filtering: Bool { needsOnly && !store.needsYou.isEmpty }

    override func refreshContent() {
        let fleet = context.hub.fleet
        guard let project else {
            for part in [head, notices, strip, pane] as [UIView] { part.isHidden = true }
            missing.isHidden = !fleet.fleetRead
            return
        }
        for part in [head, strip, pane] as [UIView] { part.isHidden = false }
        missing.isHidden = true
        arrange()
        showHead(project, fleet: fleet)
        showNotices(project)
        showStrip()
        showPane()
        // He stands over the empty Decisions tab at 80 instead of sitting in the head: one Caw.
        seat.isHidden = shownTab == .decisions && decisionsPane.cawStands
    }

    private func showHead(_ project: ProjectRow, fleet: FleetStore) {
        #if DEBUG
        if name.text != project.name { ProjectNameProbe.say("shows \(project.name)") }
        #endif
        name.text = project.name
        let primary = project.primaryPlace
        let machine = primary.flatMap { home in fleet.machines.first { $0.machineId == home.machineId } }
        osGlyph.isHidden = machine == nil
        osGlyph.glyph = Glyph.os(machine?.os ?? "")
        // Where the project lives (WORDS.md: place): its machine and folder.
        place.text = primary.map { home in machine.map { "\($0.name) · \(home.path)" } ?? home.path } ?? "Its folder on the hub"
        let checkouts = project.places.filter { $0.kind != .hub }.count
        places.isHidden = checkouts <= 1
        places.configuration?.attributedTitle = AttributedString("· \(checkouts) places", attributes: TypeScale.typeLabel.container(color: Palette.inkMuted))
        // Spin off starts in the primary checkout at once: only a project with one offers it.
        spinOff.isHidden = primary == nil
        more.accessibilityLabel = "More for \(project.name)"
        showCaw()
    }

    /// Caw's face, and his words in the place line's stead while he has
    /// something to say: what his session is doing, his question as a way
    /// to its thread (ProjectHead.svelte). His view is read on arrival, on
    /// each connection, and as a turn begins.
    private func showCaw() {
        let hub = context.hub
        let working = lead.view?.leadInstanceId.flatMap { hub.fleet.activityPulse($0)?.activity } == .working
        let on = "\(hub.state == .connected)|\(working)|\(hub.threadsMoved[projectId] ?? 0)"
        if hub.state == .connected, on != leadReadOn {
            leadReadOn = on
            Task { [lead] in await lead.read() }
        }
        seat.configure(lead.status, sentence: lead.sentence)
        let words = lead.words
        placeLine = placeLine ?? place.superview
        placeLine?.isHidden = words != nil
        cawWords.isHidden = words == nil
        let ink = words?.threadId != nil ? Palette.linkInk : Palette.inkMuted
        cawWords.configuration?.attributedTitle = AttributedString(words?.text ?? "", attributes: TypeScale.typeLabel.container(color: ink))
        cawWords.isEnabled = words?.threadId != nil
    }

    /// His panel over the page from whichever seat stands (CawFloat): the
    /// head's, or his 80pt one over an empty tab; a starter's words in his field.
    private func openCaw(from source: UIView? = nil, ask: String? = nil) {
        guard let project else { return }
        let panel = ProjectCawPanel(lead: lead, hub: context.hub, projectName: project.name, ask: ask,
                                    openThread: { [weak self] id in self?.context.openSession(ThreadTabs.tabId(id)) })
        KitPopover.present(panel, from: source ?? seat, in: self, align: .start)
    }

    /// Ask Caw for a view: his Composer in a popover from where it was asked, at its end.
    private func askForView(from source: UIView) {
        KitPopover.present(ViewAskController(hub: context.hub, projectId: projectId), from: source, in: self, align: .end)
    }

    // MARK: Pages of blocks

    /// The board on the pane, edge to edge, as it stands with no view beside it.
    private func mountBoard() {
        guard board.superview !== pane else { return }
        board.removeFromSuperview()
        board.translatesAutoresizingMaskIntoConstraints = false
        pane.addSubview(board)
        boardPins = [
            board.topAnchor.constraint(equalTo: pane.topAnchor),
            board.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            board.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            board.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
        ]
        NSLayoutConstraint.activate(boardPins)
    }

    /// The board pinned to the pane's edges while it stands there itself.
    private var boardPins: [NSLayoutConstraint] = []

    /// The board leaves the pane for its block on a page: its pins go with it.
    /// UIKit drops a moved view's constraints only to a view it is no longer
    /// inside, and the pane still holds the block, so the board stayed pinned
    /// to the pane's height while the block held it to its own; each pass
    /// moved the strip 72pt further down until the board stood at its least.
    private func unmountBoard() {
        NSLayoutConstraint.deactivate(boardPins)
        boardPins = []
    }

    /// A task view's page of blocks, made the first time a view is placed beside it.
    private func taskPage(_ page: BlockPage) -> BlockPageView {
        if let made = taskPages[page] { return made }
        let made = BlockPageView(page: page, blocks: blocks)
        taskPages[page] = made
        return made
    }

    /// A task view's page (`taskPageItems`): the view itself, spanning the
    /// row, counting the tasks it shows, the board filling the page's height;
    /// then the views placed on it.
    private func taskItems(_ page: BlockPage, content: UIView, count: Int) -> [String: BlockItem] {
        let counted = taskCounts[page] ?? {
            // `.block-count`: meta type, subtle ink, tabular.
            let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            label.tabular = true
            taskCounts[page] = label
            return label
        }()
        counted.text = "\(count)"
        let glyph: Glyph = switch page {
        case .board: .columns
        case .table: .fileTable
        default: .workflow
        }
        var items = viewItems(on: page)
        items[page.rawValue] = BlockItem(title: page.title, glyph: glyph, meta: counted, content: content, measure: Size.cBlockView,
                                         hideable: false, body: page == .board ? .fill : .natural, card: false, wideOnly: true, alone: true)
        return items
    }

    /// The kept views placed on a page, each a block there drawn as its tab draws it (`viewItemsOf`).
    private func viewItems(on page: BlockPage) -> [String: BlockItem] {
        var items: [String: BlockItem] = [:]
        for place in blocks.placesOf(page) {
            guard let name = place.view, views.contains(where: { $0.name == name && !$0.draft }) else { continue }
            let body = viewBlocks[name] ?? {
                let made = ViewBlockView(hub: context.hub, projectId: projectId, name: name)
                made.onOpenTask = { [weak self] id in self?.open(id) }
                made.onOpenFile = { [weak self] path in self?.openFile(path) }
                viewBlocks[name] = made
                return made
            }()
            items[place.block] = BlockItem(title: TaskWords.stage(name), glyph: .artifactSheet, content: body, measure: Size.cBlockView,
                                           hideable: true, body: .natural, card: false, view: name)
        }
        return items
    }

    /// A view's block no page holds now goes, its web view with it.
    private func dropUnplacedViews() {
        let placed = Set(BlockPage.allCases.flatMap { blocks.placesOf($0).compactMap(\.view) })
        for name in viewBlocks.keys where !placed.contains(name) {
            viewBlocks[name]?.removeFromSuperview()
            viewBlocks[name] = nil
        }
    }

    /// A kept view placed on a page: it leaves the strip, and the page shows
    /// it. Refused, the view stays on its tab, the hub's words said over it.
    private func placeView(_ name: String, on page: BlockPage) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if await blocks.place(name, on: page) {
                choose(Tab(page))
            } else {
                Toast.error(blocks.refused[page] ?? Words.Blocks.notPlaced, in: view.window)
            }
        }
    }

    /// You can talk to Caw, on or off: only a reason he cannot start (no machine) stops it.
    private var canTalk: Bool { lead.view != nil && lead.view?.problem == nil }

    /// His question, as a link: its thread, the card on its composer.
    private func openAsk() {
        guard let threadId = lead.words?.threadId else { return }
        context.openSession(ThreadTabs.tabId(threadId))
    }

    private func showNotices(_ project: ProjectRow) {
        var lines: [String] = []
        if let stages = store.stages, !stages.problems.isEmpty {
            lines.append("stages.md in the project folder does not read: \(stages.problems.joined(separator: " ")) Tasks keep their stages meanwhile; fix the file and the board takes its columns from it.")
        } else if let problem = store.stagesProblem {
            lines.append("The project's stages could not be read: \(problem)")
        }
        if let list = store.list, !list.problems.isEmpty { lines.append(list.problems.joined(separator: " ")) }
        if let problem = store.viewsProblem { lines.append("The project's views could not be read: \(problem)") }
        if lines != shownNotices {
            shownNotices = lines
            notices.arrangedSubviews.forEach { $0.removeFromSuperview() }
            for line in lines { notices.addArrangedSubview(KitAlert(line, tone: .warning)) }
        }
        notices.isHidden = lines.isEmpty
    }

    private var shownNotices: [String] = []

    /// The project's views as the hub lists them, kept then drafted.
    private var views: [ProjectView] { store.views ?? [] }

    /// The tab on screen: the one chosen while it exists, the board once it
    /// is gone (a draft discarded elsewhere), as the web's `current` is.
    private var shownTab: Tab { stripTabs.contains(current) ? current : .board }

    private func showStrip() {
        // What the project's tasks made, while one has made something.
        let made: [Tab] = store.tasks.contains { !$0.outputs.isEmpty } ? [.made] : []
        // A view placed on a page stands there as a block, and is no tab.
        let tabbed = views.filter { $0.draft || blocks.pageOfView($0.name) == nil }
        stripTabs = Tab.fixed + made + tabbed.map { Tab.custom($0.name) }
        let waitingPages = decisionsPane.decisions.waiting
        let items = stripTabs.map { tab in
            if case let .custom(name) = tab, views.first(where: { $0.name == name })?.draft == true {
                return SegmentedTabs.Item(tab.label, badge: "draft")
            }
            // Decisions counts the pages waiting on your picks.
            if tab == .decisions, waitingPages > 0 {
                return SegmentedTabs.Item(tab.label, count: waitingPages)
            }
            return SegmentedTabs.Item(tab.label)
        }
        let chosen = stripTabs.firstIndex(of: shownTab) ?? 0
        let moved = chosen != tabs.selectedIndex || items != tabs.items
        tabs.set(items, selected: chosen)
        // The chosen tab stays in view in a strip too long for the width.
        if moved, let box = tabs.frame(ofItem: chosen, in: tabsScroll) {
            tabsScroll.layoutIfNeeded()
            tabsScroll.scrollRectToVisible(box.insetBy(dx: -Space.space4, dy: 0), animated: view.window != nil)
        }
        let waiting = store.needsYou.count
        needs.isHidden = waiting == 0
        needs.configure(count: waiting, on: filtering)
        // New task stands in the strip whenever there is no form for it on the board.
        let stripped = store.list != nil && !store.empty
        // Under 640pt New task and Ask Caw for a view are in the head's ⋯; the rule stands only while Needs you follows it.
        newTask.isHidden = !stripped || phone
        askView.isHidden = !canTalk || phone
        rule.isHidden = phone ? waiting == 0 : (waiting == 0 && !stripped && !canTalk)
        #if DEBUG
        probeStrip()
        #endif
    }

    private func showPane() {
        let stages = store.stageList
        let tasks = store.tasks
        let shownTasks = filtering ? store.needsYou : tasks
        let shownStages = filtering ? stages.filter { $0.kind == .you } : stages
        column.arrangedSubviews.forEach { column.removeArrangedSubview($0); $0.removeFromSuperview() }
        dropUnplacedViews()
        /// Which of the pane's three surfaces shows: the board, the column (the
        /// table, the pipeline, a state), or a project's own view.
        var surface: UIView = scroller
        var what: String

        if case let .custom(name) = shownTab, let shown = views.first(where: { $0.name == name }) {
            what = "view:\(name)"
            surface = custom
            custom.show(shown, projectId: projectId)
        } else if shownTab == .routines, let project {
            what = "routines"
            surface = routinesPane
            routinesPane.show(projectName: project.name, canTalk: canTalk, cawProblem: lead.view?.problem,
                              starters: context.hub.startersOf(projectId, .routines, read: store.stages?.routineStarters))
        } else if shownTab == .decisions {
            what = "decisions"
            surface = decisionsPane
            decisionsPane.show(canTalk: canTalk, lead: lead,
                               starters: context.hub.startersOf(projectId, .decisions, read: store.stages?.decisionStarters),
                               projectName: project?.name ?? "")
        } else if store.list == nil {
            if let problem = store.listProblem {
                what = "unread"
                let retry = KitButton.make("Retry", variant: .outline) { [weak self] in Task { await self?.store.refresh() } }
                retry.setContentHuggingPriority(.required, for: .horizontal)
                column.addArrangedSubview(KitEmptyState(icon: .toolTodo, title: "Tasks are not available",
                    line: "The tasks for \(project?.name ?? "this project") could not be read: \(problem) Nothing was changed.", action: retry))
            } else {
                what = "reading"
                column.addArrangedSubview(SkeletonView(height: 256))
            }
        } else if store.empty && !adding {
            what = "empty"
            // An empty board with the lead off holds the form itself.
            let first = NewTaskForm(primary: true, picksStage: true) { [weak self] title, stage in try await self?.store.create(title: title, stage: stage) }
            first.stage = store.newIn ?? ""
            first.stages = stages
            first.onOpenChange = { [weak self] open in self?.setAdding(open) }
            column.addArrangedSubview(KitEmptyState(icon: .toolTodo, title: "Nothing on the board yet",
                                                    line: "Add a task, or turn Caw on to plan it with him.", action: first))
        } else {
            // A task view with views placed beside it is a page of blocks.
            let framed = { (page: BlockPage) in self.blocks.placesOf(page).count > 1 }
            switch shownTab {
            case .board, .custom, .decisions, .routines:
                what = "board"
                surface = board
                boardForm.stage = store.newIn ?? ""
                boardForm.setOpen(adding, announce: false)
                let kinds = Dictionary(tasks.map { ($0.id, $0.kind) }, uniquingKeysWith: { first, _ in first })
                board.show(stages: shownStages, tasks: shownTasks, newIn: store.newIn, foot: boardForm, kindOf: kinds,
                           moving: Set(store.moving.keys), refused: refusals.mapValues(\.reason))
                if framed(.board) {
                    what = "blocks:board"
                    surface = blocksPane
                    unmountBoard()
                    board.inset = 0
                    blocksPane.show(taskPage(.board), items: taskItems(.board, content: board, count: shownTasks.count))
                } else {
                    mountBoard()
                    board.inset = gutter
                }
            case .table:
                what = "table"
                if adding {
                    tableForm.stage = store.newIn ?? ""
                    tableForm.stages = stages
                }
                tableForm.setOpen(adding, announce: false)
                table.show(stages: stages, tasks: shownTasks)
                let parts: [UIView] = adding ? [tableAdd, table] : [table]
                if framed(.table) {
                    what = "blocks:table"
                    surface = blocksPane
                    if tableBlock.arrangedSubviews != parts {
                        tableBlock.arrangedSubviews.forEach { $0.removeFromSuperview() }
                        parts.forEach(tableBlock.addArrangedSubview)
                    }
                    blocksPane.show(taskPage(.table), items: taskItems(.table, content: tableBlock, count: shownTasks.count))
                } else {
                    parts.forEach(column.addArrangedSubview)
                }
            case .pipeline:
                what = "pipeline"
                pipeline.show(stages: stages, tasks: shownTasks, phone: phone)
                if framed(.pipeline) {
                    what = "blocks:pipeline"
                    surface = blocksPane
                    blocksPane.show(taskPage(.pipeline), items: taskItems(.pipeline, content: pipeline, count: shownTasks.count))
                } else {
                    column.addArrangedSubview(pipeline)
                }
            case .made:
                what = "made"
                surface = madePane
                madePane.show(shownTasks)
            }
        }
        // The panes cross over each other as the view changes.
        if what != shown {
            let first = shown == nil
            shown = what
            let showing = surface
            let place: @MainActor @Sendable () -> Void = {
                // Only the pane's own surfaces cross over: the board placed in a
                // block of the page is that block's content, and shows with it.
                for each in [self.board, self.scroller, self.custom!, self.decisionsPane!, self.routinesPane!, self.madePane!, self.blocksPane] as [UIView] {
                    each.isHidden = each.superview === self.pane && each !== showing
                }
                #if DEBUG
                ViewsProbe.say("views panes \(what) shown=" + self.pane.subviews.filter { !$0.isHidden }.map { "\(type(of: $0))" }.joined(separator: ","))
                #endif
            }
            if !first, view.window != nil, !UIAccessibility.isReduceMotionEnabled {
                UIView.transition(with: pane, duration: Motion.durFade, options: [.transitionCrossDissolve, .allowUserInteraction], animations: place)
            } else {
                place()
            }
        }
    }

    // MARK: Shape

    /// The window's width, which is what the web's breakpoints read.
    private var span: Double { Double(view.window?.bounds.width ?? view.bounds.width) }
    /// Under 640pt.
    private var phone: Bool { span < 640 }
    private var arranged: String?

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if arrange() { requestRefresh() }
        #if DEBUG
        probePageHeight()
        #endif
    }

    /// The page's gutters and the head's shape for the width: from 900pt the
    /// head's actions beside its titles, under it on their own row with ⋯ at
    /// the far end. Says whether the shape changed.
    @discardableResult
    private func arrange() -> Bool {
        guard isViewLoaded else { return false }
        let wide = span >= 900
        let shape = "\(wide):\(phone)"
        guard shape != arranged else { return false }
        arranged = shape
        // `padding: space-6 space-6 space-4 space-7`; under 900 `space-5 space-5 space-3`.
        headTop.constant = wide ? Space.space6 : Space.space5
        headLeading.constant = wide ? Space.space7 : Space.space5
        headTrailing.constant = wide ? -Space.space6 : -Space.space5
        head.axis = wide ? .horizontal : .vertical
        head.alignment = wide ? .center : .fill
        head.spacing = wide ? Space.space4 : Space.space3
        head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: wide ? Space.space4 : Space.space3, trailing: 0)
        actsGap.isHidden = wide
        notices.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: Space.space3, trailing: 0)
        strip.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: Space.space4, trailing: 0)
        // The pane keeps the page's gutters: the board scrolls to the edge from them.
        let leading = wide ? Space.space7 : Space.space5, trailing = wide ? Space.space6 : Space.space5
        gutter = leading
        // In a block the board stands inside the gutters already.
        board.inset = board.superview === pane ? leading : 0
        custom.inset(leading: leading, trailing: trailing)
        blocksPane.inset(leading: leading, trailing: trailing)
        decisionsPane.inset(leading: leading, trailing: trailing)
        routinesPane.inset(leading: leading, trailing: trailing)
        madePane.inset(leading: leading, trailing: trailing)
        NSLayoutConstraint.deactivate(edgeConstraints)
        edgeConstraints = [
            column.leadingAnchor.constraint(equalTo: scroller.frameLayoutGuide.leadingAnchor, constant: leading),
            column.trailingAnchor.constraint(equalTo: scroller.frameLayoutGuide.trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(edgeConstraints)
        return true
    }

    // MARK: Acting

    private func choose(_ next: Tab) {
        guard next != current else { return }
        current = next
        requestRefresh()
    }

    private func setAdding(_ next: Bool) {
        guard next != adding else { return }
        adding = next
        requestRefresh()
        // The form opens where the new task will stand: its column comes into view.
        if next, let column = store.newIn {
            DispatchQueue.main.async { [weak self] in self?.board.reveal(column) }
        }
    }

    private func open(_ taskId: String) {
        #if DEBUG
        ViewsProbe.say("views open-task \(taskId)")
        #endif
        context.openTask(projectId, taskId)
    }

    /// A file of the project's folder a view links to (the project page's
    /// `?file=`), read as it is on the hub, in the sheet a Caw reply's chip
    /// opens (ThreadViewController `openFile`).
    private func openFile(_ path: String) {
        let sheet = FolderFileController(hub: context.hub, projectId: projectId, path: path)
        present(HouseSheetController(sheet, title: path, scroller: sheet.scroll), animated: true)
    }

    /// A tap on the name: the field takes its place, holding it, selected (ProjectHead.svelte).
    @objc private func editName() {
        guard let project, nameEditor.isHidden else { return }
        #if DEBUG
        ProjectNameProbe.tapped(name)
        #endif
        name.isHidden = true
        nameEditor.begin(project.name)
    }

    /// A drop or a Move to…: the card stands where it was put, in a column the
    /// board brings into view, saying it moves, until the hub answers. A
    /// refusal puts it back where it was, in view, with the hub's sentence
    /// (which names the moves that are open) under it, and Try again makes
    /// the same move.
    private func move(_ taskId: String, to stage: String) {
        let from = store.tasks.first { $0.id == taskId }?.stage
        refusals[taskId] = nil
        board.reveal(stage)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await store.move(taskId, to: stage)
            } catch {
                refusals[taskId] = (error.localizedDescription, stage)
                requestRefresh()
                if let from { board.reveal(from) }
                UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
            }
        }
    }

    /// `⋯`: under 640pt the views (the strip's chosen one checked, a draft
    /// saying so) and New task; Pick stages… while the code stages stand in;
    /// Forget project….
    private func moreMenu() -> [UIMenuElement] {
        var sections: [UIMenuElement] = []
        if phone {
            let shown = shownTab
            let views = stripTabs.map { each in
                let action = UIAction(title: each.label) { [weak self] _ in self?.choose(each) }
                if case let .custom(name) = each, self.views.first(where: { $0.name == name })?.draft == true {
                    action.subtitle = "draft"
                }
                if each == .decisions, decisionsPane.decisions.waiting > 0 {
                    action.subtitle = "\(decisionsPane.decisions.waiting)"
                }
                action.state = each == shown ? .on : .off
                return action
            }
            sections.append(UIMenu(title: "View", options: .displayInline, children: views))
            var adds: [UIMenuElement] = [UIAction(title: "New task", image: Glyph.plus.image) { [weak self] _ in
                self?.choose(.board)
                self?.setAdding(true)
            }]
            if canTalk {
                adds.append(UIAction(title: Words.Views.ask, image: Glyph.sparkles.image) { [weak self] _ in
                    guard let self else { return }
                    askForView(from: more)
                })
            }
            sections.append(UIMenu(options: .displayInline, children: adds))
        }
        if store.stages?.source == .template {
            sections.append(UIMenu(options: .displayInline, children: [UIAction(title: "Pick stages…") { [weak self] _ in self?.pickStages() }]))
        }
        if let upstream = upstreamMenu() {
            sections.append(UIMenu(options: .displayInline, children: [upstream]))
        }
        sections.append(UIMenu(options: .displayInline, children: [UIAction(title: "Forget project…", attributes: .destructive) { [weak self] _ in
            guard let self, let project else { return }
            context.forgetProject(project, more)
        }]))
        return sections
    }

    /// Other people's repositories (UpstreamMenu.svelte): Same as the fleet,
    /// the fleet's answer under it (unanswered reads as allowed, as the gate
    /// judges it), then the project's own three answers, the one it goes by
    /// checked.
    private func upstreamMenu() -> UIMenu? {
        guard let project else { return nil }
        let own = project.upstreamPosts
        let fleetWords = if case let .answered(answer) = context.hub.fleet.upstream { answer.words } else { Words.Upstream.allow }
        let same = UIAction(title: Words.Upstream.inherit) { [weak self] _ in self?.setUpstream(nil) }
        same.subtitle = fleetWords
        same.state = own == nil ? .on : .off
        let answers = Components.Schemas.FleetChoicesUpstream.listed.map { answer in
            let action = UIAction(title: answer.words) { [weak self] _ in self?.setUpstream(answer) }
            action.state = own == answer ? .on : .off
            return action
        }
        return UIMenu(title: Words.Upstream.title, image: Glyph.shield.image, children: [same] + answers)
    }

    /// The project's own upstream answer, nil for the fleet's; the hub's refusal said where it was asked.
    private func setUpstream(_ answer: Components.Schemas.FleetChoicesUpstream?) {
        guard let project, project.upstreamPosts != answer else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await context.hub.setProjectUpstream(id: project.id, answer)
            } catch {
                Toast.show(error.localizedDescription, in: view.window)
            }
        }
    }

    private func pickStages() {
        guard let api = try? ProjectTasks(hub: context.hub, projectId: projectId) else { return }
        // The board changes in place under the popover; a set that strands tasks names them before it is written.
        let control = StagesControl(api: api, tasks: store.tasks) { [weak self] stages in self?.store.applied(stages) }
        KitPopover.present(control, from: more, in: self, align: .end)
    }

    /// `· N places`: every place the project has, the hub's folder among them.
    private func showPlaces() {
        guard let project else { return }
        let machines = context.hub.fleet.machines
        let list = PlacesList(project.places.map { each in
            let host = each.kind == .hub ? "The hub" : (machines.first { $0.machineId == each.machineId }?.name ?? "A machine not joined")
            return (host, each.path)
        })
        KitPopover.present(list, from: places, in: self, align: .start)
    }

    /// "New session" and "Spin off": a session here on what the new-session
    /// form was last set to, opened in its tab as soon as the hub has it.
    /// The hub's refusal is thrown to whoever asked, which says it where it was asked.
    private func start(scratch: Bool, prompt: String?) async throws {
        guard let project, let home = project.primaryPlace else { return }
        let id = try await context.hub.spawnSession(machineId: home.machineId, cwd: home.path, projectId: project.id, prompt: prompt, scratch: scratch)
        context.openSession(id)
    }

    /// Spin off, at once: the button says it is starting, and a refusal stands
    /// under the head's action row until the next Spin off answers.
    private func spinOffNow() {
        guard !spinning else { return }
        spinning = true
        KitButton.setTitle("Spinning off…", of: spinOff, variant: .outline, height: .standard)
        spinOff.configuration?.showsActivityIndicator = true
        spinOff.isEnabled = false
        Task { @MainActor [weak self] in
            guard let self else { return }
            var refused: String?
            do {
                try await start(scratch: true, prompt: nil)
            } catch {
                refused = error.localizedDescription
            }
            spinning = false
            KitButton.setTitle("Spin off", of: spinOff, variant: .outline, height: .standard)
            spinOff.configuration?.showsActivityIndicator = false
            spinOff.isEnabled = true
            spinOffProblem.text = refused
            Motion.easeDrawer.animator(Motion.durMorph) {
                self.spinOffProblem.isHidden = refused == nil
                self.view.layoutIfNeeded()
            }.startAnimation()
            if let refused { UIAccessibility.post(notification: .announcement, argument: refused) }
        }
    }

    #if DEBUG
    // MARK: The simulator probe (scripts/probe-kit/specs/ios-views.ts)

    private var probedStrip = ""

    /// The strip as it stands: each tab's words (a draft's tag after them)
    /// and its centre in the window, the chosen one; under 640pt the ⋯
    /// menu's view list as it would draw now. Said again only when it moved.
    private func probeStrip() {
        guard ViewsProbe.on, view.window != nil else { return }
        view.layoutIfNeeded()
        let items = tabs.items.enumerated().map { index, item in
            let box = tabs.frame(ofItem: index, in: nil) ?? .zero
            return "\(item.label)\(item.badge.map { "+\($0)" } ?? "")\(item.count.map { "#\($0)" } ?? "")@\(Int(box.midX.rounded())),\(Int(box.midY.rounded()))"
        }.joined(separator: ";")
        let room = tabsScroll.convert(tabsScroll.bounds, to: nil)
        var line = "views strip chosen=\(shownTab.label) phone=\(phone) room=\(Int(room.minX.rounded()))-\(Int(room.maxX.rounded())) items=\(items)"
        if !askView.isHidden { line += " ask=\(ViewsProbe.centre(askView))" }
        if phone, let list = moreMenu().first as? UIMenu {
            line += " more=\(ViewsProbe.centre(more)) menu=" + list.children.compactMap { $0 as? UIAction }.map {
                "\($0.title)\($0.subtitle.map { "+\($0)" } ?? "")\($0.state == .on ? "*" : "")"
            }.joined(separator: ";")
        }
        guard line != probedStrip else { return }
        probedStrip = line
        ViewsProbe.say(line)
        probeStretch()
    }

    private var probedHeight = 0.0

    /// The page's height changed: whether it stands taller than its content.
    func probePageHeight() {
        guard ViewsProbe.on, abs(page.bounds.height - probedHeight) > 1 else { return }
        probedHeight = page.bounds.height
        probeStretch()
    }

    /// The head and the strip taller than their content: what holds them so,
    /// as the engine says (`constraintsAffectingLayout`), with the pane's frame.
    private func probeStretch() {
        let natural = page.systemLayoutSizeFitting(CGSize(width: page.bounds.width, height: 0),
                                                   withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        guard page.bounds.height > natural + 1 else { return }
        func name(_ item: AnyObject?) -> String {
            guard let item else { return "-" }
            if let view = item as? UIView { return view === page ? "page" : view === pane ? "pane" : String(describing: type(of: view)) }
            return String(describing: type(of: item))
        }
        // What can move: below required, a view's own size (hugging, compression,
        // intrinsic), or the page's and the pane's own edges.
        let holds = page.constraintsAffectingLayout(for: .vertical).filter { c in
            c.priority.rawValue < 1000 || "\(type(of: c))".contains("ContentSize")
                || [c.firstItem, c.secondItem].contains { $0 === page || $0 === pane }
        }.prefix(60).map { c in
            "\(name(c.firstItem)).\(c.firstAttribute.rawValue)\(["<=", "==", ">="][c.relation.rawValue + 1])\(name(c.secondItem)).\(c.secondAttribute.rawValue)+\(Int(c.constant))@\(Int(c.priority.rawValue))\("\(type(of: c))".contains("ContentSize") ? "(size)" : "")"
        }
        let below = pane.subviews.filter { !$0.isHidden }.map { "\(type(of: $0))[\(Int($0.frame.height))]" }
        // A wrapping label whose asked height outgrows its box: a stale wrap width.
        func labels(_ view: UIView) -> [UILabel] {
            ((view as? UILabel).map { [$0] } ?? []) + view.subviews.flatMap(labels)
        }
        let tall = labels(page).filter { $0.numberOfLines != 1 && !$0.isHidden }.map { label in
            "'\((label.text ?? "").prefix(24))' asks \(Int(label.intrinsicContentSize.height)) box \(Int(label.bounds.width))×\(Int(label.bounds.height)) wrapAt \(Int(label.preferredMaxLayoutWidth))"
        }
        ViewsProbe.say("views stretched labels \(tall.joined(separator: " | "))")
        ViewsProbe.say("views stretched page=\(Int(page.bounds.height)) natural=\(Int(natural)) pane=\(Int(pane.frame.minY))+\(Int(pane.frame.height)) shown=\(below.joined(separator: ",")) holds=\(holds.joined(separator: ", "))")
    }
    #endif
}

#if DEBUG
/// Under the probe, a strip that came to rest says where its tabs stand now.
extension ProjectViewController: UIScrollViewDelegate {
    func scrollViewDidEndDecelerating(_: UIScrollView) { probeStrip() }
    func scrollViewDidEndScrollingAnimation(_: UIScrollView) { probeStrip() }
    func scrollViewDidEndDragging(_: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { probeStrip() }
    }
}
#endif

/// Needs you, as the needs-you tile is: a real button in the needs-you
/// tint, never coral. Chosen, the filter is on: its edge takes the
/// attention glyph's ink.
private final class NeedsYouToggle: UIControl {
    private let words = KitLabel(TypeScale.typeLabel, ink: Palette.statusAttnInk)
    private let count = KitLabel(TypeScale.typeLabel, ink: Palette.statusAttnInk)

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.statusAttnBg
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        words.text = "Needs you"
        count.tabular = true
        let row = UIStackView(arrangedSubviews: [GlyphView(.attention, size: Size.iconMd, tint: Palette.statusAttnGlyph), words, count])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: Size.cBtnHSm),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
        paint()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (toggle: NeedsYouToggle, _: UITraitCollection) in toggle.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NeedsYouToggle is built in code")
    }

    private var on = false

    func configure(count value: Int, on: Bool) {
        count.text = "\(value)"
        accessibilityLabel = "Needs you, \(value)"
        accessibilityTraits = on ? [.button, .selected] : .button
        guard on != self.on else { return }
        self.on = on
        Motion.easeOut.animator(Motion.durControl) { self.paint() }.startAnimation()
    }

    private func paint() {
        layer.borderColor = (on ? Palette.statusAttnGlyph : .clear).resolvedColor(with: traitCollection).cgColor
    }

    // `.touchUpInside` is where it acts; the bounds reach the touch floor.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: 0, dy: min(0, (bounds.height - Size.cBtnHLg) / 2)).contains(point)
    }

    override var isHighlighted: Bool {
        didSet { alpha = isHighlighted ? 0.8 : 1 }
    }
}

/// The places popover: each place's host, then its path cut from the left.
private final class PlacesList: KitPopoverController {
    private let rows: [(host: String, path: String)]

    init(_ rows: [(host: String, path: String)]) {
        self.rows = rows
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PlacesList is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let list = UIStackView(arrangedSubviews: rows.map { row in
            let host = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            host.text = row.host
            let path = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            path.text = row.path
            path.lineBreakMode = .byTruncatingHead
            let pair = UIStackView(arrangedSubviews: [host, path])
            pair.axis = .vertical
            pair.spacing = 2
            pair.isAccessibilityElement = true
            pair.accessibilityLabel = "\(row.host), \(row.path)"
            return pair
        })
        list.axis = .vertical
        list.spacing = Space.space2
        list.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(list)
        let inset = Space.space3 + 1
        NSLayoutConstraint.activate([
            list.topAnchor.constraint(equalTo: card.topAnchor, constant: inset),
            list.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: inset),
            list.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -inset),
        ])
        let width = min(320, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = list.systemLayoutSizeFitting(CGSize(width: width - inset * 2, height: 0), withHorizontalFittingPriority: .required,
                                                  verticalFittingPriority: .fittingSizeLevel).height + inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }
}

/// The project's name edited where it stands (ProjectHead.svelte): a field
/// in the title's type, its words where the name's were (a space-1 inset
/// pulled back by a space-1 overhang, as the web's), holding the name,
/// selected. Return, or leaving it, sends it; it stays, read-only, until the
/// hub has the name, then gives way to it. Escape puts the name back. A
/// refusal keeps what was typed, the hub's words under it, the field
/// focused; leaving it then puts the name back, the one way back a touch
/// screen with no Escape has.
@MainActor
final class ProjectNameEditor: UIView, UITextFieldDelegate {
    /// Sends the name; throws the hub's refusal.
    var save: ((String) async throws -> Void)?
    /// The editor has gone: the name stands again.
    var onEnd: (() -> Void)?

    private let field = NameField()
    private let problem = TaskSheetController.problemLabel()
    private var current = ""
    private var busy = false
    private var refused = false
    private var closing = false

    init() {
        super.init(frame: .zero)
        field.delegate = self
        field.accessibilityLabel = "Project name"
        field.accessibilityIdentifier = "project-name-field"
        field.returnKeyType = .done
        field.escape = { [weak self] in self?.close() }
        problem.accessibilityIdentifier = "project-name-problem"
        let column = UIStackView(arrangedSubviews: [field, problem])
        column.axis = .vertical
        column.spacing = Space.space1
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: -Space.space1),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: Space.space1),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectNameEditor is built in code")
    }

    func begin(_ name: String) {
        current = name
        busy = false
        refused = false
        closing = false
        field.text = name
        field.isEnabled = true
        field.textColor = Palette.inkStrong
        problem.isHidden = true
        isHidden = false
        field.becomeFirstResponder()
        field.selectAll(nil)
        #if DEBUG
        DispatchQueue.main.async { [field] in ProjectNameProbe.began(field) }
        #endif
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        commit()
        return false
    }

    func textFieldDidEndEditing(_: UITextField) {
        // Left after a refusal it puts the name back; otherwise leaving sends it.
        guard !busy, !closing else { return }
        if refused {
            close()
        } else {
            commit()
        }
    }

    private func commit() {
        guard !busy, !closing else { return }
        let next = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard next != current else {
            close()
            return
        }
        busy = true
        field.isEnabled = false
        field.textColor = Palette.inkMuted
        #if DEBUG
        ProjectNameProbe.say("commit \"\(next)\"")
        #endif
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await save?(next)
                close()
            } catch {
                busy = false
                refused = true
                field.isEnabled = true
                field.textColor = Palette.inkStrong
                problem.text = error.localizedDescription
                Motion.easeDrawer.animator(Motion.durMorph) { [self] in
                    problem.isHidden = false
                    superview?.layoutIfNeeded()
                }.startAnimation()
                UIAccessibility.post(notification: .announcement, argument: problem.text)
                field.becomeFirstResponder()
                #if DEBUG
                ProjectNameProbe.say("refused \"\(problem.text ?? "")\" shown=\(!problem.isHidden) id=\(problem.accessibilityIdentifier ?? "none") first=\(field.isFirstResponder)")
                #endif
            }
        }
    }

    private func close() {
        guard !closing else { return }
        closing = true
        #if DEBUG
        ProjectNameProbe.say("close")
        #endif
        if field.isFirstResponder { field.resignFirstResponder() }
        problem.isHidden = true
        isHidden = true
        onEnd?()
    }

    /// The title's type in a field: the raised surface, the control's edge
    /// (the focus ring while it has the caret), `radius-xs`.
    private final class NameField: UITextField {
        var escape: (() -> Void)?

        init() {
            super.init(frame: .zero)
            font = TypeScale.typeTitle.font
            textColor = Palette.inkStrong
            backgroundColor = Palette.surfaceRaised
            layer.cornerRadius = Radius.radiusXs
            layer.cornerCurve = .continuous
            autocorrectionType = .no
            spellCheckingType = .no
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (field: NameField, _: UITraitCollection) in field.paint() }
            paint()
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("NameField is built in code")
        }

        override func textRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: Space.space1, dy: 0) }
        override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: Space.space1, dy: 0) }

        override var keyCommands: [UIKeyCommand]? {
            [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escaped))]
        }

        @objc private func escaped() {
            #if DEBUG
            ProjectNameProbe.say("escape")
            #endif
            escape?()
        }

        @discardableResult
        override func becomeFirstResponder() -> Bool {
            defer { paint() }
            return super.becomeFirstResponder()
        }

        @discardableResult
        override func resignFirstResponder() -> Bool {
            defer { paint() }
            return super.resignFirstResponder()
        }

        private func paint() {
            layer.borderColor = (isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
            layer.borderWidth = isFirstResponder ? Size.focusRingWidth : 1
        }
    }
}

#if DEBUG
/// The project's name edited where it stands, as `ProjectName` lines
/// (scripts/probe-kit/specs/ios-project-row.ts): where the title's words
/// stood and the field's words stand, in the window's points; what the
/// field holds; each send, refusal, Escape and close; each name the title shows.
enum ProjectNameProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "ProjectName")

    static func say(_ line: String) {
        log.notice("name \(line, privacy: .public)")
    }

    private static func box(_ rect: CGRect) -> String {
        String(format: "%.1f,%.1f,%.1f,%.1f", rect.minX, rect.minY, rect.width, rect.height)
    }

    /// The title as it was tapped: its first line's box, its type, and what VoiceOver reads it as.
    static func tapped(_ label: UILabel) {
        let text = label.textRect(forBounds: label.bounds, limitedToNumberOfLines: 0)
        let top = (label.bounds.height - text.height) / 2
        let line = label.convert(CGRect(x: text.minX, y: top, width: text.width, height: label.font.lineHeight), to: nil)
        let traits = label.accessibilityTraits
        say("tap label font=\(label.font.pointSize) text=\(box(line)) header=\(traits.contains(.header)) button=\(traits.contains(.button)) hint=\(label.accessibilityHint ?? "none")")
    }

    /// The field in the title's place, laid out: what it holds, whether all of it is selected and it has the caret, its type, its words' box.
    static func began(_ field: UITextField) {
        field.window?.layoutIfNeeded()
        let rect = field.textRect(forBounds: field.bounds)
        let height = field.font?.lineHeight ?? 0
        let line = field.convert(CGRect(x: rect.minX, y: rect.midY - height / 2, width: rect.width, height: height), to: nil)
        let length = ((field.text ?? "") as NSString).length
        let selected = field.selectedTextRange.map {
            length > 0 && field.offset(from: field.beginningOfDocument, to: $0.start) == 0 && field.offset(from: $0.start, to: $0.end) == length
        } ?? false
        say("field id=\(field.accessibilityIdentifier ?? "none") text=\"\(field.text ?? "")\" selected=\(selected) first=\(field.isFirstResponder) font=\(field.font?.pointSize ?? 0) text-box=\(box(line))")
    }
}
#endif
