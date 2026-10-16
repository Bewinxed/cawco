import CawCoCore
import CawCoDesign
import CawCoTranscript
import OSLog
import UIKit
import WebKit

/// A task, whole, in a sheet, read to review it (tasks/TaskSheet.svelte):
/// what its attempts handed in (its result, each output drawn as the thing
/// it is), its attempts and their transcripts, then its description,
/// acceptance criteria, to-dos and edges. Every part says what it is: the
/// header's facts are named, its labels are labels (badges, which take no
/// press) and its actions are buttons with a verb.
///
/// Every change is the hub's to make, so each waits for the hub's answer and
/// shows the task as the hub wrote it back; a refusal is said beside what it
/// refused, in the hub's own words. The header stays; under it the parts are
/// one list, a section each.
///
/// An attempt's transcript opens under it; expanded, it takes a pane of its
/// own at the sheet's full height, beside the task on a wide window and over
/// it on a narrow one, and the sheet widens to hold both.
final class TaskSheetController: UIViewController, UICollectionViewDelegate {
    nonisolated enum Part: Hashable, Sendable {
        case state, result, attempts, description, acceptance, todos, edges
    }

    nonisolated enum Item: Hashable, Sendable {
        case readProblem, skeleton, warnings
        case resultHead, report
        /// An output by the name the task file gives it.
        case output(String)
        case attemptsHead, attemptTabs, attemptLine, transcript, startProblem
        case description, acceptance
        case todosHead, todosProblem, todosEmpty
        case todo(String)
        /// The add field: `""` at the foot, a to-do's ref under that to-do.
        case todoAdd(String)
        case edges
    }

    /// The sheet's width at rest (`sm:max-w-2xl`).
    static let sheetWidth = 672.0
    /// The window width from which an expanded transcript stands beside the review (`width >= 64rem`).
    static let splitWidth = 1024.0

    /// Presents the sheet: medium and large detents on an iPhone, a form sheet
    /// the web sheet's width on an iPad and the Mac.
    static func present(projectId: String, taskId: String, attempt: String?, hub: HubConnection,
                        from presenter: UIViewController, openSession: @escaping (String) -> Void) {
        let sheet = TaskSheetController(projectId: projectId, taskId: taskId, attempt: attempt, hub: hub, openSession: openSession)
        if presenter.traitCollection.userInterfaceIdiom == .phone {
            sheet.modalPresentationStyle = .pageSheet
            if let controller = sheet.sheetPresentationController {
                controller.detents = [.medium(), .large()]
                // An attempt is read under the result: the sheet opens tall enough to show it.
                controller.selectedDetentIdentifier = attempt == nil ? .medium : .large
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
    private let projectId: String
    private let taskId: String
    private var scrollTo: String?
    private let openSession: (String) -> Void

    private var task: TaskView?
    private var stages: StagesView?
    private var summaries: [TaskSummary] = []
    private var readProblem: String?
    private var titleProblem: String?
    private var stageProblem: String?
    private var edgeProblem: String?
    private var todoProblem: String?
    private var tryProblem: String?
    private var moving = false
    private var trying = false
    /// Ticks shown before the hub has written them, by ref.
    private var ticking: [String: Bool] = [:]
    private var editingTodo: String?
    private var addingUnder: String?
    /// The attempt shown, by work item; nil: the newest.
    private var chosenAttempt: String?
    /// The shown attempt's transcript is in its own pane at the sheet's height.
    private var expanded = false
    /// Each row's space above it, as the parts and their gaps lay it out.
    private var tops: [Item: Double] = [:]

    // The header: the task's number and dates, the title, what refused, its facts.
    private let review = UIView()
    private let head = UIStackView()
    private let numberLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    /// "Created <date> · Updated <relative>", beside the number (`.dates`).
    private let datesLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private lazy var meta = WrapLayout([numberLabel, datesLabel], gap: Space.space2, centred: true)
    private let stagePicker = KitSelect(small: true)
    private let stageSkeleton = SkeletonView(height: Size.cBtnHSm)
    private let titleButton = UIControl()
    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    private let titleField = KitField()
    private let titleProblemLabel = TaskSheetController.problemLabel()
    private let stageProblemLabel = TaskSheetController.problemLabel()
    private let facts = UIStackView()
    private var closeButton: UIButton!
    /// The screen's foot under a phone's sheet (ScreenEdges.svelte `.edge-bottom`:
    /// a bottom sheet is the bottom edge itself): the sheet's surface over the
    /// home indicator's band, so words scroll away under it rather than
    /// behind the indicator. `max(12px, safe area)` tall, set 7px past the
    /// screen's edge, so that much less of it shows.
    private let foot = UIView()
    private lazy var footHeight = foot.heightAnchor.constraint(equalToConstant: 0)

    private var collection: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Part, Item>!

    // The frame: the review alone, or the expanded transcript's pane beside it or over it.
    private let splitRule = UIView()
    private var reviewFill: [NSLayoutConstraint] = []
    private var reviewSplit: [NSLayoutConstraint] = []
    private var sideBeside: [NSLayoutConstraint] = []
    private var sideOver: [NSLayoutConstraint] = []
    private var laidWide: Bool?

    // Rows that hold a field, load or follow a session keep their view across renders.
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
    private let todoField = TaskSheetController.compactField("")
    private let footField = TaskSheetController.compactField("Add a to-do")
    private let underField = TaskSheetController.compactField("A step of it")
    private var reportCard: (key: String, view: UIView)?
    /// Each output's view, by the attempt that handed it in and its name.
    private var outputViews: [String: TaskOutputView] = [:]
    private var attemptTabs: (ids: [String], view: KitSegmented)?
    private var inlinePane: AttemptTranscriptPane?
    private var sidePane: AttemptTranscriptPane?
    /// Ticks while an attempt is live, so its sentence counts on ("Working for 2 min").
    private var clock: Timer?
    #if DEBUG
    /// Reports the sheet's parts as `TaskSheet` lines once a second, those that changed.
    private var probe: Timer?
    #endif

    static let mono = TypeScale.typeCode.with(points: TypeScale.typeMeta.points)

    init(projectId: String, taskId: String, attempt: String?, hub: HubConnection, openSession: @escaping (String) -> Void) {
        self.projectId = projectId
        self.taskId = taskId
        scrollTo = attempt
        chosenAttempt = attempt
        self.hub = hub
        self.openSession = openSession
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskSheetController is built in code")
    }

    private func api() throws -> ProjectTasks { try ProjectTasks(hub: hub, projectId: projectId) }

    private var now: Double { Date().timeIntervalSince1970 * 1000 }

    // MARK: Building

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        view.accessibilityIdentifier = "task-sheet"
        review.accessibilityIdentifier = "task-review"
        titleLabel.accessibilityIdentifier = "task-title"
        review.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(review)
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
        collection.accessibilityIdentifier = "task-sheet-body"
        // A row whose field, text or loaded output grows takes its new height at once.
        collection.selfSizingInvalidation = .enabledIncludingConstraints
        // `pb-6` under the last part.
        collection.contentInset.bottom = Space.space6
        review.addSubview(collection)

        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        review.addSubview(rule)
        // The review's own edge when the transcript stands beside it (`border-inline-start`).
        splitRule.backgroundColor = Palette.borderHairline
        splitRule.translatesAutoresizingMaskIntoConstraints = false
        splitRule.isHidden = true
        review.addSubview(splitRule)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: review.safeAreaLayoutGuide.topAnchor, constant: Space.space5),
            head.leadingAnchor.constraint(equalTo: review.leadingAnchor, constant: Space.space5),
            head.trailingAnchor.constraint(equalTo: review.trailingAnchor, constant: -Space.space5),
            rule.topAnchor.constraint(equalTo: head.bottomAnchor, constant: Space.space3),
            rule.leadingAnchor.constraint(equalTo: review.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: review.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            collection.topAnchor.constraint(equalTo: rule.bottomAnchor),
            collection.leadingAnchor.constraint(equalTo: review.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: review.trailingAnchor),
            collection.bottomAnchor.constraint(equalTo: review.bottomAnchor),
            splitRule.topAnchor.constraint(equalTo: review.topAnchor),
            splitRule.bottomAnchor.constraint(equalTo: review.bottomAnchor),
            splitRule.leadingAnchor.constraint(equalTo: review.leadingAnchor),
            splitRule.widthAnchor.constraint(equalToConstant: 1),
        ])

        // The sheet's close (`absolute top-4 right-4`, ghost `icon-sm`): over whichever pane is in front.
        closeButton = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.dismiss(animated: true) }
        closeButton.accessibilityLabel = "Close"
        closeButton.accessibilityIdentifier = "task-close"
        view.addSubview(closeButton)
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: Space.space4),
            closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space4),
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

        reviewFill = [
            review.topAnchor.constraint(equalTo: view.topAnchor),
            review.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            review.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            review.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ]
        // The review takes 40% of the sheet, between 26rem and 42rem (`clamp(26rem, 40%, 42rem)`).
        let share = review.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.4)
        share.priority = .defaultHigh
        reviewSplit = [
            review.topAnchor.constraint(equalTo: view.topAnchor),
            review.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            review.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            share,
            review.widthAnchor.constraint(greaterThanOrEqualToConstant: 416),
            review.widthAnchor.constraint(lessThanOrEqualToConstant: Self.sheetWidth),
        ]
        NSLayoutConstraint.activate(reviewFill)

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
        head.axis = .vertical
        head.spacing = Space.space2
        head.translatesAutoresizingMaskIntoConstraints = false
        review.addSubview(head)

        // `.meta`: the number and the dates, wrapping, clear of the close (`padding-inline-end: space-8`).
        numberLabel.tabular = true
        numberLabel.accessibilityIdentifier = "task-number"
        let metaRow = UIView()
        meta.translatesAutoresizingMaskIntoConstraints = false
        metaRow.addSubview(meta)
        NSLayoutConstraint.activate([
            meta.topAnchor.constraint(equalTo: metaRow.topAnchor),
            meta.bottomAnchor.constraint(equalTo: metaRow.bottomAnchor),
            meta.leadingAnchor.constraint(equalTo: metaRow.leadingAnchor),
            meta.trailingAnchor.constraint(equalTo: metaRow.trailingAnchor, constant: -Space.space8),
        ])
        head.addArrangedSubview(metaRow)

        // The title edits in place (`title-button`): a tap opens the field.
        titleLabel.wrap = .balance
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleButton.addSubview(titleLabel)
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: titleButton.topAnchor, constant: Space.space1),
            titleLabel.bottomAnchor.constraint(equalTo: titleButton.bottomAnchor, constant: -Space.space1),
            titleLabel.leadingAnchor.constraint(equalTo: titleButton.leadingAnchor),
            titleLabel.trailingAnchor.constraint(equalTo: titleButton.trailingAnchor),
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
        facts.axis = .vertical
        facts.spacing = Space.space2
        facts.accessibilityIdentifier = "task-facts"
        for part in [titleButton, titleField, titleProblemLabel, facts, stageProblemLabel] as [UIView] {
            head.addArrangedSubview(part)
        }
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
        for part in [descriptionPart, acceptancePart] {
            part.onResize = { [weak self] in self?.collection.collectionViewLayout.invalidateLayout() }
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        // Only a phone's sheet stands on the screen's foot; a wider screen's sheet is a side sheet, which has none.
        let safe = view.safeAreaInsets.bottom
        footHeight.constant = traitCollection.userInterfaceIdiom == .phone && safe > 0 ? max(12, safe) - 7 : 0
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // The window crossed `64rem`: the expanded transcript moves beside the review or over it.
        if expanded, wide != laidWide { layoutFrame() }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        tick()
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
        clock?.invalidate()
        clock = nil
        inlinePane?.close()
        sidePane?.close()
    }

    // MARK: Reading

    private func load() async {
        readProblem = nil
        do {
            let api = try api()
            async let read = api.read(taskId)
            async let stages = try? api.stages()
            async let list = try? api.list()
            task = try await read
            self.stages = await stages
            summaries = await list?.tasks ?? []
        } catch {
            readProblem = error.localizedDescription
        }
        render()
    }

    /// Every write answers with the task as the hub wrote it.
    private func took(_ next: TaskView) {
        task = next
        render()
    }

    // MARK: Rendering

    private func render() {
        renderHead()
        var parts: [(Part, [Item])] = []
        if readProblem != nil {
            parts = [(.state, [.readProblem])]
        } else if let task {
            if !task.problems.isEmpty { parts.append((.state, [.warnings])) }
            if task.result != nil || !task.outputs.isEmpty {
                var items: [Item] = [.resultHead]
                if task.result != nil { items.append(.report) }
                if handedIn(task) { items += task.outputs.map(Item.output) }
                parts.append((.result, items))
            }
            if !task.attempts.isEmpty {
                parts.append((.attempts, [.attemptsHead] + (task.attempts.count > 1 ? [.attemptTabs] : []) + [.attemptLine, .transcript]))
            } else if task.startProblem != nil {
                parts.append((.attempts, [.startProblem]))
            }
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
            parts.append((.edges, [.edges]))
        } else {
            parts = [(.state, [.skeleton])]
        }

        // Each part starts `gap-5` under the one before (`pt-4` before the first); within a part, its own gaps.
        tops = [:]
        for (index, (part, items)) in parts.enumerated() {
            for (at, item) in items.enumerated() {
                tops[item] = at == 0 ? (index == 0 ? Space.space4 : Space.space5) : gap(before: item, at: at, in: part)
            }
        }

        syncSide()
        var snapshot = NSDiffableDataSourceSnapshot<Part, Item>()
        for (part, items) in parts {
            snapshot.appendSections([part])
            snapshot.appendItems(items, toSection: part)
        }
        // Rows that stay are drawn again from the task as it now is.
        snapshot.reconfigureItems(snapshot.itemIdentifiers.filter { dataSource.indexPath(for: $0) != nil })
        dataSource.apply(snapshot, animatingDifferences: collection.window != nil && !UIAccessibility.isReduceMotionEnabled) { [weak self] in
            self?.scrollToAttempt()
        }
        tick()
    }

    /// The space over a part's row past its first.
    private func gap(before item: Item, at: Int, in part: Part) -> Double {
        switch part {
        // The results stand `gap-2` under the part's head, `gap-4` apart.
        case .result: at == 1 ? Space.space2 : Space.space4
        // The attempts part's rows are `gap-3` apart; the transcript is `gap-2` under its attempt.
        case .attempts: item == .transcript ? Space.space2 : Space.space3
        case .todos:
            switch item {
            case .todo: 0
            case let .todoAdd(under): under.isEmpty && task?.todos.isEmpty == false ? Space.space2 : 0
            default: Space.space2
            }
        default: Space.space2
        }
    }

    /// An attempt has finished, so its outputs are in the project's folder.
    private func handedIn(_ task: TaskView) -> Bool {
        task.attempts.contains { $0.state == .done }
    }

    /// The attempt shown and what it is called ("Attempt 2": the oldest is the first).
    private func shownAttempt(_ task: TaskView) -> (attempt: TaskAttempt, index: Int, name: String)? {
        let index = max(0, task.attempts.firstIndex { $0.workItemId == chosenAttempt } ?? 0)
        guard task.attempts.indices.contains(index) else { return nil }
        return (task.attempts[index], index, "Attempt \(task.attempts.count - index)")
    }

    /// An `attempt` push lands on its attempt once the task is read.
    private func scrollToAttempt() {
        guard scrollTo != nil, task != nil else { return }
        scrollTo = nil
        guard let path = dataSource.indexPath(for: .attemptLine) else { return }
        collection.layoutIfNeeded()
        collection.scrollToItem(at: path, at: .top, animated: false)
    }

    /// Draws the rows given again, as they stand now.
    private func reconfigure(_ items: [Item]) {
        var snapshot = dataSource.snapshot()
        let present = items.filter { snapshot.indexOfItem($0) != nil }
        guard !present.isEmpty else { return }
        snapshot.reconfigureItems(present)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    /// A live attempt's sentence counts on once a second while the sheet is up (`tickingClock`).
    private func tick() {
        let live = task?.liveAttempt == true && view.window != nil
        if live, clock == nil {
            clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.reconfigure([.attemptLine]) }
            }
        } else if !live {
            clock?.invalidate()
            clock = nil
        }
    }

    private func renderHead() {
        let shown = task
        titleLabel.text = shown?.title ?? ""
        titleButton.isEnabled = shown != nil
        titleButton.accessibilityLabel = shown?.title
        show(titleProblem, in: titleProblemLabel)
        show(stageProblem, in: stageProblemLabel)
        numberLabel.text = shown.map { "Task \(Int($0.number))" } ?? ""
        datesLabel.text = ""
        if let shown {
            let updated = RailAge.ago(shown.updatedAt, now: now)
            datesLabel.text = "Created \(Self.timestamp(shown.createdAt)) · Updated \(updated)"
        }
        meta.invalidateIntrinsicContentSize()
        meta.setNeedsLayout()

        // The task's facts, each under its name: the stage is a picker (a
        // control), the rest are labels (badges, which take no press).
        facts.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let shown {
            stagePicker.setValue(TaskWords.stage(shown.stage))
            stagePicker.isEnabled = !moving
            stagePicker.menu = stageMenu(shown)
        }
        // The shape of a stage still coming; once the read has answered, with
        // the task or with why it could not be read, no shape is left waiting.
        if shown != nil {
            facts.addArrangedSubview(factRow("Stage", Self.leading(stagePicker)))
        } else if readProblem == nil {
            facts.addArrangedSubview(factRow("Stage", Self.leading(stageSkeleton)))
        }
        guard let shown else { return }
        var status: [UIView] = []
        if shown.needsYou { status.append(KitBadge("Needs you", variant: .attn, glyph: .attention)) }
        if shown.liveAttempt {
            status.append(KitBadge("An attempt is working", variant: .live, glyph: .working))
        } else if shown.lastAttemptFailed {
            status.append(KitBadge("Last attempt failed", variant: .fail, glyph: .failed))
        } else if shown.lastAttemptStopped {
            status.append(KitBadge("Last attempt stopped", variant: .secondary, glyph: .stop))
        } else if shown.queuedStart {
            status.append(KitBadge("Waiting for a free slot", variant: .secondary, glyph: .clock))
        }
        if !status.isEmpty { facts.addArrangedSubview(factRow("Status", WrapLayout(status, gap: Space.space1))) }
        if !shown.blockedBy.isEmpty {
            let badges = shown.blockedBy.map { id in
                let badge = KitBadge(id, variant: .secondary, glyph: .lock)
                badge.accessibilityHint = summaries.first { $0.id == id }?.title
                return badge as UIView
            }
            facts.addArrangedSubview(factRow("Waits on", WrapLayout(badges, gap: Space.space1)))
        }
        if !shown.labels.isEmpty {
            facts.addArrangedSubview(factRow("Labels", WrapLayout(shown.labels.map { KitBadge($0, variant: .secondary) }, gap: Space.space1)))
        }
    }

    /// One fact: its name in label type over the `4.5rem` column, its value beside it, centred on each other.
    private func factRow(_ name: String, _ value: UIView) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = name
        label.widthAnchor.constraint(equalToConstant: 72).isActive = true
        label.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [label, value])
        row.spacing = Space.space2
        row.alignment = .center
        row.accessibilityIdentifier = "task-fact-\(name.lowercased().replacing(" ", with: "-"))"
        return row
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
        case .resultHead: return resultHead(task)
        case .report: return reportView(task)
        case let .output(name): return outputView(name, task: task)
        case .attemptsHead: return attemptsHead(task)
        case .attemptTabs: return tabsView(task)
        case .attemptLine: return attemptLine(task)
        case .transcript: return transcriptRow(task)
        case .startProblem: return Self.problemLabel(task.startProblem)
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
        case .edges: return edgesView(task)
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
        // `h-4 w-1/3`, three lines, then a heading and two controls (TaskSheet's skeleton).
        let bars: [(Double, Double)] = [(16, 1 / 3), (14, 1), (14, 11 / 12), (14, 3 / 5), (16, 1 / 4), (Size.cBtnHSm, 1), (Size.cBtnHSm, 1)]
        for (index, (height, share)) in bars.enumerated() {
            let bar = SkeletonView(height: height)
            stack.addArrangedSubview(bar)
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: share).isActive = true
            if index == 4 { stack.setCustomSpacing(Space.space4 + Space.space2, after: stack.arrangedSubviews[3]) }
        }
        stack.isAccessibilityElement = true
        stack.accessibilityLabel = "Loading"
        return stack
    }

    // MARK: Result (TaskSheet.svelte `data-task-result`)

    /// "Result" and what it is: which attempt reported it and when, or what will be there.
    private func resultHead(_ task: TaskView) -> UIView {
        let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        if let result = task.result {
            let who = task.attempts.firstIndex { $0.workItemId == result.workItemId }.map { "Attempt \(task.attempts.count - $0)" } ?? "The attempt"
            hint.text = "\(who) finished \(RailAge.ago(result.at, now: now)) and handed this in."
        } else {
            hint.text = handedIn(task) ? "What the finished attempt handed in." : "What an attempt hands in shows here once one finishes."
        }
        hint.accessibilityIdentifier = "task-result-hint"
        let stack = UIStackView(arrangedSubviews: [Self.sectionHead("Result", count: nil), hint])
        stack.axis = .vertical
        stack.accessibilityIdentifier = "task-result"
        return stack
    }

    /// The attempt's own report, leading: its headline, then its summary as markdown.
    private func reportView(_ task: TaskView) -> UIView {
        guard let result = task.result else { return UIView() }
        let key = "\(result.workItemId)\u{0}\(result.headline ?? "")\u{0}\(result.report)"
        if let reportCard, reportCard.key == key { return reportCard.view }
        let card = ResultCard(glyph: .report, kind: "Report")
        card.accessibilityIdentifier = "task-report"
        var content: [UIView] = []
        if let headline = result.headline {
            // `.lead`: body type at the strong weight, read first.
            let lead = KitLabel(TypeScale.typeBody.withWeight(TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
            lead.wrap = .pretty
            lead.text = headline
            content.append(lead)
        }
        let body = MarkdownDocumentView(message: true)
        body.setSource(result.report)
        content.append(body)
        card.setContent(content)
        reportCard = (key, card)
        return card
    }

    private func outputView(_ name: String, task: TaskView) -> UIView {
        let key = "\(task.result?.workItemId ?? "")\u{0}\(name)"
        if let kept = outputViews[key] { return kept }
        let projectId = projectId
        let taskId = taskId
        let hub = hub
        let view = TaskOutputView(name: name) {
            try await ProjectTasks(hub: hub, projectId: projectId).readOutput(taskId, name: name)
        }
        outputViews[key] = view
        return view
    }

    // MARK: Attempts (tasks/TaskAttempts.svelte)

    /// "Attempts", what an attempt is and how many there were, and Try again whenever none runs.
    private func attemptsHead(_ task: TaskView) -> UIView {
        let count = task.attempts.count
        let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        hint.text = "Each attempt is one session's try at this task. " + (count == 1 ? "It has had 1." : "It has had \(count).")
        hint.accessibilityIdentifier = "task-attempts-hint"
        let words = UIStackView(arrangedSubviews: [Self.sectionHead("Attempts", count: nil), hint])
        words.axis = .vertical
        var again: UIView?
        if !task.liveAttempt {
            let button = KitButton.make(trying ? "Starting…" : "Try again", glyph: .refresh, variant: .outline, height: .sm) { [weak self] in
                self?.tryAgain()
            }
            button.isEnabled = !trying
            button.accessibilityIdentifier = "task-try-again"
            again = button
        }
        // `.words { flex: 1 1 14rem }`; the button wraps under them where both do not fit.
        let line = FlexRow(lead: words, trail: again, basis: 224, gap: Space.space4, rowGap: Space.space2)
        let stack = UIStackView(arrangedSubviews: [line])
        stack.axis = .vertical
        stack.spacing = Space.space3
        stack.accessibilityIdentifier = "task-attempts"
        for problem in [tryProblem, task.startProblem] {
            if let problem { stack.addArrangedSubview(Self.problemLabel(problem)) }
        }
        return stack
    }

    /// Tabs past one attempt, newest first, at their own width (`Tabs.List`, `self-start`).
    private func tabsView(_ task: TaskView) -> UIView {
        let ids = task.attempts.map(\.workItemId)
        let index = shownAttempt(task)?.index ?? 0
        if let attemptTabs, attemptTabs.ids == ids {
            attemptTabs.view.select(index)
            return Self.leading(attemptTabs.view)
        }
        let tabs = KitSegmented(ids.indices.map { "Attempt \(ids.count - $0)" }, selected: index)
        tabs.accessibilityLabel = "Attempts"
        tabs.accessibilityIdentifier = "task-attempt-tabs"
        tabs.addAction(UIAction { [weak self, weak tabs] _ in
            guard let self, let chosen = tabs?.selectedIndex, let task = self.task, task.attempts.indices.contains(chosen) else { return }
            chosenAttempt = task.attempts[chosen].workItemId
            render()
        }, for: .valueChanged)
        attemptTabs = (ids, tabs)
        return Self.leading(tabs)
    }

    /// The shown attempt: its name (alone, with no tabs), its state in plain
    /// words with how long it took, when it started, how it ended, and what
    /// it said it did where the Result does not already say it.
    private func attemptLine(_ task: TaskView) -> UIView {
        guard let (attempt, _, name) = shownAttempt(task) else { return UIView() }
        var items: [UIView] = []
        if task.attempts.count == 1 {
            let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            label.text = name
            items.append(label)
        }
        let said = TaskWords.attempt(attempt, now: now)
        let (variant, glyph): (KitBadge.Variant, Glyph) = switch said.tone {
        case .live: (.live, .working)
        case .done: (.done, .passed)
        case .fail: (.fail, .failed)
        case .idle: (.secondary, .stop)
        }
        let badge = KitBadge(said.text, variant: variant, glyph: glyph)
        badge.accessibilityIdentifier = "task-attempt-status"
        items.append(badge)
        let started = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        started.text = "Started \(Self.timestamp(attempt.startedAt))"
        items.append(started)
        let stack = UIStackView(arrangedSubviews: [WrapLayout(items, gap: Space.space3, rowGap: Space.space2, centred: true)])
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.accessibilityIdentifier = "task-attempt"
        // How it ended when it did not land; what it said it did, where the Result's report is another attempt's.
        var ended: [(id: String, words: String)] = []
        if let how = attempt.endedHow { ended.append(("task-attempt-how", how)) }
        if let headline = attempt.headline, task.result?.workItemId != attempt.workItemId { ended.append(("task-attempt-headline", headline)) }
        for (id, words) in ended {
            let line = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            line.lineBreakMode = .byCharWrapping
            line.text = words
            line.accessibilityIdentifier = id
            stack.addArrangedSubview(line)
        }
        return stack
    }

    /// The shown attempt's transcript in its pane, or where it went.
    private func transcriptRow(_ task: TaskView) -> UIView {
        guard let (attempt, _, name) = shownAttempt(task) else { return UIView() }
        if expanded {
            let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
            hint.text = "\(name)'s transcript is open in its own pane."
            hint.accessibilityIdentifier = "task-transcript-moved"
            return hint
        }
        if inlinePane?.instanceId != attempt.instanceId {
            inlinePane?.close()
            inlinePane = pane(attempt, name: name, expanded: false)
        }
        inlinePane?.attempt = name
        return inlinePane ?? UIView()
    }

    private func pane(_ attempt: TaskAttempt, name: String, expanded: Bool) -> AttemptTranscriptPane {
        let pane = AttemptTranscriptPane(hub: hub, instanceId: attempt.instanceId, attempt: name, expanded: expanded)
        pane.onToggle = { [weak self] in self?.setExpanded(!expanded) }
        pane.onOpenSession = { [weak self] id in
            guard let self else { return }
            let open = openSession
            dismiss(animated: true) { open(id) }
        }
        return pane
    }

    /// Try again: a retry in the last attempt's workspace when it failed or
    /// was stopped (`retryTask`), a fresh attempt when it finished
    /// (`startAttempt`); the hub's refusal under the button in its own words.
    private func tryAgain() {
        guard let task, !trying else { return }
        let retry = task.lastAttemptFailed || task.lastAttemptStopped
        trying = true
        tryProblem = nil
        render()
        Task {
            do {
                let api = try api()
                if retry { try await api.retry(taskId) } else { try await api.startAttempt(taskId) }
                let fresh = try await api.read(taskId)
                chosenAttempt = nil
                self.task = fresh
            } catch { tryProblem = error.localizedDescription }
            trying = false
            render()
        }
    }

    // MARK: The frame: the transcript expanded

    private var wide: Bool { (view.window?.bounds.width ?? view.bounds.width) >= Self.splitWidth }

    private func setExpanded(_ open: Bool) {
        expanded = open
        render()
        layoutFrame()
    }

    /// The expanded pane follows the shown attempt; collapsed, or with no attempt, it goes.
    private func syncSide() {
        let shown = task.flatMap(shownAttempt)
        guard expanded, let shown else {
            if expanded { expanded = false }
            guard let sidePane else { return }
            sidePane.close()
            sidePane.removeFromSuperview()
            self.sidePane = nil
            layoutFrame()
            return
        }
        if let sidePane, sidePane.instanceId == shown.attempt.instanceId {
            sidePane.attempt = shown.name
            return
        }
        sidePane?.close()
        sidePane?.removeFromSuperview()
        let side = pane(shown.attempt, name: shown.name, expanded: true)
        view.addSubview(side)
        sideBeside = [
            side.topAnchor.constraint(equalTo: view.topAnchor),
            side.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            side.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            side.trailingAnchor.constraint(equalTo: review.leadingAnchor),
        ]
        sideOver = [
            side.topAnchor.constraint(equalTo: view.topAnchor),
            side.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            side.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            side.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ]
        sidePane = side
        // Another attempt chosen while expanded: its pane takes the place the last one stood in.
        layoutFrame()
    }

    /// The review alone; or, expanded, the transcript's pane and the review
    /// side by side, the review where it stood at the sheet's right edge; a
    /// narrow window holds the pane alone. The sheet takes the window's width
    /// to hold both, and goes back to its own when the pane closes.
    private func layoutFrame() {
        let open = expanded && sidePane != nil
        let beside = open && wide
        laidWide = open ? wide : nil
        NSLayoutConstraint.deactivate(reviewFill + reviewSplit + sideBeside + sideOver)
        NSLayoutConstraint.activate(beside ? reviewSplit + sideBeside : open ? reviewFill + sideOver : reviewFill)
        review.isHidden = open && !beside
        splitRule.isHidden = !beside
        view.bringSubviewToFront(closeButton)
        view.bringSubviewToFront(foot)
        if traitCollection.userInterfaceIdiom != .phone, let window = view.window {
            preferredContentSize = open ? window.bounds.size : CGSize(width: Self.sheetWidth, height: window.bounds.height)
        }
        UIView.performWithoutAnimation { view.layoutIfNeeded() }
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

    private func move(_ stage: String) {
        guard let task, stage != task.stage else { return }
        moving = true
        stageProblem = nil
        render()
        Task {
            do { took(try await api().move(taskId, to: stage)) } catch { stageProblem = error.localizedDescription }
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

    // MARK: Edges

    private func edgesView(_ task: TaskView) -> UIView {
        let stack = UIStackView(arrangedSubviews: [Self.sectionHead("Edges", count: nil)])
        stack.axis = .vertical
        stack.spacing = Space.space2
        if let edgeProblem { stack.addArrangedSubview(Self.problemLabel(edgeProblem)) }
        let others = summaries.filter { $0.id != taskId && !task.after.contains($0.id) && $0.id != task.parent }
        var after: [UIView] = task.after.map { id in ref(id) { [weak self] in self?.link(.after, to: id, remove: true) } }
        if let pick = pick(task.after.isEmpty ? "Add a task it waits on" : "Add another", edge: .after, others: others) { after.append(pick) }
        stack.addArrangedSubview(edgeRow("After", after))
        var parent: [UIView] = []
        if let id = task.parent {
            parent.append(ref(id) { [weak self] in self?.link(.parent, to: id, remove: true) })
        } else if let pick = pick("Set a parent", edge: .parent, others: others) {
            parent.append(pick)
        }
        stack.addArrangedSubview(edgeRow("Parent", parent))
        if !task.related.isEmpty { stack.addArrangedSubview(edgeRow("Related", task.related.map { ref($0, remove: nil) })) }
        return stack
    }

    /// `grid-template-columns: 4.5rem 1fr`: the edge's name, then its tasks.
    private func edgeRow(_ name: String, _ items: [UIView]) -> UIView {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = name
        let nameColumn = UIStackView(arrangedSubviews: [label, UIView()])
        nameColumn.axis = .vertical
        nameColumn.isLayoutMarginsRelativeArrangement = true
        nameColumn.directionalLayoutMargins.top = Space.space1
        nameColumn.widthAnchor.constraint(equalToConstant: 72).isActive = true
        let list = UIStackView(arrangedSubviews: items)
        list.axis = .vertical
        list.spacing = Space.space1
        list.alignment = .fill
        let row = UIStackView(arrangedSubviews: [nameColumn, list])
        row.spacing = Space.space2
        row.alignment = .top
        return row
    }

    /// A task named by its id and, when known, its title.
    private func ref(_ id: String, remove: (() -> Void)?) -> UIView {
        let idText = KitLabel(Self.mono, ink: Palette.inkMuted)
        idText.text = id
        idText.setContentCompressionResistancePriority(.required, for: .horizontal)
        idText.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [idText])
        row.spacing = Space.space2
        row.alignment = .center
        if let title = summaries.first(where: { $0.id == id })?.title {
            let titleText = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            titleText.text = title
            row.addArrangedSubview(titleText)
        }
        row.addArrangedSubview(UIView())
        if let remove {
            let button = KitButton.make("", glyph: .close, variant: .ghost, height: .xs) { remove() }
            button.accessibilityLabel = "Remove \(id)"
            row.addArrangedSubview(button)
        }
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space1)
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        return row
    }

    /// The picker of tasks an edge can point at (Select `size="sm"`, muted).
    private func pick(_ label: String, edge: ProjectTasks.Edge, others: [TaskSummary]) -> UIView? {
        guard !others.isEmpty else { return nil }
        let select = KitSelect(small: true)
        select.configuration?.attributedTitle = AttributedString(label, attributes: TypeScale.typeBody.container(color: Palette.mutedForeground))
        select.accessibilityLabel = label
        select.menu = UIMenu(children: others.map { other in
            UIAction(title: other.title, subtitle: other.id) { [weak self] _ in self?.link(edge, to: other.id) }
        })
        select.setContentHuggingPriority(.required, for: .horizontal)
        return Self.leading(select)
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

/// One row's view in a list cell, `px-5` in; the view may be one the sheet
/// keeps (a field, an output, a transcript), which moves in without leaving
/// the window it is in.
final class HostCell: UICollectionViewCell {
    private weak var hosted: UIView?
    private var topConstraint: NSLayoutConstraint?

    /// Sized at the width the list gives it with its content laid out at
    /// that width first. A view whose height follows its width (MessageBody,
    /// WrapLayout) learns the width only by being laid out at it; UIKit's
    /// fitting lays nothing out, so a row the list sized off screen, after
    /// the sheet changed width, kept the height of the width before (the
    /// acceptance criteria 172pt where 636pt wide needs 268).
    override func preferredLayoutAttributesFitting(_ layoutAttributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        if abs(bounds.width - layoutAttributes.size.width) > 0.5 {
            frame.size.width = layoutAttributes.size.width
        }
        layoutIfNeeded()
        return super.preferredLayoutAttributesFitting(layoutAttributes)
    }

    func host(_ view: UIView, top: Double) {
        backgroundConfiguration = .clear()
        if hosted === view, view.superview === contentView {
            topConstraint?.constant = top
            return
        }
        contentView.subviews.forEach { $0.removeFromSuperview() }
        view.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(view)
        hosted = view
        let topConstraint = view.topAnchor.constraint(equalTo: contentView.topAnchor, constant: top)
        self.topConstraint = topConstraint
        NSLayoutConstraint.activate([
            topConstraint,
            view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: Space.space5),
            view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -Space.space5),
        ])
    }
}

/// The kit's Checkbox (ui/checkbox): 16pt at `--radius-xs` on the input
/// border; checked, the action's solid with its tick in `on-action`, which
/// fades in over `--dur-toggle`. It stands 16pt wide in its row, as the web's does.
final class TaskCheckbox: UIControl {
    private let box = UIView()
    private let tick = GlyphView(.tick, size: 12, tint: Palette.onAction)

    init(checked: Bool) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        box.isUserInteractionEnabled = false
        box.layer.cornerRadius = Radius.radiusXs
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.translatesAutoresizingMaskIntoConstraints = false
        tick.translatesAutoresizingMaskIntoConstraints = false
        addSubview(box)
        box.addSubview(tick)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.iconMd),
            heightAnchor.constraint(equalToConstant: Size.iconMd),
            box.topAnchor.constraint(equalTo: topAnchor),
            box.bottomAnchor.constraint(equalTo: bottomAnchor),
            box.leadingAnchor.constraint(equalTo: leadingAnchor),
            box.trailingAnchor.constraint(equalTo: trailingAnchor),
            tick.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            tick.centerYAnchor.constraint(equalTo: box.centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (control: TaskCheckbox, _: UITraitCollection) in control.paint() }
        self.checked = checked
        accessibilityValue = checked ? "Checked" : "Not checked"
        tick.alpha = checked ? 1 : 0
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskCheckbox is built in code")
    }

    /// Whether it is ticked; a change fades the tick over `--dur-toggle`.
    var checked = false {
        didSet {
            guard checked != oldValue else { return }
            accessibilityValue = checked ? "Checked" : "Not checked"
            paint()
            Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durToggle) { self.tick.alpha = self.checked ? 1 : 0 }.startAnimation()
        }
    }

    private func paint() {
        box.backgroundColor = checked ? Palette.actionSolid : .clear
        box.layer.borderColor = (checked ? Palette.actionSolid : Palette.input).resolvedColor(with: traitCollection).cgColor
    }

    /// A tap that ends inside, as UIKit's touch-up-inside reads it, is the
    /// action (RailViews' rows do the same): a touch the window's reach
    /// handed over counts.
    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }
}

/// A pressable row (`press-tint`): its content on a ground that takes
/// `--surface-hover` while pressed.
final class TaskPressRow: UIControl {
    let label: KitLabel
    private let stack = UIStackView()
    private var edges: [NSLayoutConstraint] = []

    init(lines: Int) {
        label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: lines)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(label)
        stack.spacing = Space.space2
        stack.alignment = .center
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        layer.cornerRadius = Radius.radiusXs
        layer.cornerCurve = .continuous
        inset(NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space1, bottom: Space.space1, trailing: Space.space1))
        isAccessibilityElement = true
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskPressRow is built in code")
    }

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard touch != nil, isTouchInside else { return }
        sendActions(for: .primaryActionTriggered)
    }

    func inset(_ insets: NSDirectionalEdgeInsets) {
        NSLayoutConstraint.deactivate(edges)
        edges = [
            stack.topAnchor.constraint(equalTo: topAnchor, constant: insets.top),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -insets.bottom),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: insets.leading),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -insets.trailing),
        ]
        NSLayoutConstraint.activate(edges)
    }

    private var ground: UIColor?

    override var backgroundColor: UIColor? {
        didSet { if !isHighlighted { ground = backgroundColor } }
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            super.backgroundColor = isHighlighted ? Palette.surfaceHover : ground
        }
    }

    override var accessibilityLabel: String? {
        get { super.accessibilityLabel ?? label.text }
        set { super.accessibilityLabel = newValue }
    }
}

/// One of a task file's own text sections (tasks/TextSection.svelte): read
/// as markdown, edited as the text it is. Save writes it back through the
/// hub; a refusal stays under the field with the draft kept.
final class TaskTextPart: UIView, UITextViewDelegate {
    private let heading: String
    private let empty: String
    private let onSave: (String) async throws -> Void
    var onResize: (() -> Void)?
    private let stack = UIStackView()
    private let markdown = MarkdownDocumentView()
    private let emptyLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkSubtle, lines: 0)
    private let editor = UITextView()
    private let problem = TaskSheetController.problemLabel()
    private var editButton: UIButton!
    private var saveButton: UIButton!
    private let editing = UIStackView()
    private var draft: String?
    private var saving = false

    /// The section's text as the hub last wrote it; a draft in progress keeps its own.
    var text = "" {
        didSet {
            guard text != oldValue else { return }
            markdown.setSource(text)
            showRead()
        }
    }

    init(heading: String, empty: String, onSave: @escaping (String) async throws -> Void) {
        self.heading = heading
        self.empty = empty
        self.onSave = onSave
        super.init(frame: .zero)
        accessibilityIdentifier = "task-text-\(heading.lowercased().replacing(" ", with: "-"))"
        editButton = KitButton.make("Edit", variant: .ghost, height: .xs) { [weak self] in self?.beginEditing() }
        saveButton = KitButton.make("Save", variant: .outline, height: .sm) { [weak self] in self?.save() }
        let cancel = KitButton.make("Cancel", variant: .ghost, height: .sm) { [weak self] in self?.cancel() }
        emptyLabel.text = empty
        // `font-mono text-label` in the kit's textarea.
        editor.font = TypeScale.typeCode.with(points: TypeScale.typeLabel.points).font
        editor.textColor = Palette.inkStrong
        editor.backgroundColor = Palette.surfaceRaised
        editor.isScrollEnabled = false
        editor.layer.cornerRadius = Radius.radiusMd
        editor.layer.cornerCurve = .continuous
        editor.layer.borderWidth = 1
        editor.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        editor.accessibilityLabel = heading
        editor.delegate = self
        editor.heightAnchor.constraint(greaterThanOrEqualToConstant: 64).isActive = true
        let actions = UIStackView(arrangedSubviews: [UIView(), cancel, saveButton])
        actions.spacing = Space.space1
        actions.alignment = .center
        editing.axis = .vertical
        editing.spacing = Space.space2
        for part in [editor, problem, actions] as [UIView] { editing.addArrangedSubview(part) }
        stack.axis = .vertical
        stack.spacing = Space.space2
        for part in [TaskSheetController.sectionHead(heading, count: nil, trailing: editButton), markdown, emptyLabel, editing] as [UIView] {
            stack.addArrangedSubview(part)
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (part: TaskTextPart, _: UITraitCollection) in part.paintEditor() }
        paintEditor()
        showRead()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskTextPart is built in code")
    }

    private func paintEditor() {
        editor.layer.borderColor = (editor.isFirstResponder ? Palette.focusRing : Palette.borderControl).resolvedColor(with: traitCollection).cgColor
    }

    private func showRead() {
        let reading = draft == nil
        editing.isHidden = reading
        editButton.isHidden = !reading
        markdown.isHidden = !reading || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        emptyLabel.isHidden = !reading || !markdown.isHidden
        onResize?()
    }

    private func beginEditing() {
        draft = text
        editor.text = text
        problem.isHidden = true
        showRead()
        editor.becomeFirstResponder()
    }

    private func cancel() {
        draft = nil
        problem.isHidden = true
        editor.resignFirstResponder()
        showRead()
    }

    private func save() {
        guard let draft, !saving else { return }
        saving = true
        saveButton.isEnabled = false
        KitButton.setTitle("Saving…", of: saveButton, variant: .outline, height: .sm)
        Task {
            do {
                try await onSave(draft)
                self.draft = nil
                editor.resignFirstResponder()
                problem.isHidden = true
            } catch {
                problem.text = error.localizedDescription
                problem.isHidden = false
            }
            saving = false
            saveButton.isEnabled = true
            KitButton.setTitle("Save", of: saveButton, variant: .outline, height: .sm)
            showRead()
        }
    }

    func textViewDidChange(_ textView: UITextView) {
        draft = textView.text
        onResize?()
    }

    func textViewDidBeginEditing(_: UITextView) { paintEditor() }
    func textViewDidEndEditing(_: UITextView) { paintEditor() }
}

#if DEBUG
/// The task sheet's parts as `TaskSheet` lines
/// (scripts/probe-kit/specs/ios-task-review.ts): every view named
/// `task-…` that stands in the window, its frame (in the body's content
/// points for a part of the list, so a scroll moves none of them; in the
/// window's for the frame's own panes), whether it shows, and what it says.
/// A line is logged when a part comes, changes or goes.
enum TaskSheetProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "TaskSheet")
    private static var last: [String: String] = [:]

    static func report(_ root: UIView, body: UICollectionView) {
        var lines: [String: String] = [:]
        var showing: Set<String> = []
        visit(root) { view in
            guard let id = view.accessibilityIdentifier, id.hasPrefix("task-") else { return }
            let shows = !hidden(view)
            // A row's last drawing can linger in a cell the list keeps hidden for reuse: the one shown wins.
            guard shows || !showing.contains(id) else { return }
            if shows { showing.insert(id) }
            let inBody = view !== body && view.isDescendant(of: body)
            let frame = view.convert(view.bounds, to: inBody ? body : nil)
            var line = "part \(id) in=\(inBody ? "body" : "window") frame=\(box(frame)) shows=\(shows)"
            if let words = says(view) { line += " says=\(words.replacing("\n", with: " "))" }
            lines[id] = line
        }
        for (id, line) in lines.sorted(by: { $0.key < $1.key }) where last[id] != line {
            log.notice("\(line, privacy: .public)")
        }
        for id in last.keys where lines[id] == nil {
            log.notice("gone \(id, privacy: .public)")
        }
        last = lines
    }

    /// Every view under `view`, but not into a transcript, a page or a document, which hold no part.
    private static func visit(_ view: UIView, _ each: (UIView) -> Void) {
        each(view)
        guard !(view is TranscriptView || view is WKWebView || view is MarkdownDocumentView) else { return }
        for sub in view.subviews { visit(sub, each) }
    }

    private static func hidden(_ view: UIView) -> Bool {
        var at: UIView? = view
        while let current = at {
            if current.isHidden || current.alpha == 0 { return true }
            at = current.superview
        }
        return view.window == nil
    }

    private static func says(_ view: UIView) -> String? {
        switch view {
        case let output as TaskOutputView: "state=\(output.shown) head=\(output.head)"
        case let page as ResultPage: page.probeWords
        case let tabs as KitSegmented: "selected=\(tabs.selectedIndex.map(String.init) ?? "none")"
        case let list as UICollectionView:
            String(format: "offset=%.1f foot=%.1f safe=%.1f", list.contentOffset.y + list.adjustedContentInset.top,
                   list.adjustedContentInset.bottom, list.safeAreaInsets.bottom)
        case let label as UILabel: label.text
        case let button as UIButton: button.configuration?.title ?? button.currentTitle ?? button.accessibilityLabel
        default: view.accessibilityLabel
        }
    }

    private static func box(_ rect: CGRect) -> String {
        String(format: "%.1f,%.1f,%.1f,%.1f", rect.minX, rect.minY, rect.width, rect.height)
    }
}
#endif
