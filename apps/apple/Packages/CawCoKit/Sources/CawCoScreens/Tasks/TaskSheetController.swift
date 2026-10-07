import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

/// A task, whole, in a sheet (tasks/TaskSheet.svelte): its title, stage,
/// flags, description, acceptance criteria, to-dos, edges and attempts.
/// Every change is the hub's to make, so each waits for the hub's answer and
/// shows the task as the hub wrote it back; a refusal is said beside what it
/// refused, in the hub's own words. The header stays; under it the parts are
/// one list.
final class TaskSheetController: UIViewController, UICollectionViewDelegate {
    nonisolated enum Item: Hashable, Sendable {
        case readProblem, skeleton, warnings
        case description, acceptance
        case todosHead, todosProblem, todosEmpty
        case todo(String)
        /// The add field: `""` at the foot, a to-do's ref under that to-do.
        case todoAdd(String)
        case edges
        case attemptsHead, startProblem, retry
        case attempt(String)
        case path
    }

    /// Presents the sheet: medium and large detents on an iPhone, a form sheet on an iPad and the Mac.
    static func present(projectId: String, taskId: String, attempt: String?, hub: HubConnection,
                        from presenter: UIViewController, openSession: @escaping (String) -> Void) {
        let sheet = TaskSheetController(projectId: projectId, taskId: taskId, attempt: attempt, hub: hub, openSession: openSession)
        if presenter.traitCollection.userInterfaceIdiom == .phone {
            sheet.modalPresentationStyle = .pageSheet
            if let controller = sheet.sheetPresentationController {
                controller.detents = [.medium(), .large()]
                // An attempt is read at the foot of the list: the sheet opens tall enough to show it.
                controller.selectedDetentIdentifier = attempt == nil ? .medium : .large
                controller.prefersGrabberVisible = true
                controller.prefersScrollingExpandsWhenScrolledToEdge = true
            }
        } else {
            sheet.modalPresentationStyle = .formSheet
        }
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
    private var retryProblem: String?
    private var todoProblem: String?
    private var moving = false
    private var retrying = false
    /// Ticks shown before the hub has written them, by ref.
    private var ticking: [String: Bool] = [:]
    private var editingTodo: String?
    private var addingUnder: String?

    // The header: the id and the stage, the title, what refused, the flags.
    private let head = UIStackView()
    private let idLabel = KitLabel(TaskSheetController.mono, ink: Palette.inkSubtle)
    private let stagePicker = KitSelect()
    private let stageSkeleton = SkeletonView(height: Size.cBtnHSm)
    private let titleButton = UIControl()
    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    private let titleField = KitField()
    private let titleProblemLabel = TaskSheetController.problemLabel()
    private let stageProblemLabel = TaskSheetController.problemLabel()
    private let flagsHolder = UIView()

    private var collection: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Int, Item>!

    // Rows that hold a field keep it across renders, so the keyboard stays.
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

    static let mono = TypeScale.typeCode.with(points: TypeScale.typeMeta.points)

    init(projectId: String, taskId: String, attempt: String?, hub: HubConnection, openSession: @escaping (String) -> Void) {
        self.projectId = projectId
        self.taskId = taskId
        scrollTo = attempt
        self.hub = hub
        self.openSession = openSession
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskSheetController is built in code")
    }

    private func api() throws -> ProjectTasks { try ProjectTasks(hub: hub, projectId: projectId) }

    // MARK: Building

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        buildHead()

        var list = UICollectionLayoutListConfiguration(appearance: .plain)
        list.showsSeparators = false
        list.backgroundColor = .clear
        collection = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewCompositionalLayout.list(using: list))
        collection.translatesAutoresizingMaskIntoConstraints = false
        collection.backgroundColor = .clear
        collection.delegate = self
        collection.keyboardDismissMode = .interactive
        // A row whose field or text grows takes its new height at once.
        collection.selfSizingInvalidation = .enabledIncludingConstraints
        // `pb-6` under the last part.
        collection.contentInset.bottom = Space.space6
        view.addSubview(collection)

        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rule)
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: Space.space5),
            head.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Space.space5),
            head.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Space.space5),
            rule.topAnchor.constraint(equalTo: head.bottomAnchor, constant: Space.space3),
            rule.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            collection.topAnchor.constraint(equalTo: rule.bottomAnchor),
            collection.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collection.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let cell = UICollectionView.CellRegistration<HostCell, Item> { [weak self] cell, _, item in
            guard let self else { return }
            cell.host(rowView(for: item), top: top(for: item))
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
        view.addSubview(head)

        idLabel.text = taskId
        stageSkeleton.widthAnchor.constraint(equalToConstant: 96).isActive = true
        stagePicker.accessibilityLabel = "Stage"
        stagePicker.isHidden = true
        let close = KitButton.make("", glyph: .close, variant: .ghost, height: .sm) { [weak self] in self?.dismiss(animated: true) }
        close.accessibilityLabel = "Close"
        let meta = UIStackView(arrangedSubviews: [idLabel, stageSkeleton, stagePicker, UIView(), close])
        meta.spacing = Space.space2
        meta.alignment = .center
        head.addArrangedSubview(meta)

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
        for part in [titleButton, titleField, titleProblemLabel, stageProblemLabel, flagsHolder] as [UIView] {
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
            summaries = await list ?? []
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
        var items: [Item] = []
        if readProblem != nil {
            items = [.readProblem]
        } else if let task {
            if !task.problems.isEmpty { items.append(.warnings) }
            descriptionPart.text = task.description
            acceptancePart.text = task.acceptance
            items += [.description, .acceptance, .todosHead]
            if todoProblem != nil { items.append(.todosProblem) }
            if task.todos.isEmpty { items.append(.todosEmpty) }
            for todo in task.todos {
                items.append(.todo(todo.path))
                if addingUnder == todo.ref { items.append(.todoAdd(todo.ref)) }
            }
            items.append(.todoAdd(""))
            items.append(.edges)
            if !task.attempts.isEmpty || task.startProblem != nil {
                items.append(.attemptsHead)
                if task.startProblem != nil { items.append(.startProblem) }
                if task.lastAttemptFailed && !task.liveAttempt { items.append(.retry) }
                items += task.attempts.map { .attempt($0.workItemId) }
            }
            items.append(.path)
        } else {
            items = [.skeleton]
        }
        var snapshot = NSDiffableDataSourceSnapshot<Int, Item>()
        snapshot.appendSections([0])
        snapshot.appendItems(items)
        // Rows that stay are drawn again from the task as it now is.
        snapshot.reconfigureItems(items.filter { dataSource.indexPath(for: $0) != nil })
        dataSource.apply(snapshot, animatingDifferences: collection.window != nil && !UIAccessibility.isReduceMotionEnabled) { [weak self] in
            self?.scrollToAttempt()
        }
    }

    /// An `attempt` push lands on its attempt once the task is read.
    private func scrollToAttempt() {
        guard let id = scrollTo, task != nil else { return }
        scrollTo = nil
        guard let path = dataSource.indexPath(for: .attempt(id)) else { return }
        collection.layoutIfNeeded()
        collection.scrollToItem(at: path, at: .centeredVertically, animated: false)
    }

    private func renderHead() {
        let shown = task
        titleLabel.text = shown?.title ?? ""
        titleButton.isEnabled = shown != nil
        titleButton.accessibilityLabel = shown?.title
        show(titleProblem, in: titleProblemLabel)
        show(stageProblem, in: stageProblemLabel)
        stageSkeleton.isHidden = shown != nil
        stagePicker.isHidden = shown == nil
        if let shown {
            stagePicker.setValue(TaskWords.stage(shown.stage))
            stagePicker.isEnabled = !moving
            stagePicker.menu = stageMenu(shown)
        }

        flagsHolder.subviews.forEach { $0.removeFromSuperview() }
        var badges: [UIView] = []
        if let shown {
            if shown.needsYou { badges.append(KitBadge("Needs you", variant: .attn, glyph: .attention)) }
            if shown.liveAttempt {
                badges.append(KitBadge("Working", variant: .live, glyph: .working))
            } else if shown.lastAttemptFailed {
                badges.append(KitBadge("Last attempt failed", variant: .fail, glyph: .failed))
            } else if shown.queuedStart {
                badges.append(KitBadge("Queued", variant: .secondary))
            }
            if !shown.blockedBy.isEmpty {
                badges.append(KitBadge("Waits on \(shown.blockedBy.joined(separator: ", "))", variant: .secondary, glyph: .lock))
            }
            badges += shown.labels.map { KitBadge($0, variant: .secondary) }
        }
        flagsHolder.isHidden = badges.isEmpty
        if !badges.isEmpty {
            let wrap = WrapLayout(badges, gap: Space.space1)
            wrap.translatesAutoresizingMaskIntoConstraints = false
            flagsHolder.addSubview(wrap)
            NSLayoutConstraint.activate([
                wrap.topAnchor.constraint(equalTo: flagsHolder.topAnchor),
                wrap.bottomAnchor.constraint(equalTo: flagsHolder.bottomAnchor),
                wrap.leadingAnchor.constraint(equalTo: flagsHolder.leadingAnchor),
                wrap.trailingAnchor.constraint(equalTo: flagsHolder.trailingAnchor),
            ])
        }
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

    private func top(for item: Item) -> Double {
        switch item {
        case .readProblem, .skeleton, .warnings: Space.space4
        // Each part starts `gap-5` under the one before (`pt-4` before the first).
        case .description: task?.problems.isEmpty == false ? Space.space5 : Space.space4
        case .acceptance, .todosHead, .edges, .attemptsHead, .path: Space.space5
        case .todo: 0
        case let .todoAdd(under): under.isEmpty && task?.todos.isEmpty == false ? Space.space2 : 0
        default: Space.space2
        }
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
        case .attemptsHead: return Self.sectionHead("Attempts", count: task.attempts.isEmpty ? nil : "\(task.attempts.count)")
        case .startProblem: return Self.problemLabel(task.startProblem)
        case .retry: return retryView()
        case let .attempt(id):
            guard let index = task.attempts.firstIndex(where: { $0.workItemId == id }) else { return UIView() }
            return attemptRow(task.attempts[index], number: task.attempts.count - index)
        case .path:
            let path = KitLabel(Self.mono, ink: Palette.inkSubtle, lines: 0)
            path.text = task.path
            path.accessibilityHint = "The task's file in the project folder"
            return path
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
        let select = KitSelect()
        select.configuration?.attributedTitle = AttributedString(label, attributes: AttributeContainer(TypeScale.typeLabel.withWeight(.regular).attributes(color: Palette.mutedForeground)))
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

    // MARK: Attempts

    private func retryView() -> UIView {
        let button = KitButton.make("Retry", variant: .outline, height: .sm) { [weak self] in self?.retry() }
        button.isEnabled = !retrying
        let stack = UIStackView(arrangedSubviews: [Self.leading(button)])
        stack.axis = .vertical
        stack.spacing = Space.space1
        if let retryProblem { stack.addArrangedSubview(Self.problemLabel(retryProblem)) }
        return stack
    }

    /// A fresh attempt at a task whose last one failed; it reports to the project's lead.
    private func retry() {
        retrying = true
        retryProblem = nil
        render()
        Task {
            do {
                let api = try api()
                try await api.retry(taskId)
                took(try await api.read(taskId))
            } catch { retryProblem = error.localizedDescription }
            retrying = false
            render()
        }
    }

    /// "Attempt N", its status word in its tint, and when it ended (or started); a tap opens its session.
    private func attemptRow(_ attempt: TaskAttempt, number: Int) -> UIView {
        let row = TaskPressRow(lines: 1)
        row.label.text = "Attempt \(number)"
        row.label.role = TypeScale.typeLabel
        let word = TaskWords.attempt(attempt.state)
        let variant: KitBadge.Variant = switch word {
        case "Working": .live
        case "Done": .done
        case "Failed": .fail
        default: .secondary
        }
        let at = (attempt.endedAt ?? attempt.startedAt) / 1000
        let when = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        when.text = Date(timeIntervalSince1970: at).formatted(date: .numeric, time: .shortened)
        row.trail([KitBadge(word, variant: variant), UIView(), when])
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous
        row.inset(NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3))
        row.accessibilityLabel = "Attempt \(number), \(word), \(when.text ?? "")"
        let instanceId = attempt.instanceId
        row.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            let open = openSession
            dismiss(animated: true) { open(instanceId) }
        }, for: .primaryActionTriggered)
        return row
    }

    // MARK: Small parts

    func collectionView(_: UICollectionView, shouldHighlightItemAt _: IndexPath) -> Bool { false }

    private func show(_ problem: String?, in label: KitLabel) {
        label.text = problem
        label.isHidden = problem == nil
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
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins.bottom = Space.space1
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHXs + Space.space1).isActive = true
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
/// keeps (a field), which moves in without leaving the window it is in.
final class HostCell: UICollectionViewCell {
    private weak var hosted: UIView?
    private var topConstraint: NSLayoutConstraint?

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
/// fades in over `--dur-toggle`. The hit area is the small control height.
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
            widthAnchor.constraint(equalToConstant: Size.cBtnHSm),
            heightAnchor.constraint(equalToConstant: Size.cBtnHSm),
            box.widthAnchor.constraint(equalToConstant: 16),
            box.heightAnchor.constraint(equalToConstant: 16),
            box.leadingAnchor.constraint(equalTo: leadingAnchor),
            box.centerYAnchor.constraint(equalTo: centerYAnchor),
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

    private var checked = false

    private func paint() {
        box.backgroundColor = checked ? Palette.actionSolid : .clear
        box.layer.borderColor = (checked ? Palette.actionSolid : Palette.input).resolvedColor(with: traitCollection).cgColor
    }

    /// A tap that ends on the box is the action (RailViews' rows do the same).
    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        guard let touch, bounds.contains(touch.location(in: self)) else { return }
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
        guard let touch, bounds.contains(touch.location(in: self)) else { return }
        sendActions(for: .primaryActionTriggered)
    }

    func trail(_ views: [UIView]) {
        views.forEach { stack.addArrangedSubview($0) }
        label.setContentHuggingPriority(.required, for: .horizontal)
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
