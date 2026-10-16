import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
import UIKit

/// A task, whole, in a sheet (tasks/TaskPane.svelte): its head stands still
/// (the facts line: its stage, Working or Queued, its dates, its labels at
/// the end; then its title), and under it a Review · Details switch while
/// there is a review: the task waits on you, a session handed in a result,
/// it names outputs, or its newest session failed or was stopped. Review is
/// TaskReviewView's bands, where only the stage scrolls; it opens there.
/// Details scroll: what else it needs from you, its description, acceptance
/// criteria, to-dos, labels, fields, relations and the sessions that worked
/// it, then what happened on it (its activity, with the comment box).
///
/// Every change is the hub's to make, so each waits for the hub's answer and
/// shows the task as the hub wrote it back; a refusal is said beside what it
/// refused, in the hub's own words.
final class TaskSheetController: UIViewController, UICollectionViewDelegate {
    nonisolated enum Part: Hashable, Sendable {
        case state, needs, description, acceptance, todos, labels, fields, relations, sessions, activity
    }

    nonisolated enum Item: Hashable, Sendable {
        case readProblem, skeleton, warnings, needs
        case description, acceptance
        case todosHead, todosProblem, todosEmpty
        case todo(String)
        /// The add field: `""` at the foot, a to-do's ref under that to-do.
        case todoAdd(String)
        case labels, fields, relations, sessions, activity
    }

    /// The sheet's width on a wide screen (`sm:max-w-2xl`).
    static let sheetWidth = 672.0

    /// Presents the sheet: medium and large detents on an iPhone, a form sheet
    /// the web pane's width on an iPad and the Mac.
    static func present(projectId: String, taskId: String, hub: HubConnection, home: HomeModel,
                        from presenter: UIViewController, openSession: @escaping (String) -> Void) {
        let sheet = TaskSheetController(projectId: projectId, taskId: taskId, hub: hub, home: home, openSession: openSession)
        if presenter.traitCollection.userInterfaceIdiom == .phone {
            sheet.modalPresentationStyle = .pageSheet
            if let controller = sheet.sheetPresentationController {
                // The review's decision stands at the foot: the sheet opens tall.
                controller.detents = [.medium(), .large()]
                controller.selectedDetentIdentifier = .large
                controller.prefersGrabberVisible = true
                controller.prefersScrollingExpandsWhenScrolledToEdge = true
            }
        } else {
            sheet.modalPresentationStyle = .formSheet
            sheet.preferredContentSize = CGSize(width: sheetWidth, height: presenter.view.window?.bounds.height ?? presenter.view.bounds.height)
        }
        // The dialog tray's corner (`--radius-modal`), not the system sheet's.
        sheet.sheetPresentationController?.preferredCornerRadius = Radius.radiusModal
        presenter.present(sheet, animated: true)
    }

    private let hub: HubConnection
    private let home: HomeModel
    private let projectId: String
    /// The task on show: an edge or a blocker shows another in its place.
    private var taskId: String
    private let openSessionAction: (String) -> Void

    private var task: TaskView?
    private var stages: StagesView?
    private var summaries: [TaskSummary] = []
    /// Its file's commits, for the activity; nil while they are read.
    private var history: [TaskHistoryEvent]?
    private var historyProblem: String?
    private var readProblem: String?
    private var titleProblem: String?
    private var stageProblem: String?
    private var edgeProblem: String?
    private var todoProblem: String?
    private var decided: String?
    private var moving = false
    /// Ticks shown before the hub has written them, by ref.
    private var ticking: [String: Bool] = [:]
    private var editingTodo: String?
    private var addingUnder: String?
    /// The switch's choice; nil: Review while there is one, else Details.
    private var picked: Int?
    /// Each row's space above it, as the parts and their gaps lay it out.
    private var tops: [Item: Double] = [:]

    // The head: the task's id over the facts line, the title, what refused, the switch.
    private let headView = UIView()
    private let head = UIStackView()
    private let idLabel = KitLabel(TaskSheetController.mono, ink: Palette.inkSubtle)
    private let meta = UIStackView()
    private let stagePicker = KitSelect(small: true)
    private let stageSkeleton = SkeletonView(height: Size.cBtnHSm)
    private let titleButton = UIControl()
    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    private let titleField = KitField()
    private let titleProblemLabel = TaskSheetController.problemLabel()
    private let decidedLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let stageProblemLabel = TaskSheetController.problemLabel()
    private let viewSwitch = KitSegmented(["Review", "Details"], selected: 0)
    private var closeButton: UIButton!
    /// The screen's foot under a phone's sheet (ScreenEdges.svelte `.edge-bottom`).
    private let foot = UIView()
    private lazy var footHeight = foot.heightAnchor.constraint(equalToConstant: 0)

    private lazy var review = TaskReviewView(context: .init(
        hub: hub, home: home, projectId: projectId, host: self,
        move: { [weak self] stage in
            guard let self else { throw TaskRefusal(message: "The task is closed.") }
            return try await moveTo(stage)
        },
        changed: { [weak self] next in self?.took(next) },
        openSession: { [weak self] id in self?.openSession(id) }))
    private var collection: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Part, Item>!

    // Rows that hold a field keep their view across renders.
    private lazy var descriptionPart = TaskTextPart(heading: "Description",
        empty: "Say what this task is for, so a session picking it up starts from it.") { [weak self] text in
        guard let self else { return }
        took(try await api().update(taskId, description: text))
    }
    private lazy var acceptancePart = TaskTextPart(heading: "Acceptance criteria",
        empty: "List what has to be true for this task to count as done.") { [weak self] text in
        guard let self else { return }
        took(try await api().update(taskId, acceptance: text))
    }
    private let labelsPart = TaskLabelsPart()
    private let fieldsPart = TaskFieldsPart()
    private let activityPart = TaskActivityPart()
    private let todoField = TaskSheetController.compactField("")
    private let footField = TaskSheetController.compactField("Add a to-do")
    private let underField = TaskSheetController.compactField("A step of it")
    #if DEBUG
    /// Reports the sheet's parts as `TaskSheet` lines once a second, those that changed.
    private var probe: Timer?
    #endif

    static let mono = TypeScale.typeCode.with(points: TypeScale.typeMeta.points)

    init(projectId: String, taskId: String, hub: HubConnection, home: HomeModel, openSession: @escaping (String) -> Void) {
        self.projectId = projectId
        self.taskId = taskId
        self.hub = hub
        self.home = home
        openSessionAction = openSession
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskSheetController is built in code")
    }

    private func api() throws -> ProjectTasks { try ProjectTasks(hub: hub, projectId: projectId) }

    private var now: Double { Date.now.timeIntervalSince1970 * 1000 }

    /// A session, the sheet put away first (TaskPane's Open, its sessions' rows).
    private func openSession(_ id: String) {
        let open = openSessionAction
        dismiss(animated: true) { open(id) }
    }

    /// What a task names the session that worked it by (tasks/session-name.ts):
    /// its title as the rail resolves it; `Its session` while the fleet has no row.
    static func sessionName(_ instanceId: String, hub: HubConnection) -> String {
        guard let row = hub.fleet.byId[instanceId] else { return "Its session" }
        return Naming.sessionTitle(title: row.title, cwd: row.cwd, id: row.id)
    }

    // MARK: Building

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        view.accessibilityIdentifier = "task-sheet"
        titleLabel.accessibilityIdentifier = "task-title"
        headView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headView)
        buildHead()

        var list = UICollectionLayoutListConfiguration(appearance: .plain)
        list.showsSeparators = false
        list.backgroundColor = .clear
        let config = list
        let layout = UICollectionViewCompositionalLayout { _, environment in
            NSCollectionLayoutSection.list(using: config, layoutEnvironment: environment)
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collection.translatesAutoresizingMaskIntoConstraints = false
        collection.backgroundColor = .clear
        collection.delegate = self
        collection.keyboardDismissMode = .interactive
        collection.accessibilityIdentifier = "task-details"
        collection.selfSizingInvalidation = .enabledIncludingConstraints
        // `pb-6` under the last part.
        collection.contentInset.bottom = Space.space6
        view.addSubview(collection)
        view.addSubview(review)

        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rule)
        NSLayoutConstraint.activate([
            headView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rule.topAnchor.constraint(equalTo: headView.bottomAnchor),
            rule.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            collection.topAnchor.constraint(equalTo: rule.bottomAnchor),
            collection.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            // Both end over the keyboard while it stands: the comment box and
            // Send back's note at their foot stay where they are typed in.
            collection.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            review.topAnchor.constraint(equalTo: rule.bottomAnchor),
            review.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            review.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            review.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])

        foot.backgroundColor = Palette.surfaceRaised
        foot.isUserInteractionEnabled = false
        foot.accessibilityIdentifier = "task-sheet-foot"
        foot.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(foot)
        NSLayoutConstraint.activate([
            foot.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            foot.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            foot.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            footHeight,
        ])

        let cell = UICollectionView.CellRegistration<HostCell, Item> { [weak self] cell, _, item in
            guard let self else { return }
            cell.host(rowView(for: item), top: tops[item] ?? Space.space2)
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collection) { collection, indexPath, item in
            collection.dequeueConfiguredReusableCell(using: cell, for: indexPath, item: item)
        }
        wireFields()
        render()
        Task { await load() }
    }

    private func buildHead() {
        // The task's id at the head's start, the sheet's close at its end (SideSurface's title and close).
        idLabel.accessibilityIdentifier = "task-id"
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.dismiss(animated: true) }
        closeButton.accessibilityLabel = "Close"
        closeButton.accessibilityIdentifier = "task-close"
        let top = UIStackView(arrangedSubviews: [idLabel, UIView(), closeButton])
        top.alignment = .center

        head.axis = .vertical
        head.spacing = Space.space2
        head.translatesAutoresizingMaskIntoConstraints = false
        headView.addSubview(head)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: headView.topAnchor, constant: Space.space3),
            head.leadingAnchor.constraint(equalTo: headView.leadingAnchor, constant: Space.space5),
            head.trailingAnchor.constraint(equalTo: headView.trailingAnchor, constant: -Space.space4),
            head.bottomAnchor.constraint(equalTo: headView.bottomAnchor, constant: -Space.space3),
        ])

        meta.axis = .vertical
        meta.accessibilityIdentifier = "task-facts"
        titleLabel.wrap = .balance
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleButton.addSubview(titleLabel)
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: titleButton.topAnchor, constant: Space.space1),
            titleLabel.bottomAnchor.constraint(equalTo: titleButton.bottomAnchor, constant: -Space.space1),
            titleLabel.leadingAnchor.constraint(equalTo: titleButton.leadingAnchor),
            titleLabel.trailingAnchor.constraint(equalTo: titleButton.trailingAnchor, constant: -Space.space1),
        ])
        titleButton.accessibilityTraits = .button
        titleButton.accessibilityHint = "Edit the title"
        titleButton.isAccessibilityElement = true
        titleButton.addAction(UIAction { [weak self] _ in self?.editTitle() }, for: .touchUpInside)
        titleField.font = TypeScale.typeTitle.font
        titleField.accessibilityLabel = "Title"
        titleField.isHidden = true
        stageSkeleton.widthAnchor.constraint(equalToConstant: 96).isActive = true
        stagePicker.accessibilityLabel = "Stage"
        decidedLabel.accessibilityIdentifier = "task-decided"
        decidedLabel.isHidden = true
        viewSwitch.accessibilityLabel = "Review or details"
        viewSwitch.accessibilityIdentifier = "task-view-switch"
        viewSwitch.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            picked = viewSwitch.selectedIndex
            render()
        }, for: .valueChanged)
        for part in [top, meta, titleButton, titleField, titleProblemLabel, decidedLabel, stageProblemLabel, Self.leading(viewSwitch)] as [UIView] {
            head.addArrangedSubview(part)
        }
        head.setCustomSpacing(Space.space1, after: top)
    }

    private func wireFields() {
        titleField.addAction(UIAction { [weak self] _ in self?.saveTitle() }, for: .editingDidEnd)
        titleField.addAction(UIAction { [weak self] _ in self?.titleField.resignFirstResponder() }, for: .primaryActionTriggered)
        todoField.addAction(UIAction { [weak self] _ in self?.saveTodoEdit() }, for: .editingDidEnd)
        todoField.addAction(UIAction { [weak self] _ in self?.todoField.resignFirstResponder() }, for: .primaryActionTriggered)
        footField.addAction(UIAction { [weak self] _ in self?.addTodo(under: "") }, for: .primaryActionTriggered)
        underField.addAction(UIAction { [weak self] _ in self?.addTodo(under: self?.addingUnder ?? "") }, for: .primaryActionTriggered)
        // An add-under field left empty closes (the web's Escape).
        underField.addAction(UIAction { [weak self] _ in
            guard let self, underField.text?.trimmingCharacters(in: .whitespaces).isEmpty != false else { return }
            addingUnder = nil
            render()
        }, for: .editingDidEnd)
        for field in [footField, underField] {
            field.addAction(UIAction { [weak self] _ in self?.render() }, for: .editingChanged)
        }
        let resize: () -> Void = { [weak self] in self?.collection.collectionViewLayout.invalidateLayout() }
        descriptionPart.onResize = resize
        acceptancePart.onResize = resize
        labelsPart.onResize = resize
        fieldsPart.onResize = resize
        activityPart.onResize = resize
        labelsPart.onChange = { [weak self] labels in
            guard let self else { return }
            took(try await api().update(taskId, labels: labels))
        }
        fieldsPart.onSave = { [weak self] change in
            guard let self else { return }
            took(try await api().update(taskId, fields: change))
        }
        activityPart.onComment = { [weak self] text in
            guard let self else { return }
            took(try await api().comment(taskId, text: text))
        }
        activityPart.onReread = { [weak self] in
            guard let self else { return }
            Task { await self.readActivity(self.taskId) }
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        // Only a phone's sheet stands on the screen's foot; a wider screen's sheet has none.
        let safe = view.safeAreaInsets.bottom
        footHeight.constant = traitCollection.userInterfaceIdiom == .phone && safe > 0 ? max(12, safe) - 7 : 0
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if DEBUG
        probe = probe ?? Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let body = self.collection else { return }
                TaskSheetProbe.report(self.view, body: body)
            }
        }
        #endif
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard isBeingDismissed || presentingViewController == nil else { return }
        #if DEBUG
        probe?.invalidate()
        probe = nil
        #endif
    }

    // MARK: Reading

    private func load() async {
        let id = taskId
        readProblem = nil
        Task { await readActivity(id) }
        do {
            let api = try api()
            async let read = api.read(id)
            async let stages = try? api.stages()
            async let list = try? api.list()
            let fresh = try await read
            guard id == taskId else { return }
            task = fresh
            self.stages = await stages
            summaries = await list?.tasks ?? []
        } catch {
            if id == taskId { readProblem = error.localizedDescription }
        }
        render()
        await readDecided()
    }

    /// Its file's history; a refusal is said over the activity, in the hub's words.
    private func readActivity(_ id: String) async {
        historyProblem = nil
        do {
            let events = try await api().history(id)
            if id == taskId { history = events }
        } catch {
            if id == taskId { historyProblem = error.localizedDescription }
        }
        render()
    }

    /// The decision this task was made from: the page's title and the card's question, as its record has them.
    private func readDecided() async {
        decided = nil
        guard let task, let named = TaskWords.decided(task) else { return render() }
        guard let found = try? await api().decision(named.page), task.id == taskId else { return }
        let question = found.record?.cards.first { $0.id == named.card }?.question
        decided = "Decided on " + (question.map { "\(found.title) › \($0)" } ?? found.title)
        render()
    }

    /// Every write answers with the task as the hub wrote it, and is a commit in its history.
    private func took(_ next: TaskView) {
        guard next.id == taskId else { return }
        task = next
        render()
        Task { await readActivity(next.id) }
    }

    /// Another task in this one's place (an edge, a blocker).
    private func show(task id: String) {
        guard id != taskId else { return }
        taskId = id
        task = nil
        history = nil
        picked = nil
        decided = nil
        titleProblem = nil
        stageProblem = nil
        edgeProblem = nil
        todoProblem = nil
        render()
        Task { await load() }
    }

    // MARK: Rendering

    /// It has a review to draw: it waits on you, it has a result or outputs,
    /// or its newest session failed or was stopped (Try again is there).
    private var reviewable: Bool {
        guard let task else { return false }
        return task.kind == .you || TaskWords.review(of: task) != nil
            || ((task.lastAttemptFailed || task.lastAttemptStopped) && !task.liveAttempt)
    }

    private var reviewing: Bool { (picked ?? (reviewable ? 0 : 1)) == 0 && reviewable }

    private func render() {
        renderHead()
        let onReview = task != nil && readProblem == nil && reviewing
        review.isHidden = !onReview
        collection.isHidden = onReview
        if onReview, let task { review.show(task, stages: stages) }

        var parts: [(Part, [Item])] = []
        if readProblem != nil {
            parts = [(.state, [.readProblem])]
        } else if let task {
            if !onReview {
                if !needsAsks(task).isEmpty || !task.blockedBy.isEmpty { parts.append((.needs, [.needs])) }
                if !task.problems.isEmpty { parts.append((.state, [.warnings])) }
                descriptionPart.text = task.description
                acceptancePart.text = task.acceptance
                parts.append((.description, [.description]))
                parts.append((.acceptance, [.acceptance]))
                var todos: [Item] = [.todosHead]
                if todoProblem != nil { todos.append(.todosProblem) }
                if task.todos.isEmpty { todos.append(.todosEmpty) }
                for todo in task.todos {
                    todos.append(.todo(todo.path))
                    if addingUnder == todo.ref { todos.append(.todoAdd(todo.ref)) }
                }
                todos.append(.todoAdd(""))
                parts.append((.todos, todos))
                labelsPart.show(task.labels, known: Array(Set(summaries.flatMap(\.labels))).sorted())
                parts.append((.labels, [.labels]))
                fieldsPart.show(TaskWords.fields(task))
                parts.append((.fields, [.fields]))
                parts.append((.relations, [.relations]))
                if !task.attempts.isEmpty || task.startProblem != nil { parts.append((.sessions, [.sessions])) }
                activityPart.show(comments: task.comments, history: history, problem: historyProblem, reaches: reaches(task))
                parts.append((.activity, [.activity]))
            }
        } else {
            parts = [(.state, [.skeleton])]
        }

        // Each part starts `gap-5` under the one before (`pt-3` before the first); within a part, its own gaps.
        tops = [:]
        for (index, (part, items)) in parts.enumerated() {
            for (at, item) in items.enumerated() {
                tops[item] = at == 0 ? (index == 0 ? Space.space3 : Space.space5) : gap(before: item, in: part)
            }
        }
        var snapshot = NSDiffableDataSourceSnapshot<Part, Item>()
        for (part, items) in parts {
            snapshot.appendSections([part])
            snapshot.appendItems(items, toSection: part)
        }
        // Rows that stay are drawn again from the task as it now is.
        snapshot.reconfigureItems(snapshot.itemIdentifiers.filter { dataSource.indexPath(for: $0) != nil })
        dataSource.apply(snapshot, animatingDifferences: collection.window != nil && !UIAccessibility.isReduceMotionEnabled)
    }

    /// The space over a part's row past its first.
    private func gap(before item: Item, in part: Part) -> Double {
        guard part == .todos else { return Space.space2 }
        switch item {
        case .todo: return 0
        case let .todoAdd(under): return under.isEmpty && task?.todos.isEmpty == false ? Space.space2 : 0
        default: return Space.space2
        }
    }

    /// Where a comment goes past the file (TaskActivity `reaches`).
    private func reaches(_ task: TaskView) -> TaskActivityPart.Reaches? {
        if let live = task.attempts.first(where: { $0.state == .starting || $0.state == .running }) {
            return .live(Self.sessionName(live.instanceId, hub: hub))
        }
        let open = task.kind != .done && task.kind != .dropped
        return !task.attempts.isEmpty && open ? .resumes : nil
    }

    /// The asks its attempts' sessions stand on, parked on you (needs.svelte.ts `asksOf`).
    private func needsAsks(_ task: TaskView) -> [ParkedAsk] {
        let sessions = Set(task.attempts.map(\.instanceId))
        return sessions.flatMap { hub.needs.parked[$0] ?? [] }.filter { $0.routedTo == nil }
    }

    private func renderHead() {
        let shown = task
        idLabel.text = taskId
        titleLabel.text = shown?.title ?? summaries.first { $0.id == taskId }?.title ?? ""
        titleButton.isEnabled = shown != nil
        titleButton.accessibilityLabel = shown?.title
        show(titleProblem, in: titleProblemLabel)
        show(stageProblem, in: stageProblemLabel)
        decidedLabel.text = decided
        decidedLabel.isHidden = decided == nil

        // The facts line: the stage (a picker), Working or Queued, its dates, its labels at the end.
        meta.arrangedSubviews.forEach { $0.removeFromSuperview() }
        var facts: [UIView] = []
        if let shown {
            stagePicker.setValue(TaskWords.stage(shown.stage))
            stagePicker.isEnabled = !moving
            stagePicker.menu = stageMenu(shown)
            facts.append(stagePicker)
            if shown.liveAttempt {
                facts.append(KitBadge("Working", variant: .live, glyph: .working))
            } else if shown.queuedStart {
                facts.append(KitBadge("Queued", variant: .secondary))
            }
            let dates = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            dates.text = "Created \(Self.timestamp(shown.createdAt)) · Updated \(RailAge.ago(shown.updatedAt, now: now))"
            dates.accessibilityIdentifier = "task-dates"
            facts.append(dates)
            for label in shown.labels {
                let badge = KitBadge(label, variant: .secondary)
                badge.accessibilityIdentifier = "task-fact-label-\(label)"
                facts.append(badge)
            }
        } else if readProblem == nil {
            facts.append(stageSkeleton)
        }
        meta.addArrangedSubview(WrapLayout(facts, gap: Space.space2, rowGap: Space.space2, centred: true))
        viewSwitch.superview?.isHidden = !reviewable
        viewSwitch.select(reviewing ? 0 : 1, animated: false)
    }

    /// The moves the project's stages allow you from where the task is; the
    /// rest are listed, disabled, so the stages read in order. Kind `you`
    /// carries the needs-you mark.
    private func stageMenu(_ shown: TaskView) -> UIMenu {
        let allowed = stages.map { TaskWords.moves($0, from: shown.stage) } ?? []
        let actions = (stages?.stages ?? []).map { stage in
            let image = stage.kind == .you ? Glyph.attention.image.resized(to: Size.iconMd).withTintColor(Palette.statusAttnGlyph, renderingMode: .alwaysOriginal) : nil
            let action = UIAction(title: TaskWords.stage(stage.name), image: image) { [weak self] _ in self?.move(stage.name) }
            action.state = stage.name == shown.stage ? .on : .off
            if stage.name != shown.stage && !allowed.contains(stage.name) { action.attributes = .disabled }
            return action
        }
        return UIMenu(children: actions)
    }

    private func rowView(for item: Item) -> UIView {
        guard let task else {
            if item == .readProblem { return readProblemView() }
            return skeletonView()
        }
        switch item {
        case .readProblem: return readProblemView()
        case .skeleton: return skeletonView()
        case .warnings: return KitAlert(task.problems.joined(separator: " "), tone: .warning)
        case .needs: return needsView(task)
        case .description: return descriptionPart
        case .acceptance: return acceptancePart
        case .todosHead:
            let done = task.todos.filter { ticking[$0.ref] ?? $0.done }.count
            return Self.sectionHead("To-dos", count: task.todos.isEmpty ? nil : "\(done)/\(task.todos.count)")
        case .todosProblem: return Self.problemLabel(todoProblem)
        case .todosEmpty:
            let line = KitLabel(TypeScale.typeBody, ink: Palette.inkSubtle, lines: 0)
            line.text = "Break the task into steps here; a session working on it ticks them as it goes."
            return line
        case let .todo(path):
            guard let todo = task.todos.first(where: { $0.path == path }) else { return UIView() }
            return todoRow(todo)
        case let .todoAdd(under): return addRow(under: under, depth: under.isEmpty ? 0 : (task.todos.first { $0.ref == under }.map { Int($0.depth) + 1 } ?? 1))
        case .labels: return labelsPart
        case .fields: return fieldsPart
        case .relations: return relationsView(task)
        case .sessions: return sessionsView(task)
        case .activity: return activityPart
        }
    }

    private func readProblemView() -> UIView {
        let alert = KitAlert(readProblem ?? "", tone: .destructive)
        let retry = KitButton.make("Retry", variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            readProblem = nil
            render()
            Task { await self.load() }
        }
        let stack = UIStackView(arrangedSubviews: [alert, Self.leading(retry)])
        stack.axis = .vertical
        stack.spacing = Space.space2
        return stack
    }

    private func skeletonView() -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.alignment = .leading
        // `h-24 w-full`, then `h-4 w-1/3` and three lines (TaskPane's skeleton).
        let bars: [(Double, Double)] = [(96, 1), (16, 1 / 3), (14, 1), (14, 11 / 12), (14, 3 / 5)]
        for (height, share) in bars {
            let bar = SkeletonView(height: height)
            stack.addArrangedSubview(bar)
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: share).isActive = true
        }
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Loading"
        return stack
    }

    // MARK: What else it needs from you (tasks/TaskNeeds.svelte)

    /// Its session asks you something, with Answer, which opens the session
    /// where the ask stands; it waits on tasks that have not landed, quiet,
    /// each with Open. (Its failed session is the review's to say.)
    private func needsView(_ task: TaskView) -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.accessibilityIdentifier = "task-needs"
        for ask in needsAsks(task) {
            let when = ask.raisedAt.map { RailAge.ago($0, now: now) } ?? ""
            let line = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            line.text = ask.presentation.summary
            let answer = KitButton.make("Answer", variant: .action, height: .sm) { [weak self] in self?.openSession(ask.instanceId) }
            stack.addArrangedSubview(needsCard(glyph: .attention, tint: Palette.statusAttnGlyph, title: "Its session asks you", when: when,
                                               body: [line, Self.leading(answer)], quiet: false))
        }
        if !task.blockedBy.isEmpty {
            let rows = task.blockedBy.map { id -> UIView in
                let open = KitButton.make("Open", variant: .ghost, height: .xs) { [weak self] in self?.show(task: id) }
                return ref(id, trailing: open)
            }
            let title = task.blockedBy.count == 1 ? "Waits on a task that has not landed" : "Waits on \(task.blockedBy.count) tasks that have not landed"
            stack.addArrangedSubview(needsCard(glyph: .lock, tint: Palette.inkMuted, title: title, when: "", body: rows, quiet: true))
        }
        return stack
    }

    /// `.needs`: the needs-you wash and edge; `.quiet`: the recess and a hairline.
    private func needsCard(glyph: Glyph, tint: UIColor, title: String, when: String, body: [UIView], quiet: Bool) -> UIView {
        let mark = GlyphView(glyph, size: Size.iconSm, tint: tint)
        let heading = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        heading.text = title
        let time = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        time.text = when
        time.setContentHuggingPriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [mark, heading, time])
        head.spacing = Space.space2
        head.alignment = .center
        let card = UIStackView(arrangedSubviews: [head] + body)
        card.axis = .vertical
        card.spacing = Space.space3
        card.isLayoutMarginsRelativeArrangement = true
        card.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space4, bottom: Space.space4, trailing: Space.space4)
        card.layer.cornerRadius = Radius.radiusMd
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.backgroundColor = quiet ? Palette.surfaceRecess : Palette.statusAttnBg.withAlphaComponent(0.45)
        card.layer.borderColor = (quiet ? Palette.borderHairline : Palette.statusAttnGlyph.withAlphaComponent(0.4)).resolvedColor(with: traitCollection).cgColor
        return card
    }

    // MARK: Relations (tasks/TaskRelations.svelte)

    /// After and Parent always stand; Related, Found in, Duplicate of,
    /// Children and Waited on by only when it has one. One Link ▾ sets any
    /// edge: pick which, then the task. Children and Waited on by are the
    /// other tasks' edges, opened, not unlinked, here.
    private func relationsView(_ task: TaskView) -> UIView {
        let candidates = summaries.filter { $0.id != task.id && !task.after.contains($0.id) && !task.related.contains($0.id) && $0.id != task.parent }
        let link = KitButton.make("Link", glyph: .link, variant: .ghost, height: .xs) {}
        link.accessibilityIdentifier = "task-relations-link"
        link.showsMenuAsPrimaryAction = true
        link.menu = UIMenu(children: ProjectTasks.Edge.allCases.map { edge in
            UIMenu(title: edge.name, children: candidates.isEmpty
                ? [UIAction(title: "No task matches.", attributes: .disabled) { _ in }]
                : candidates.map { other in
                    UIAction(title: other.title, subtitle: other.id) { [weak self] _ in self?.link(edge, to: other.id) }
                })
        })
        let stack = UIStackView(arrangedSubviews: [Self.sectionHead("Relations", count: nil, trailing: link)])
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.accessibilityIdentifier = "task-relations"
        let children = summaries.filter { $0.parent == task.id }.map(\.id)
        let waitedOnBy = summaries.filter { $0.after.contains(task.id) }.map(\.id)
        let rows: [(String, [String], ProjectTasks.Edge?)] = [
            ("After", task.after, .after),
            ("Parent", task.parent.map { [$0] } ?? [], .parent),
        ] + (task.related.isEmpty ? [] : [("Related", task.related, .related)])
            + (task.foundIn.map { [("Found in", [$0], .foundIn)] } ?? [])
            + (task.duplicateOf.map { [("Duplicate of", [$0], .duplicateOf)] } ?? [])
            + (children.isEmpty ? [] : [("Children", children, nil)])
            + (waitedOnBy.isEmpty ? [] : [("Waited on by", waitedOnBy, nil)])
        for (name, ids, edge) in rows {
            let items: [UIView] = ids.isEmpty ? [Self.none()] : ids.map { id in
                guard let edge else { return ref(id, trailing: nil) }
                let unlink = KitButton.make("", glyph: .close, variant: .ghost, height: .xs) { [weak self] in self?.link(edge, to: id, remove: true) }
                unlink.accessibilityLabel = "Unlink \(id)"
                return ref(id, trailing: unlink)
            }
            stack.addArrangedSubview(edgeRow(name, items))
        }
        if let edgeProblem { stack.addArrangedSubview(Self.problemLabel(edgeProblem)) }
        return stack
    }

    private static func none() -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
        label.text = "None"
        let wrap = UIStackView(arrangedSubviews: [label])
        wrap.isLayoutMarginsRelativeArrangement = true
        wrap.directionalLayoutMargins.top = Space.space1
        return wrap
    }

    /// `grid-template-columns: 6rem 1fr`: the edge's name, then its tasks.
    private func edgeRow(_ name: String, _ items: [UIView]) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = name
        let nameColumn = UIStackView(arrangedSubviews: [label, UIView()])
        nameColumn.axis = .vertical
        nameColumn.isLayoutMarginsRelativeArrangement = true
        nameColumn.directionalLayoutMargins.top = Space.space1
        nameColumn.widthAnchor.constraint(equalToConstant: 96).isActive = true
        let list = UIStackView(arrangedSubviews: items)
        list.axis = .vertical
        list.spacing = Space.space1
        let row = UIStackView(arrangedSubviews: [nameColumn, list])
        row.spacing = Space.space2
        row.alignment = .top
        return row
    }

    /// A task named by its id and, when known, its title; a press shows it here in this one's place.
    private func ref(_ id: String, trailing: UIView?) -> UIView {
        let press = TaskPressRow(lines: 1)
        let words = NSMutableAttributedString(string: id, attributes: Self.mono.attributes(color: Palette.inkMuted))
        if let title = summaries.first(where: { $0.id == id })?.title {
            words.append(NSAttributedString(string: "  \(title)", attributes: TypeScale.typeLabel.attributes(color: Palette.inkStrong)))
        }
        press.label.attributedText = words
        press.label.lineBreakMode = .byTruncatingTail
        press.inset(NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2, bottom: Space.space1, trailing: Space.space2))
        press.accessibilityHint = "Show this task"
        press.addAction(UIAction { [weak self] _ in self?.show(task: id) }, for: .primaryActionTriggered)
        let row = UIStackView(arrangedSubviews: [press] + (trailing.map { [$0] } ?? []))
        row.spacing = Space.space1
        row.alignment = .center
        trailing?.setContentHuggingPriority(.required, for: .horizontal)
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins.trailing = Space.space1
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        return row
    }

    private func link(_ edge: ProjectTasks.Edge, to: String, remove: Bool = false) {
        edgeProblem = nil
        Task {
            do { took(try await api().link(taskId, edge: edge, to: to, remove: remove)) } catch {
                edgeProblem = error.localizedDescription
                render()
            }
        }
    }

    // MARK: Sessions

    /// One row per session that worked it, opening that session: its mark,
    /// name, word, when, and how it ended on its own line.
    private func sessionsView(_ task: TaskView) -> UIView {
        let stack = UIStackView(arrangedSubviews: [Self.sectionHead("Sessions", count: task.attempts.isEmpty ? nil : "\(task.attempts.count)")])
        stack.axis = .vertical
        stack.spacing = Space.space1
        stack.setCustomSpacing(Space.space2, after: stack.arrangedSubviews[0])
        stack.accessibilityIdentifier = "task-sessions"
        if let problem = task.startProblem { stack.addArrangedSubview(Self.problemLabel(problem)) }
        for attempt in task.attempts {
            let word = TaskWords.attemptWord(attempt.state)
            let (variant, status): (KitBadge.Variant, MarkStatus) = switch word {
            case "Working": (.live, .live)
            case "Done": (.done, .done)
            case "Failed": (.fail, .fail)
            default: (.secondary, .idle)
            }
            let mark = SessionMarkView()
            mark.configure(id: attempt.instanceId, place: hub.fleet.byId[attempt.instanceId]?.cwd ?? attempt.instanceId, status: status)
            mark.isUserInteractionEnabled = false
            let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            name.text = Self.sessionName(attempt.instanceId, hub: hub)
            name.lineBreakMode = .byTruncatingTail
            name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let badge = KitBadge(word, variant: variant, glyph: word == "Failed" ? .failed : nil)
            let when = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            when.text = RailAge.ago(attempt.endedAt ?? attempt.startedAt, now: now)
            for fixed in [mark, badge, when] as [UIView] { fixed.setContentHuggingPriority(.required, for: .horizontal) }
            let line = UIStackView(arrangedSubviews: [mark, name, badge, UIView(), when])
            line.spacing = Space.space2
            line.alignment = .center
            let column = UIStackView(arrangedSubviews: [line])
            column.axis = .vertical
            column.spacing = Space.space1
            if let how = attempt.endedHow {
                let ended = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                ended.lineBreakMode = .byCharWrapping
                ended.text = how
                column.addArrangedSubview(ended)
            }
            column.isUserInteractionEnabled = false
            let row = TaskPressRow(lines: 1)
            row.label.isHidden = true
            row.backgroundColor = Palette.surfaceRecess
            row.layer.cornerRadius = Radius.radiusSm
            column.translatesAutoresizingMaskIntoConstraints = false
            row.addSubview(column)
            NSLayoutConstraint.activate([
                column.topAnchor.constraint(equalTo: row.topAnchor, constant: Space.space2),
                column.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -Space.space2),
                column.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: Space.space3),
                column.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -Space.space3),
            ])
            row.accessibilityLabel = "\(name.text ?? ""), \(word)"
            row.accessibilityIdentifier = "task-session-\(attempt.workItemId)"
            row.addAction(UIAction { [weak self] _ in self?.openSession(attempt.instanceId) }, for: .primaryActionTriggered)
            stack.addArrangedSubview(row)
        }
        return stack
    }

    // MARK: Title and stage

    private func editTitle() {
        guard let task else { return }
        titleField.text = task.title
        titleButton.isHidden = true
        titleField.isHidden = false
        titleField.becomeFirstResponder()
    }

    private func saveTitle() {
        guard let task, !titleField.isHidden else { return }
        let text = (titleField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        titleField.isHidden = true
        titleButton.isHidden = false
        guard !text.isEmpty, text != task.title else { return }
        titleProblem = nil
        Task {
            do { took(try await api().update(taskId, title: text)) } catch {
                titleProblem = error.localizedDescription
                render()
            }
        }
    }

    /// A move; the moved task is shown, and its history read again.
    private func moveTo(_ stage: String) async throws -> TaskView {
        let moved = try await api().move(taskId, to: stage)
        took(moved)
        return moved
    }

    private func move(_ stage: String) {
        guard let task, stage != task.stage else { return }
        moving = true
        stageProblem = nil
        render()
        Task {
            do { _ = try await moveTo(stage) } catch { stageProblem = error.localizedDescription }
            moving = false
            render()
        }
    }

    // MARK: To-dos (tasks/TodoList.svelte)

    private func todoRow(_ todo: TaskTodo) -> UIView {
        let ref = todo.ref
        let checked = ticking[ref] ?? todo.done
        let box = TaskCheckbox(checked: checked)
        box.accessibilityLabel = todo.text
        box.addAction(UIAction { [weak self] _ in self?.toggle(todo, to: !checked) }, for: .primaryActionTriggered)
        let row = UIStackView(arrangedSubviews: [box])
        row.spacing = Space.space2
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins.leading = Double(todo.depth) * Space.space6
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        if editingTodo == ref {
            row.addArrangedSubview(todoField)
            return row
        }
        let words = NSMutableAttributedString()
        if todo.proposed {
            words.append(NSAttributedString(string: "Proposed  ", attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
        }
        var body = TypeScale.typeBody.attributes(color: checked ? Palette.inkSubtle : Palette.inkStrong)
        if checked {
            body[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            body[.strikethroughColor] = Palette.borderControl
        }
        words.append(NSAttributedString(string: todo.text, attributes: body))
        if let promoted = todo.promoted {
            words.append(NSAttributedString(string: "  → \(promoted)", attributes: Self.mono.attributes(color: Palette.inkMuted)))
        }
        let text = TaskPressRow(lines: 0)
        text.label.attributedText = words
        text.accessibilityHint = "Edit this to-do"
        text.addAction(UIAction { [weak self] _ in self?.editTodo(todo) }, for: .primaryActionTriggered)
        let under = KitButton.make("", glyph: .plus, variant: .ghost, height: .xs) { [weak self] in self?.openAdd(under: ref) }
        under.accessibilityLabel = "Add a to-do under “\(todo.text)”"
        under.setContentHuggingPriority(.required, for: .horizontal)
        row.addArrangedSubview(text)
        row.addArrangedSubview(under)
        return row
    }

    private func addRow(under: String, depth: Int) -> UIView {
        let field = under.isEmpty ? footField : underField
        field.accessibilityLabel = under.isEmpty ? "Add a to-do" : "Add a to-do under \(under)"
        let text = (field.text ?? "").trimmingCharacters(in: .whitespaces)
        let add = KitButton.make("", glyph: .plus, variant: .ghost, height: .sm) { [weak self] in self?.addTodo(under: under) }
        add.accessibilityLabel = "Add to-do"
        add.isEnabled = !text.isEmpty
        add.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [field, add])
        row.spacing = Space.space2
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins.leading = Double(depth) * Space.space6
        return row
    }

    private func toggle(_ todo: TaskTodo, to next: Bool) {
        let ref = todo.ref
        ticking[ref] = next
        todoProblem = nil
        render()
        Task {
            do { took(try await api().changeTodo(taskId, todo: ref, done: next)) } catch { todoProblem = error.localizedDescription }
            ticking[ref] = nil
            render()
        }
    }

    private func editTodo(_ todo: TaskTodo) {
        editingTodo = todo.ref
        todoField.text = todo.text
        todoField.accessibilityLabel = "To-do"
        render()
        DispatchQueue.main.async { [weak self] in self?.todoField.becomeFirstResponder() }
    }

    private func saveTodoEdit() {
        guard let ref = editingTodo, let todo = task?.todos.first(where: { $0.ref == ref }) else { return }
        let text = (todoField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != todo.text else {
            editingTodo = nil
            render()
            return
        }
        todoProblem = nil
        Task {
            do {
                took(try await api().changeTodo(taskId, todo: ref, text: text))
                editingTodo = nil
            } catch { todoProblem = error.localizedDescription }
            render()
        }
    }

    private func openAdd(under ref: String) {
        addingUnder = ref
        underField.text = ""
        render()
        DispatchQueue.main.async { [weak self] in self?.underField.becomeFirstResponder() }
    }

    private func addTodo(under: String) {
        let field = under.isEmpty ? footField : underField
        let text = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        todoProblem = nil
        Task {
            do {
                took(try await api().addTodo(taskId, text: text, under: under.isEmpty ? nil : under))
                field.text = ""
                if !under.isEmpty {
                    addingUnder = nil
                    underField.resignFirstResponder()
                }
            } catch { todoProblem = error.localizedDescription }
            render()
        }
    }

    // MARK: Small parts

    func collectionView(_: UICollectionView, shouldHighlightItemAt _: IndexPath) -> Bool { false }

    private func show(_ problem: String?, in label: KitLabel) {
        label.text = problem
        label.isHidden = problem == nil
    }

    /// time.ts `formatTimestamp` from ms epoch, as Safari renders its en-US
    /// `toLocaleString` (month short, day, hour, minute): "Oct 13 at 11:15 AM".
    static func timestamp(_ ms: Double) -> String {
        Date(timeIntervalSince1970: ms / 1000).formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(Locale(identifier: "en_US")))
    }

    static func problemLabel(_ text: String? = nil) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
        label.text = text
        label.isHidden = text == nil
        label.accessibilityTraits = .staticText
        return label
    }

    /// `kit-section-head`: label type in muted ink over the seam, a count at its end.
    static func sectionHead(_ title: String, count: String?, trailing: UIView? = nil) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = title
        label.accessibilityTraits = .header
        let row = UIStackView(arrangedSubviews: [label, UIView()])
        row.alignment = .center
        row.spacing = Space.space1
        if let count {
            let number = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
            number.tabular = true
            number.text = count
            row.addArrangedSubview(number)
        }
        if let trailing { row.addArrangedSubview(trailing) }
        // `padding-bottom: space-1` over the 1pt seam; at least `c-btn-h-xs` tall, all in.
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins.bottom = Space.space1 + 1
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHXs).isActive = true
        let seam = UIView()
        seam.backgroundColor = Palette.seam
        seam.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(seam)
        NSLayoutConstraint.activate([
            seam.heightAnchor.constraint(equalToConstant: 1),
            seam.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            seam.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            seam.bottomAnchor.constraint(equalTo: row.bottomAnchor),
        ])
        return row
    }

    /// A control at its own width at the row's start (`self-start`).
    static func leading(_ view: UIView) -> UIView {
        let row = UIStackView(arrangedSubviews: [view, UIView()])
        row.alignment = .center
        return row
    }

    /// The kit's Input at the small control height in label type (`h-[var(--c-btn-h-sm)] text-label`).
    static func compactField(_ placeholder: String) -> KitField {
        let field = KitField(placeholder: placeholder)
        field.font = TypeScale.typeLabel.font
        field.constraints.first { $0.firstAttribute == .height }?.constant = Size.cBtnHSm
        field.autocorrectionType = .default
        field.autocapitalizationType = .sentences
        field.returnKeyType = .done
        return field
    }
}
