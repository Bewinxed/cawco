import CawCoAPI
import CawCoCore
import CawCoDesign
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
        /// A project's own view, by its name.
        case custom(String)

        static let fixed: [Tab] = [.board, .table, .pipeline]

        /// The tab's name (`viewLabel`: a view's name as a stage's is said).
        var label: String {
            switch self {
            case .board: "Board"
            case .table: "Table"
            case .pipeline: "Pipeline"
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
    private var headTop: NSLayoutConstraint!
    private var headLeading: NSLayoutConstraint!
    private var headTrailing: NSLayoutConstraint!

    // Notices, the strip and the pane.
    private let notices = UIStackView()
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
    private let pane = UIView()
    private let board = TaskBoardView()
    private let scroller = UIScrollView()
    private let column = UIStackView()
    private let table = TaskTableView()
    private let pipeline = PipelineView()
    private var custom: ProjectViewPane!
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

        let safe = view.safeAreaLayoutGuide
        let page = UIStackView(arrangedSubviews: [head, notices, strip])
        page.axis = .vertical
        page.translatesAutoresizingMaskIntoConstraints = false
        notices.axis = .vertical
        notices.spacing = Space.space3
        notices.isLayoutMarginsRelativeArrangement = true
        view.addSubview(page)
        view.addSubview(pane)
        // The head and the strip stand at their content's height: the pane,
        // which has none of its own, takes the rest. Without this pull the
        // board's pane left the head free to stretch.
        let snug = page.heightAnchor.constraint(equalToConstant: 0)
        snug.priority = .fittingSizeLevel
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
            }
        }
        if context.hub.state == .connected {
            Task { await store.refresh() }
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
        name.accessibilityTraits = .header
        who.addArrangedSubview(name)
        who.addArrangedSubview(line)
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
        head.addArrangedSubview(who)
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
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        for part in [tabsScroll, rule, needs, newTask!, rest] as [UIView] { strip.addArrangedSubview(part) }
        for part in [needs, newTask!] as [UIView] {
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
        custom.keep = { [weak self] name in try await self?.store.keepView(name) }
        custom.discard = { [weak self] name in
            guard let self else { return }
            try await store.discardView(name)
            choose(.board)
        }
        custom.isHidden = true
        pane.addSubview(custom)

        board.translatesAutoresizingMaskIntoConstraints = false
        pane.addSubview(board)
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
            board.topAnchor.constraint(equalTo: pane.topAnchor),
            board.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            board.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            board.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
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
    }

    private func showHead(_ project: ProjectRow, fleet: FleetStore) {
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
        stripTabs = Tab.fixed + views.map { Tab.custom($0.name) }
        let items = stripTabs.map { tab in
            if case let .custom(name) = tab, views.first(where: { $0.name == name })?.draft == true {
                return SegmentedTabs.Item(tab.label, badge: "draft")
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
        // Under 640pt New task is in the head's ⋯; the rule stands only while Needs you follows it.
        newTask.isHidden = !stripped || phone
        rule.isHidden = phone ? waiting == 0 : (waiting == 0 && !stripped)
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
        /// Which of the pane's three surfaces shows: the board, the column (the
        /// table, the pipeline, a state), or a project's own view.
        var surface: UIView = scroller
        var what: String

        if case let .custom(name) = shownTab, let shown = views.first(where: { $0.name == name }) {
            what = "view:\(name)"
            surface = custom
            custom.show(shown, projectId: projectId)
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
            switch shownTab {
            case .board, .custom:
                what = "board"
                surface = board
                boardForm.stage = store.newIn ?? ""
                boardForm.setOpen(adding, announce: false)
                let kinds = Dictionary(tasks.map { ($0.id, $0.kind) }, uniquingKeysWith: { first, _ in first })
                board.show(stages: shownStages, tasks: shownTasks, newIn: store.newIn, foot: boardForm, kindOf: kinds,
                           moving: Set(store.moving.keys), refused: refusals.mapValues(\.reason))
            case .table:
                what = "table"
                if adding {
                    tableForm.stage = store.newIn ?? ""
                    tableForm.stages = stages
                    column.addArrangedSubview(tableAdd)
                }
                tableForm.setOpen(adding, announce: false)
                table.show(stages: stages, tasks: shownTasks)
                column.addArrangedSubview(table)
            case .pipeline:
                what = "pipeline"
                pipeline.show(stages: stages, tasks: shownTasks, phone: phone)
                column.addArrangedSubview(pipeline)
            }
        }
        // The panes cross over each other as the view changes.
        if what != shown {
            let first = shown == nil
            shown = what
            let showing = surface
            let place: @MainActor @Sendable () -> Void = {
                for each in [self.board, self.scroller, self.custom!] as [UIView] { each.isHidden = each !== showing }
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
        board.inset = leading
        custom.inset(leading: leading, trailing: trailing)
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
        context.openTask(projectId, taskId)
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
                action.state = each == shown ? .on : .off
                return action
            }
            sections.append(UIMenu(title: "View", options: .displayInline, children: views))
            sections.append(UIMenu(options: .displayInline, children: [UIAction(title: "New task", image: Glyph.plus.image) { [weak self] _ in
                self?.choose(.board)
                self?.setAdding(true)
            }]))
        }
        if store.stages?.source == .template {
            sections.append(UIMenu(options: .displayInline, children: [UIAction(title: "Pick stages…") { [weak self] _ in self?.pickStages() }]))
        }
        sections.append(UIMenu(options: .displayInline, children: [UIAction(title: "Forget project…", attributes: .destructive) { [weak self] _ in
            guard let self, let project else { return }
            context.forgetProject(project, more)
        }]))
        return sections
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
            return "\(item.label)\(item.badge.map { "+\($0)" } ?? "")@\(Int(box.midX.rounded())),\(Int(box.midY.rounded()))"
        }.joined(separator: ";")
        let room = tabsScroll.convert(tabsScroll.bounds, to: nil)
        var line = "views strip chosen=\(shownTab.label) phone=\(phone) room=\(Int(room.minX.rounded()))-\(Int(room.maxX.rounded())) items=\(items)"
        if phone, let list = moreMenu().first as? UIMenu {
            line += " more=\(ViewsProbe.centre(more)) menu=" + list.children.compactMap { $0 as? UIAction }.map {
                "\($0.title)\($0.subtitle.map { "+\($0)" } ?? "")\($0.state == .on ? "*" : "")"
            }.joined(separator: ";")
        }
        guard line != probedStrip else { return }
        probedStrip = line
        ViewsProbe.say(line)
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
