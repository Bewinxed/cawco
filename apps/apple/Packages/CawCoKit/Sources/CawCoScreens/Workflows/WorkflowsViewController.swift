import CawCoCore
import CawCoDesign
import UIKit

/// The Workflows page (routes/workflows/+page.svelte): its name and what it
/// is for, New workflow, and every workflow on one raised sheet with its last
/// run's status, when that started, how many runs it has had, and Run. Until
/// the first read is in, three rows of skeletons stand where the list will
/// be; a list known to be empty says what a workflow is; a read that failed
/// says so above whatever there is to keep showing. From 761pt of window the
/// sheet is five columns under their headings; below that each workflow is
/// two lines, its name and status over its age and its actions.
final class WorkflowsViewController: ObservedViewController {
    private let context: ShellContext
    private var hub: HubConnection { context.hub }
    private let scroll = UIScrollView()
    private let column = UIStackView()
    /// `.wf h1` restates the title's size and weight and sets no letter-spacing: the role's tracking is left off.
    private let name = KitLabel(WorkflowForm.text(TypeScale.typeTitle), ink: Palette.inkStrong, tracking: 0)
    private var titleWidth = 0.0
    private let error = WorkflowError()
    private let content = CrossView()
    private var headerNew: UIButton!
    private var edges: [NSLayoutConstraint] = []
    private var narrow = false
    private var busy = false
    private var failure = ""
    private var drawn = ""
    private var newButtons: [UIButton] = []
    private var runButtons: [UIButton] = []
    /// The narrow rows whose actions are folded open, by workflow.
    private var unfolded: Set<String> = []

    /// `(max-width: 760px)`.
    private static let narrowWidth = 760.0
    /// `minmax(180px, 1fr) 110px 110px 60px 70px`.
    private static let columns = [110.0, 110.0, 60.0, 70.0]
    private static let headings = ["Name", "Last run", "Started", "Runs", "Actions"]

    init(context: ShellContext) {
        self.context = context
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowsViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)
        column.axis = .vertical
        column.spacing = Space.space6
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        let safe = view.safeAreaLayoutGuide
        edges = [
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor),
        ]
        NSLayoutConstraint.activate(edges + [
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
        ])

        name.text = "Workflows"
        name.accessibilityTraits = .header
        let purpose = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
        purpose.text = "Reusable steps across your fleet."
        purpose.wrap = .pretty
        let titles = UIStackView(arrangedSubviews: [name, purpose])
        titles.axis = .vertical
        titles.spacing = Space.space1
        headerNew = newButton()
        let header = UIStackView(arrangedSubviews: [titles, UIView(), headerNew])
        header.spacing = Space.space2
        header.alignment = .center
        error.isHidden = true
        for part in [header, error, content] as [UIView] { column.addArrangedSubview(part) }
        pad()
    }

    /// The page is read again each time it is come to (`onMount`).
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        Task { await hub.workflows.refresh() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = view.window?.bounds.width ?? view.bounds.width
        if width != titleWidth {
            // `--text-title` is fluid: 18pt on a phone, 20pt from about 1024pt of window.
            titleWidth = width
            name.role = WorkflowForm.text(TypeScale.typeTitle.with(points: TypeScale.typeTitle.points(viewport: width)))
        }
        let next = width <= Self.narrowWidth
        guard next != narrow else { return }
        narrow = next
        pad()
        requestRefresh()
    }

    /// `--space-7` by `--space-6` round the page; `--space-4` on a narrow one.
    private func pad() {
        let (block, inline) = narrow ? (Space.space4, Space.space4) : (Space.space7, Space.space6)
        edges[0].constant = block
        edges[1].constant = -block
        edges[2].constant = inline
        edges[3].constant = -inline
    }

    // MARK: Model

    private struct Row {
        let workflow: WorkflowRow
        let runs: [BoardRun]
        var last: BoardRun? { runs.first }
    }

    override func refreshContent() {
        guard isViewLoaded else { return }
        let store: WorkflowsStore = hub.workflows
        let live = hub.state == .connected
        let all = hub.fleet.runs.values
        let rows = store.workflows.map { workflow in
            Row(workflow: workflow, runs: all.filter { $0.workflowId == workflow.id }.sorted { $0.startedAt > $1.startedAt })
        }
        // An outage is said once, by the reconnect banner over the page: a
        // read that failed for it adds no line while there are rows to keep
        // showing, and a list that was never read says why it is empty.
        let said = !failure.isEmpty ? failure : (!store.error.isEmpty && (live || rows.isEmpty) ? store.error : "")
        error.text = said
        error.isHidden = said.isEmpty
        if !said.isEmpty { error.accessibilityLabel = said }

        let state = !store.loaded ? "loading" : (rows.isEmpty ? (store.error.isEmpty ? "empty" : "none") : "rows")
        let print = ([state, "\(narrow)"] + rows.map { row in
            "\(row.workflow.id)|\(row.workflow.name)|\(row.workflow.description)|\(row.runs.count)|\(row.last?.status.rawValue ?? "")|\(row.last?.startedAt ?? 0)"
        }).joined(separator: "\n")
        if print != drawn {
            drawn = print
            newButtons = [headerNew]
            runButtons = []
            switch state {
            case "loading": content.show(skeleton())
            case "empty": content.show(emptyState())
            case "rows": content.show(table(rows))
            default: content.show(UIView())
            }
        }
        for button in newButtons {
            button.isEnabled = live && !busy
            PromptCardView.setPending(button, busy, label: "Creating…")
        }
        runButtons.forEach { $0.isEnabled = live }
    }

    // MARK: New workflow

    /// **New workflow** and the two ways one is authored (§13.4): a graph the
    /// editor compiles, or a program written by hand.
    private func newButton() -> UIButton {
        let button = KitButton.workflow("New workflow", primary: true) {}
        button.showsMenuAsPrimaryAction = true
        button.menu = UIMenu(children: [
            UIAction(title: "New graph", subtitle: "Draw the steps; the hub compiles them.") { [weak self] _ in self?.create(program: false) },
            UIAction(title: "New program", subtitle: "Write the steps as TypeScript.") { [weak self] _ in self?.create(program: true) },
        ])
        return button
    }

    private func create(program: Bool) {
        guard !busy else { return }
        busy = true
        failure = ""
        requestRefresh()
        Task {
            // The new workflow opens on its own page (`goto("/workflows/<id>")`): a program on its Program tab.
            do {
                let id = try await hub.workflows.create(program: program)
                context.go(.workflow(id: id, program: program))
            } catch {
                failure = error.localizedDescription
            }
            busy = false
            requestRefresh()
        }
    }

    // MARK: The sheet

    /// `.table`: the raised sheet, 11pt in.
    private func sheet(_ rows: [UIView]) -> TileView {
        let tile = TileView(radius: Radius.radiusLg)
        let stack = UIStackView(arrangedSubviews: (narrow ? [] : [heading()]) + rows)
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: tile.topAnchor, constant: Space.space3),
            stack.bottomAnchor.constraint(equalTo: tile.bottomAnchor, constant: -Space.space3),
            stack.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: Space.space3),
            stack.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -Space.space3),
        ])
        return tile
    }

    private func heading() -> UIView {
        let labels = Self.headings.map { text in
            let label = KitLabel(WorkflowForm.text(TypeScale.typeLabel), ink: Palette.inkMuted)
            label.text = text
            label.accessibilityTraits = .header
            return label
        }
        let row = grid(labels)
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
        return row
    }

    /// The five cells on the wide grid: the first takes the room left, the rest their widths, 11pt apart.
    private func grid(_ cells: [UIView]) -> UIStackView {
        let row = UIStackView()
        row.spacing = Space.space3
        row.alignment = .center
        for (index, cell) in cells.enumerated() {
            let box = UIView()
            box.translatesAutoresizingMaskIntoConstraints = false
            cell.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(cell)
            NSLayoutConstraint.activate([
                cell.topAnchor.constraint(equalTo: box.topAnchor),
                cell.bottomAnchor.constraint(equalTo: box.bottomAnchor),
                cell.leadingAnchor.constraint(equalTo: box.leadingAnchor),
                cell.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor),
            ])
            if index > 0 { box.widthAnchor.constraint(equalToConstant: Self.columns[index - 1]).isActive = true }
            row.addArrangedSubview(box)
        }
        return row
    }

    /// `.workflow-row`: a hairline above it, 11pt in, at least 64pt tall.
    private func line(name: UIView, status: UIView, age: UIView, count: UIView, actions: UIView) -> UIView {
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(rule)
        let body: UIView
        if narrow {
            // `1fr auto`: the name and the status, then the age and the actions; the second column as wide as its widest.
            let second = [status, actions].map { cell -> UIView in
                let wrap = UIView()
                wrap.translatesAutoresizingMaskIntoConstraints = false
                cell.translatesAutoresizingMaskIntoConstraints = false
                wrap.addSubview(cell)
                let hug = wrap.widthAnchor.constraint(equalToConstant: 0)
                // Under a label's own resistance to being squeezed, over the first column's hold on its width.
                hug.priority = .defaultHigh - 1
                NSLayoutConstraint.activate([
                    cell.topAnchor.constraint(equalTo: wrap.topAnchor),
                    cell.bottomAnchor.constraint(equalTo: wrap.bottomAnchor),
                    cell.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
                    cell.trailingAnchor.constraint(lessThanOrEqualTo: wrap.trailingAnchor),
                    hug,
                ])
                wrap.setContentCompressionResistancePriority(.required, for: .horizontal)
                return wrap
            }
            // The first column takes the room the second leaves.
            for first in [name, age] {
                first.setContentHuggingPriority(.defaultLow - 1, for: .horizontal)
                first.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            }
            let lines = [UIStackView(arrangedSubviews: [name, second[0]]), UIStackView(arrangedSubviews: [age, second[1]])]
            for line in lines {
                line.spacing = Space.space3
                line.alignment = .center
            }
            let stack = UIStackView(arrangedSubviews: lines)
            stack.axis = .vertical
            stack.spacing = Space.space3
            second[0].widthAnchor.constraint(equalTo: second[1].widthAnchor).isActive = true
            body = stack
        } else {
            body = grid([name, status, age, count, actions])
        }
        body.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(body)
        NSLayoutConstraint.activate([
            rule.topAnchor.constraint(equalTo: box.topAnchor),
            rule.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            box.heightAnchor.constraint(greaterThanOrEqualToConstant: 64),
            body.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
            body.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space3),
            body.centerYAnchor.constraint(equalTo: box.centerYAnchor, constant: 0.5),
            body.topAnchor.constraint(greaterThanOrEqualTo: box.topAnchor, constant: Space.space3 + 1),
            body.bottomAnchor.constraint(lessThanOrEqualTo: box.bottomAnchor, constant: -Space.space3),
        ])
        return box
    }

    // MARK: States

    /// Rows at the height the list's rows take, standing where it will be.
    private func skeleton() -> UIView {
        func bar(_ width: Double, _ height: Double) -> UIView {
            let bar = SkeletonView(height: height)
            bar.widthAnchor.constraint(equalToConstant: width).isActive = true
            return bar
        }
        let tile = sheet((0 ..< 3).map { _ in
            line(name: bar(160, 16), status: bar(64, 20), age: bar(80, 16), count: bar(24, 16), actions: bar(56, 32))
        })
        tile.isAccessibilityElement = true
        tile.accessibilityLabel = "Loading workflows"
        return tile
    }

    private func emptyState() -> UIView {
        let again = newButton()
        newButtons.append(again)
        let state = KitEmptyState(
            icon: .workflow,
            title: "No workflows yet",
            line: "A workflow is a graph of steps that run one after another across your fleet.",
            action: again
        )
        // `mx-auto w-full max-w-[420px]`.
        let box = UIView()
        state.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(state)
        let full = state.widthAnchor.constraint(equalTo: box.widthAnchor)
        full.priority = .defaultHigh
        NSLayoutConstraint.activate([
            state.topAnchor.constraint(equalTo: box.topAnchor),
            state.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            state.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            state.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
            full,
        ])
        return box
    }

    private func table(_ rows: [Row]) -> UIView {
        let now = Date().timeIntervalSince1970 * 1000
        let tile = sheet(rows.map { row in
            let workflow = row.workflow
            let status: UIView
            if let last = row.last {
                status = WorkflowStatusChip(last.status)
            } else {
                let none = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted)
                none.text = "No runs"
                status = none
            }
            let age = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted)
            let started = row.last.map { RailAge.ago($0.startedAt, now: now) } ?? "—"
            age.text = narrow ? "\(started) · \(row.runs.count) \(row.runs.count == 1 ? "run" : "runs")" : started
            let count = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
            count.tabular = true
            count.text = "\(row.runs.count)"
            count.isHidden = narrow
            let name = WorkflowNameLink(workflow) { [weak self] in self?.context.go(.workflow(id: workflow.id, program: false)) }
            return line(name: name, status: status, age: age, count: count, actions: actions(workflow))
        })
        tile.accessibilityLabel = "Workflows"
        return tile
    }

    /// Run, on the wide grid; on a narrow page it is folded under "Actions" (`details.mobile`).
    private func actions(_ workflow: WorkflowRow) -> UIView {
        var run: UIButton!
        run = KitButton.workflow("Run") { [weak self] in self?.launch(workflow, from: run) }
        runButtons.append(run)
        guard narrow else { return run }
        let fold = WorkflowActionsFold(name: workflow.name, action: run, open: unfolded.contains(workflow.id))
        fold.onToggle = { [weak self] open in
            guard let self else { return }
            if open { unfolded.insert(workflow.id) } else { unfolded.remove(workflow.id) }
            guard view.window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
            Motion.easeDrawer.animator(Motion.durPanel) { self.view.layoutIfNeeded() }.startAnimation()
        }
        return fold
    }

    /// The launch form grows from the Run button that opened it; the run it starts opens as a tab.
    private func launch(_ workflow: WorkflowRow, from button: UIView) {
        let form = WorkflowLaunchController(hub: hub, workflow: workflow) { [weak self] runId in
            self?.context.openSession(BoardRun.prefix + runId)
        }
        form.origin = button
        present(form, animated: true)
    }
}

/// A workflow's name, its description under it in muted meta, as the link to
/// its own page (`a.name`): 24pt at the least, 44pt under a finger.
private final class WorkflowNameLink: UIControl {
    init(_ workflow: WorkflowRow, action: @escaping () -> Void) {
        super.init(frame: .zero)
        addAction(UIAction { _ in action() }, for: .touchUpInside)
        addInteraction(UIPointerInteraction(delegate: nil))
        let name = KitLabel(TypeScale.typeBody.withWeight(TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
        name.text = workflow.name
        let about = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
        about.text = workflow.description
        about.isHidden = workflow.description.isEmpty
        let stack = UIStackView(arrangedSubviews: [name, about])
        stack.axis = .vertical
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.topAnchor.constraint(greaterThanOrEqualTo: topAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: WorkflowForm.coarse ? Size.cBtnHLg : 24),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .link
        accessibilityLabel = workflow.description.isEmpty ? workflow.name : "\(workflow.name), \(workflow.description)"
        accessibilityIdentifier = "workflow-name"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowNameLink is built in code")
    }

    override var isHighlighted: Bool {
        didSet { alpha = isHighlighted ? 0.6 : 1 }
    }
}

/// A narrow row's actions (`details.mobile`): "Actions", 44pt tall and with
/// no marker (its summary is a flex row), folding open what it holds under it.
private final class WorkflowActionsFold: UIStackView {
    var onToggle: (Bool) -> Void = { _ in }
    private let summary = UIControl()
    private let action: UIView
    private var open: Bool

    init(name: String, action: UIView, open: Bool) {
        self.action = action
        self.open = open
        super.init(frame: .zero)
        axis = .vertical
        alignment = .leading
        let row = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        row.text = "Actions"
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        summary.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: summary.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: summary.trailingAnchor),
            row.centerYAnchor.constraint(equalTo: summary.centerYAnchor),
            summary.heightAnchor.constraint(equalToConstant: Size.cBtnHLg),
        ])
        summary.addAction(UIAction { [weak self] _ in self?.toggle() }, for: .touchUpInside)
        summary.isAccessibilityElement = true
        summary.accessibilityTraits = .button
        summary.accessibilityLabel = "Actions for \(name)"
        addArrangedSubview(summary)
        addArrangedSubview(action)
        show()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("WorkflowActionsFold is built in code")
    }

    private func show() {
        action.isHidden = !open
        summary.accessibilityValue = open ? "Expanded" : "Collapsed"
    }

    private func toggle() {
        open.toggle()
        show()
        onToggle(open)
    }
}
