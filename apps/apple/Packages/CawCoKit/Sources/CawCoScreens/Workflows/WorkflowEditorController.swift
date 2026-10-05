import CawCoCore
import CawCoDesign
import UIKit

/// A workflow's own page (WorkflowEditor.svelte), read: the way back to
/// Workflows and the workflow's name, Validate and Run workflow, the Editor
/// (a drawn workflow only), Program and Runs tabs, and what the hub last
/// said of it. Until the workflow is read, two skeleton bars stand where its
/// pane will be; a read that failed says so, with a way to try again. One
/// tab's pane gives way to the next sliding across in the tabs' order.
/// Nothing here changes the workflow.
final class WorkflowEditorController: ObservedViewController {
    private let context: ShellContext
    private let workflowId: String
    private var hub: HubConnection { context.hub }
    private var detail: WorkflowDetail?
    private var failure = ""
    private var pressed = false
    private var readAt = Date()
    /// The tab in front: `editor`, `program` or `runs`.
    private var chosen: String
    private var tabs: KitSegmented?
    private var order: [String] = []
    private var clock: Timer?
    private var drawn = ""

    private let header = UIStackView()
    /// An input's type: 16pt under a finger, the body's 14pt under a pointer.
    private let name = KitLabel(TypeScale.typeBody.with(weight: TypeScale.weightStrong, points: WorkflowForm.coarse ? 16 : TypeScale.typeBody.points), ink: Palette.inkStrong)
    private var validate: UIButton!
    private var run: UIButton!
    private let tabRow = UIStackView()
    private let saveLine = MorphLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted)
    private let error = UIStackView()
    private let errorText = KitLabel(TypeScale.typeBody, ink: Palette.error11, lines: 0)
    private var retry: UIButton!
    private let panes = PaneSlideView()
    private var headerEdges: [NSLayoutConstraint] = []
    private var canvas: WorkflowCanvasView?
    private var program: WorkflowProgramView?
    private var runs: WorkflowRunsList?

    /// `(max-width: 1023px)`.
    private var narrow: Bool { (view.window?.bounds.width ?? view.bounds.width) < 1024 }

    /// `program` opens it on the Program tab (the web's `?tab=program`).
    init(context: ShellContext, workflowId: String, program: Bool) {
        self.context = context
        self.workflowId = workflowId
        chosen = program ? "program" : "editor"
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowEditorController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let safe = view.safeAreaLayoutGuide

        // Header: on the raised surface over a hairline, its two rows 14pt apart.
        let band = UIView()
        band.backgroundColor = Palette.surfaceRaised
        band.translatesAutoresizingMaskIntoConstraints = false
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        band.addSubview(rule)
        header.axis = .vertical
        header.spacing = Space.space4
        header.translatesAutoresizingMaskIntoConstraints = false
        band.addSubview(header)

        let back = WorkflowCrumbLink("Workflows") { [weak self] in self?.context.go(.workflows) }
        let slash = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        slash.text = "/"
        // `.breadcrumb input`: the name in the body size at the strong weight, in an input's box with no edge, at most 300pt wide.
        name.accessibilityLabel = "Workflow name"
        name.lineBreakMode = .byTruncatingTail
        let nameBox = UIView()
        nameBox.translatesAutoresizingMaskIntoConstraints = false
        nameBox.addSubview(name)
        NSLayoutConstraint.activate([
            name.leadingAnchor.constraint(equalTo: nameBox.leadingAnchor, constant: Space.space3 + 1),
            name.trailingAnchor.constraint(equalTo: nameBox.trailingAnchor, constant: -Space.space3 - 1),
            name.centerYAnchor.constraint(equalTo: nameBox.centerYAnchor),
            nameBox.heightAnchor.constraint(equalToConstant: WorkflowForm.height),
            nameBox.widthAnchor.constraint(lessThanOrEqualToConstant: 300),
        ])
        // It takes the room the row has, up to its 300pt.
        let wanted = nameBox.widthAnchor.constraint(equalToConstant: 300)
        wanted.priority = .defaultLow
        wanted.isActive = true
        name.setContentCompressionResistancePriority(.defaultLow - 1, for: .horizontal)
        let rest = UIView()
        rest.setContentHuggingPriority(.init(1), for: .horizontal)
        let crumb = UIStackView(arrangedSubviews: [back, slash, nameBox, rest])
        crumb.spacing = Space.space2
        crumb.alignment = .center
        validate = KitButton.workflow("Validate") { [weak self] in self?.revalidate() }
        run = KitButton.workflow("Run workflow", primary: true) { [weak self] in self?.launch() }
        let actions = UIStackView(arrangedSubviews: [validate, run])
        actions.spacing = Space.space2
        // `.breadcrumb { flex: 1 1 220px }`: the buttons drop under it where 220pt and they do not fit.
        let top = WorkflowSpreadRow(crumb, actions, basis: 220, trails: false)
        // The save line keeps a box as wide as its longest words, so its edge stays still (`24ch`).
        saveLine.tabular = true
        let zero = ("0" as NSString).size(withAttributes: [.font: TypeScale.typeMeta.font]).width
        let saveBox = UIView()
        saveBox.translatesAutoresizingMaskIntoConstraints = false
        saveLine.translatesAutoresizingMaskIntoConstraints = false
        saveBox.addSubview(saveLine)
        NSLayoutConstraint.activate([
            saveBox.widthAnchor.constraint(equalToConstant: zero * 24),
            saveLine.trailingAnchor.constraint(equalTo: saveBox.trailingAnchor),
            saveLine.centerYAnchor.constraint(equalTo: saveBox.centerYAnchor),
            saveBox.heightAnchor.constraint(greaterThanOrEqualTo: saveLine.heightAnchor),
        ])
        saveBox.accessibilityTraits = .updatesFrequently
        tabRow.spacing = Space.space2
        tabRow.alignment = .center
        // The strip keeps its own width; the row's room is after it.
        let afterTabs = UIView()
        afterTabs.setContentHuggingPriority(.init(1), for: .horizontal)
        tabRow.addArrangedSubview(afterTabs)
        // The save line keeps to the row's end, on its own line where the tabs leave it no room (`margin-inline-start: auto`).
        let bottom = WorkflowSpreadRow(tabRow, saveBox, basis: nil, trails: true)
        header.addArrangedSubview(top)
        header.addArrangedSubview(bottom)

        // `.wf-error`: what went wrong, and Retry save beside it.
        errorText.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        retry = KitButton.workflow("Retry save") { [weak self] in self?.read(pressed: true) }
        error.addArrangedSubview(errorText)
        error.addArrangedSubview(retry)
        error.spacing = Space.space3
        error.alignment = .center
        error.isLayoutMarginsRelativeArrangement = true
        error.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
        error.backgroundColor = Palette.error3
        error.layer.cornerRadius = Radius.radiusSm
        error.isHidden = true

        let column = UIStackView(arrangedSubviews: [band, error, panes])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        headerEdges = [
            header.leadingAnchor.constraint(equalTo: band.leadingAnchor, constant: Space.space5),
            header.trailingAnchor.constraint(equalTo: band.trailingAnchor, constant: -Space.space5),
        ]
        NSLayoutConstraint.activate(headerEdges + [
            column.topAnchor.constraint(equalTo: safe.topAnchor),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            header.topAnchor.constraint(equalTo: band.topAnchor, constant: Space.space3),
            header.bottomAnchor.constraint(equalTo: band.bottomAnchor, constant: -Space.space3 - 1),
            rule.leadingAnchor.constraint(equalTo: band.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: band.trailingAnchor),
            rule.bottomAnchor.constraint(equalTo: band.bottomAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
        ])
        panes.show(skeleton())
    }

    /// The page is read again each time it is come to (`onMount`).
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        read(pressed: false)
        clock?.invalidate()
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        clock?.invalidate()
        clock = nil
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // `header { padding: var(--space-3) var(--space-5) }`; 11pt all round below 1024pt.
        let inline = narrow ? Space.space3 : Space.space5
        headerEdges[0].constant = inline
        headerEdges[1].constant = -inline
        program?.narrow = narrow
        runs?.narrow = narrow
        // The Editor tab is one pane below 1024pt and three from it.
        if narrow != laidNarrow {
            laidNarrow = narrow
            requestRefresh()
        }
    }

    private var laidNarrow: Bool?

    // MARK: Reading

    /// Reads the workflow and what the hub says of it as saved. Validate does
    /// the same: with nothing changed here, what is on screen is what is saved.
    private func read(pressed from: Bool) {
        pressed = from
        requestRefresh()
        Task {
            do {
                let read = try await hub.workflows.load(workflowId)
                detail = read
                failure = ""
                readAt = Date()
            } catch {
                failure = error.localizedDescription
            }
            pressed = false
            requestRefresh()
        }
        Task { await hub.workflows.refresh() }
    }

    private func revalidate() {
        guard !pressed else { return }
        read(pressed: true)
    }

    private func launch() {
        guard let workflow = detail?.workflow else { return }
        let form = WorkflowLaunchController(hub: hub, workflow: workflow) { [weak self] runId in
            self?.context.openSession(BoardRun.prefix + runId)
        }
        form.origin = run
        present(form, animated: true)
    }

    // MARK: Drawing

    override func refreshContent() {
        guard isViewLoaded else { return }
        let live = hub.state == .connected
        let names = Dictionary(hub.workflows.workflows.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let allRuns = hub.fleet.runs.values.filter { $0.workflowId == workflowId }
        name.text = detail?.workflow.name
        name.alpha = detail == nil ? 0.5 : 1
        errorText.text = failure
        error.isHidden = failure.isEmpty
        PromptCardView.setPending(validate, pressed && failure.isEmpty, label: "Validating…")
        PromptCardView.setPending(retry, pressed && !failure.isEmpty, label: "Saving…")
        validate.isEnabled = detail != nil && live
        let problems = detail?.problems ?? []
        run.isEnabled = detail != nil && live && failure.isEmpty && !pressed && problems.isEmpty
        tick()
        guard let detail else { return }
        let workflow = detail.workflow

        // The tabs: a workflow written as a program has no canvas, and opens on its program.
        let next = workflow.origin == .editor ? ["editor", "program", "runs"] : ["program", "runs"]
        if next != order {
            order = next
            if !next.contains(chosen) { chosen = "program" }
            tabs?.removeFromSuperview()
            // The web's `Tabs.List` here is ui/tabs (`.kit-segmented`), which `KitSegmented` ports.
            let made = KitSegmented(next.map { $0.prefix(1).uppercased() + $0.dropFirst() }, selected: next.firstIndex(of: chosen) ?? 0)
            made.accessibilityLabel = "Workflow views"
            made.addAction(UIAction { [weak self, weak made] _ in
                guard let self, let index = made?.selectedIndex, order.indices.contains(index) else { return }
                show(order[index])
            }, for: .valueChanged)
            tabRow.insertArrangedSubview(made, at: 0)
            tabs = made
            drawn = ""
        }

        let print = "\(chosen)|\(narrow)|\(workflow.program.hashValue)|\(workflow.graph?.nodes.count ?? 0)|\(problems.count)|\(readAt.timeIntervalSince1970)"
        if print != drawn {
            let from = drawn.split(separator: "|").first.map(String.init) ?? chosen
            drawn = print
            panes.show(pane(workflow, problems: problems, names: names), direction: PaneSlideView.towards(order, from: from, to: chosen))
        }
        program?.set(workflow, problems: problems)
        runs?.set(allRuns, sessions: hub.fleet.rows)
    }

    private func show(_ next: String) {
        guard next != chosen else { return }
        chosen = next
        requestRefresh()
    }

    private func pane(_ workflow: WorkflowRow, problems: [WorkflowProblem], names: [String: String]) -> UIView {
        canvas = nil
        program = nil
        runs = nil
        switch chosen {
        case "editor":
            let made = WorkflowCanvasView()
            var pinned: [String: String] = [:]
            for problem in problems {
                if let node = problem.nodeId, pinned[node] == nil { pinned[node] = problem.message }
            }
            made.set(workflow.graph ?? .empty, problems: pinned, names: names)
            canvas = made
            // From 1024pt the canvas stands between the palette and the inspector.
            return narrow ? made : WorkflowEditorPanes(canvas: made)
        case "runs":
            let made = WorkflowRunsList { [weak self] runId in self?.context.openSession(BoardRun.prefix + runId) }
            made.narrow = narrow
            runs = made
            return made
        default:
            let made = WorkflowProgramView()
            made.narrow = narrow
            program = made
            return made
        }
    }

    /// The save line's words (`saveState`): this page saves nothing, so it says when the workflow was last read as saved.
    private func tick() {
        if detail == nil {
            saveLine.text = "Loading…"
        } else if pressed {
            saveLine.text = "Saving…"
        } else {
            saveLine.text = "Saved · \(max(0, Int(Date().timeIntervalSince(readAt))))s ago"
        }
        runs?.tick()
    }

    /// `.loading`: two 80pt bars, 21pt in and 14pt apart.
    private func skeleton() -> UIView {
        let stack = UIStackView(arrangedSubviews: [SkeletonView(height: 80), SkeletonView(height: 80)])
        stack.axis = .vertical
        stack.spacing = Space.space4
        stack.translatesAutoresizingMaskIntoConstraints = false
        let box = UIView()
        box.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space6),
            stack.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space6),
            stack.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space6),
        ])
        box.isAccessibilityElement = true
        box.accessibilityLabel = "Loading workflow"
        return box
    }
}

/// The Editor tab from 1024pt (WorkflowEditor.svelte's `Resizable.PaneGroup`):
/// the palette's column, the canvas, and the inspector's column, a 1pt
/// handle in the border colour between each. The web's panes are resizable
/// shares of the group; these are its defaults: the palette 232pt of the
/// group's width (held between 15% and 30% of it), the inspector 360pt
/// (between 25% and 50%), the canvas the rest, each share taken of the width
/// the two handles leave. The palette's column is the page's own ground and
/// the inspector's the raised surface. Both stand empty: what fills them
/// comes with editing.
private final class WorkflowEditorPanes: UIView {
    private let palette = UIView()
    private let inspector = UIView()
    private let handles = [UIView(), UIView()]
    private let canvas: UIView

    init(canvas: UIView) {
        self.canvas = canvas
        super.init(frame: .zero)
        inspector.backgroundColor = Palette.surfaceRaised
        canvas.translatesAutoresizingMaskIntoConstraints = true
        for view in [palette, canvas, inspector] + handles { addSubview(view) }
        for handle in handles { handle.backgroundColor = Palette.border }
        palette.accessibilityIdentifier = "workflow-palette"
        inspector.accessibilityIdentifier = "workflow-inspector"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowEditorPanes is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        guard width > 0 else { return }
        let first = min(0.30, max(0.15, 232 / width))
        let last = min(0.50, max(0.25, 360 / width))
        let room = width - 2
        let paletteWidth = first * room
        let inspectorWidth = last * room
        let canvasWidth = room - paletteWidth - inspectorWidth
        palette.frame = CGRect(x: 0, y: 0, width: paletteWidth, height: bounds.height)
        handles[0].frame = CGRect(x: paletteWidth, y: 0, width: 1, height: bounds.height)
        canvas.frame = CGRect(x: paletteWidth + 1, y: 0, width: canvasWidth, height: bounds.height)
        handles[1].frame = CGRect(x: paletteWidth + 1 + canvasWidth, y: 0, width: 1, height: bounds.height)
        inspector.frame = CGRect(x: paletteWidth + canvasWidth + 2, y: 0, width: inspectorWidth, height: bounds.height)
    }
}

/// Two things on one row, the second at its end (`.wf-row.wf-spread`: a
/// wrapping flex row, 7pt apart). Where they do not fit side by side the
/// second drops under the first: at the start, or kept at the end when it
/// `trails`. `basis` is the least the first may be given before it wraps.
private final class WorkflowSpreadRow: UIStackView {
    private let first: UIView
    private let second: UIView
    private let basis: Double?
    private let trails: Bool
    private let spacer = UIView()
    private var wrapped: Bool?

    init(_ first: UIView, _ second: UIView, basis: Double?, trails: Bool) {
        self.first = first
        self.second = second
        self.basis = basis
        self.trails = trails
        super.init(frame: .zero)
        spacing = Space.space2
        spacer.setContentHuggingPriority(.init(2), for: .horizontal)
        second.setContentHuggingPriority(.required, for: .horizontal)
        second.setContentCompressionResistancePriority(.required, for: .horizontal)
        arrange(false)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("WorkflowSpreadRow is built in code")
    }

    private func arrange(_ wrap: Bool) {
        guard wrap != wrapped else { return }
        wrapped = wrap
        arrangedSubviews.forEach { removeArrangedSubview($0); $0.removeFromSuperview() }
        if wrap {
            axis = .vertical
            alignment = .fill
            addArrangedSubview(first)
            if trails {
                let line = UIStackView(arrangedSubviews: [spacer, second])
                addArrangedSubview(line)
            } else {
                let line = UIStackView(arrangedSubviews: [second, spacer])
                addArrangedSubview(line)
            }
        } else {
            axis = .horizontal
            alignment = .center
            addArrangedSubview(first)
            // A first that has a basis grows to the second; one without leaves the room between them empty.
            if basis == nil { addArrangedSubview(spacer) }
            addArrangedSubview(second)
        }
    }

    override func layoutSubviews() {
        let fitting = UIView.layoutFittingCompressedSize
        let need = (basis ?? first.systemLayoutSizeFitting(fitting).width) + Space.space2 + second.systemLayoutSizeFitting(fitting).width
        arrange(bounds.width > 0 && need > bounds.width)
        super.layoutSubviews()
    }
}

/// The breadcrumb's way back (`.breadcrumb a`): muted body text, 24pt tall at the least and 44pt under a finger.
private final class WorkflowCrumbLink: UIControl {
    init(_ text: String, action: @escaping () -> Void) {
        super.init(frame: .zero)
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
        label.text = text
        label.isUserInteractionEnabled = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor),
            label.trailingAnchor.constraint(equalTo: trailingAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: WorkflowForm.coarse ? Size.cBtnHLg : 24),
        ])
        addAction(UIAction { _ in action() }, for: .touchUpInside)
        addInteraction(UIPointerInteraction(delegate: nil))
        isAccessibilityElement = true
        accessibilityTraits = .link
        accessibilityLabel = text
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowCrumbLink is built in code")
    }

    override var isHighlighted: Bool {
        didSet { alpha = isHighlighted ? 0.6 : 1 }
    }
}

// MARK: Program

/// The Program tab (WorkflowProgram.svelte): a line saying where the program
/// comes from, the program in its recessed well inside a raised card, and
/// for a workflow written as a program what the hub's compiler found.
final class WorkflowProgramView: UIView {
    var narrow = false { didSet { if narrow != oldValue { pad() } } }
    private let note = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
    private let code = CodeView(label: "Workflow program")
    private let card = TileView(radius: Radius.radiusMd)
    private let problemsBox = UIView()
    private let problemsScroll = UIScrollView()
    private let problemsList = UIStackView()
    private let head = CrossView()
    private var edges: [NSLayoutConstraint] = []
    private var shown = ""

    init() {
        super.init(frame: .zero)
        let noteBox = UIView()
        noteBox.translatesAutoresizingMaskIntoConstraints = false
        noteBox.addSubview(note)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        noteBox.addSubview(rule)
        card.addSubview(code)
        let cardBox = UIView()
        cardBox.translatesAutoresizingMaskIntoConstraints = false
        cardBox.addSubview(card)

        // `.problems`: on the raised surface under a hairline, at most 30% of the screen tall, scrolling past it.
        problemsBox.backgroundColor = Palette.surfaceRaised
        problemsBox.translatesAutoresizingMaskIntoConstraints = false
        let top = UIView()
        top.backgroundColor = Palette.borderHairline
        top.translatesAutoresizingMaskIntoConstraints = false
        problemsBox.addSubview(top)
        problemsScroll.translatesAutoresizingMaskIntoConstraints = false
        problemsBox.addSubview(problemsScroll)
        problemsList.axis = .vertical
        problemsList.spacing = Space.space2
        problemsList.translatesAutoresizingMaskIntoConstraints = false
        problemsScroll.addSubview(problemsList)
        problemsList.addArrangedSubview(head)
        problemsBox.accessibilityLabel = "Problems"

        let column = UIStackView(arrangedSubviews: [noteBox, cardBox, problemsBox])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let fit = problemsScroll.heightAnchor.constraint(equalTo: problemsList.heightAnchor, constant: Space.space4 + Space.space5)
        fit.priority = .defaultHigh
        edges = [
            note.leadingAnchor.constraint(equalTo: noteBox.leadingAnchor, constant: Space.space5),
            note.trailingAnchor.constraint(equalTo: noteBox.trailingAnchor, constant: -Space.space5),
            card.leadingAnchor.constraint(equalTo: cardBox.leadingAnchor, constant: Space.space5),
            card.trailingAnchor.constraint(equalTo: cardBox.trailingAnchor, constant: -Space.space5),
            problemsList.leadingAnchor.constraint(equalTo: problemsScroll.frameLayoutGuide.leadingAnchor, constant: Space.space5),
            problemsList.trailingAnchor.constraint(equalTo: problemsScroll.frameLayoutGuide.trailingAnchor, constant: -Space.space5),
        ]
        NSLayoutConstraint.activate(edges + [
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            note.topAnchor.constraint(equalTo: noteBox.topAnchor, constant: Space.space3),
            note.bottomAnchor.constraint(equalTo: noteBox.bottomAnchor, constant: -Space.space3 - 1),
            rule.leadingAnchor.constraint(equalTo: noteBox.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: noteBox.trailingAnchor),
            rule.bottomAnchor.constraint(equalTo: noteBox.bottomAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            // `.code`: 14pt above, 18pt below, 7pt of card round the well, at least 320pt tall.
            card.topAnchor.constraint(equalTo: cardBox.topAnchor, constant: Space.space4),
            card.bottomAnchor.constraint(equalTo: cardBox.bottomAnchor, constant: -Space.space5),
            card.heightAnchor.constraint(greaterThanOrEqualToConstant: 320),
            code.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space2),
            code.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Space.space2),
            code.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space2),
            code.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space2),
            top.topAnchor.constraint(equalTo: problemsBox.topAnchor),
            top.leadingAnchor.constraint(equalTo: problemsBox.leadingAnchor),
            top.trailingAnchor.constraint(equalTo: problemsBox.trailingAnchor),
            top.heightAnchor.constraint(equalToConstant: 1),
            problemsScroll.topAnchor.constraint(equalTo: problemsBox.topAnchor, constant: 1),
            problemsScroll.bottomAnchor.constraint(equalTo: problemsBox.bottomAnchor),
            problemsScroll.leadingAnchor.constraint(equalTo: problemsBox.leadingAnchor),
            problemsScroll.trailingAnchor.constraint(equalTo: problemsBox.trailingAnchor),
            problemsScroll.heightAnchor.constraint(lessThanOrEqualToConstant: (UIScreen.main.bounds.height * 0.3).rounded()),
            fit,
            problemsList.topAnchor.constraint(equalTo: problemsScroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            problemsList.bottomAnchor.constraint(equalTo: problemsScroll.contentLayoutGuide.bottomAnchor, constant: -Space.space5),
        ])
        cardBox.setContentHuggingPriority(.defaultLow - 1, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowProgramView is built in code")
    }

    /// 18pt at the sides; 14pt below 1024pt.
    private func pad() {
        let inline = narrow ? Space.space4 : Space.space5
        for (index, edge) in edges.enumerated() { edge.constant = index.isMultiple(of: 2) ? inline : -inline }
    }

    /// The hub prefixes a typecheck diagnostic with its line; the gutter and the chip already say it (`withoutLine`).
    private static func withoutLine(_ text: String) -> String {
        text.replacing(/^Line \d+:\s*/, with: "")
    }

    func set(_ workflow: WorkflowRow, problems: [WorkflowProblem]) {
        let code = workflow.origin == .code
        note.text = code ? "The program is the workflow. It saves as you type." : "Compiled from this graph on save. Edit the graph to change it."
        self.code.set(workflow.program, flagged: Set(problems.compactMap { $0.line.map { Int($0) } }))
        problemsBox.isHidden = !code
        let print = problems.map { "\($0.line ?? 0)|\($0.message)" }.joined(separator: "\n")
        guard code, print != shown || head.current == nil else { return }
        shown = print
        // The count and the all-clear cross-fade in one place.
        if problems.isEmpty {
            let clear = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
            clear.text = "The hub compiled and typechecked this program. No problems found."
            head.show(clear)
        } else {
            let count = KitLabel(WorkflowForm.text(TypeScale.typeLabel), ink: Palette.inkStrong)
            count.tabular = true
            count.text = "Problems · \(problems.count)"
            count.accessibilityTraits = .header
            head.show(count)
        }
        for view in problemsList.arrangedSubviews where view !== head { view.removeFromSuperview() }
        for problem in problems {
            // `.problem`: on the recess at `--radius-sm`, 11pt in; its line muted before it.
            let text = NSMutableAttributedString()
            let role = TypeScale.typeBody
            if let line = problem.line {
                text.append(NSAttributedString(string: "Line \(Int(line))  ", attributes: role.attributes(color: Palette.inkMuted)))
                text.append(NSAttributedString(string: Self.withoutLine(problem.message), attributes: role.attributes(color: Palette.inkStrong)))
            } else {
                text.append(NSAttributedString(string: problem.message, attributes: role.attributes(color: Palette.inkStrong)))
            }
            let label = UILabel()
            label.numberOfLines = 0
            label.attributedText = text
            label.translatesAutoresizingMaskIntoConstraints = false
            let box = UIView()
            box.backgroundColor = Palette.surfaceRecess
            box.layer.cornerRadius = Radius.radiusSm
            box.addSubview(label)
            NSLayoutConstraint.activate([
                label.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space3),
                label.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space3),
                label.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
                label.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space3),
            ])
            problemsList.addArrangedSubview(box)
        }
    }
}

// MARK: Runs

/// The Runs tab (WorkflowEditor.svelte `.runs`): All, Needs you and Failed
/// over this workflow's runs, newest first, each its start, its status, how
/// long it ran and the session that supervises it. A run opens in its own
/// tab, as a session does: watching a run is not editing its workflow.
final class WorkflowRunsList: UIView {
    var narrow = false { didSet { if narrow != oldValue { fit() } } }
    private let open: (String) -> Void
    private let scroll = UIScrollView()
    private let list = UIStackView()
    private let filters = UIStackView()
    private let rows = UIStackView()
    private var filter = "all"
    private var all: [BoardRun] = []
    private var titles: [String: String] = [:]
    private var durations: [(label: KitLabel, run: BoardRun, tail: String)] = []
    private var wide: NSLayoutConstraint!
    private var full: NSLayoutConstraint!
    private var shown = ""

    init(open: @escaping (String) -> Void) {
        self.open = open
        super.init(frame: .zero)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        addSubview(scroll)
        list.axis = .vertical
        list.spacing = Space.space4
        list.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(list)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rule)
        filters.spacing = Space.space2
        for (value, label) in [("all", "All"), ("waiting", "Needs you"), ("failed", "Failed")] {
            let button = KitButton.workflow(label) { [weak self] in self?.choose(value) }
            button.accessibilityIdentifier = value
            // `.filters .wf-btn`: no fill of its own; the chosen one rides the surface.
            let resting = button.configurationUpdateHandler
            button.configurationUpdateHandler = { button in
                resting?(button)
                button.configuration?.background.backgroundColor = button.isSelected ? Palette.surfaceFill : .clear
            }
            filters.addArrangedSubview(button)
        }
        filters.addArrangedSubview(UIView())
        // The entries are parts of the same stack: 14pt apart, like the filters above them.
        rows.axis = .vertical
        rows.spacing = Space.space4
        list.addArrangedSubview(filters)
        list.addArrangedSubview(rows)
        // `.run-list`: 300pt wide beside a hairline, or the page's width below 1024pt; 11pt in.
        // Its 300pt include the hairline at its end.
        wide = scroll.widthAnchor.constraint(equalToConstant: 299)
        full = scroll.trailingAnchor.constraint(equalTo: trailingAnchor)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            rule.leadingAnchor.constraint(equalTo: scroll.trailingAnchor),
            rule.topAnchor.constraint(equalTo: topAnchor),
            rule.bottomAnchor.constraint(equalTo: bottomAnchor),
            rule.widthAnchor.constraint(equalToConstant: 1),
            list.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space3),
            list.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space3),
            list.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space3),
            list.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space3),
        ])
        ruleView = rule
        fit()
        mark()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowRunsList is built in code")
    }

    private weak var ruleView: UIView?

    private func fit() {
        wide.isActive = !narrow
        full.isActive = narrow
        ruleView?.isHidden = narrow
    }

    private func choose(_ value: String) {
        filter = value
        mark()
        shown = ""
        draw()
    }

    /// A pressed filter rides the surface and the edge, never a hue (`aria-pressed`).
    private func mark() {
        for case let button as UIButton in filters.arrangedSubviews {
            button.isSelected = button.accessibilityIdentifier == filter
            button.setNeedsUpdateConfiguration()
        }
    }

    func set(_ runs: [BoardRun], sessions: [InstanceRow]) {
        all = runs.sorted { $0.startedAt > $1.startedAt }
        titles = Dictionary(sessions.compactMap { row in row.title.map { (row.id, $0) } }, uniquingKeysWith: { first, _ in first })
        draw()
    }

    private func draw() {
        let listed = all.filter { filter == "all" || $0.status.rawValue == filter }
        let print = "\(filter)\n" + listed.map { "\($0.id)|\($0.status.rawValue)|\($0.endedAt ?? 0)" }.joined(separator: "\n")
        guard print != shown else { return }
        shown = print
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        durations = []
        if listed.isEmpty {
            let none = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
            none.text = "No workflow runs in this view."
            rows.addArrangedSubview(none)
        }
        for run in listed {
            let started = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
            started.text = Date(timeIntervalSince1970: run.startedAt / 1000).formatted(date: .numeric, time: .standard)
            started.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let top = UIStackView(arrangedSubviews: [started, UIView(), WorkflowStatusChip(run.status)])
            top.alignment = .center
            top.spacing = Space.space2
            let meta = KitLabel(WorkflowForm.text(TypeScale.typeMeta), ink: Palette.inkMuted, lines: 0)
            let tail = run.supervisorInstanceId.flatMap { titles[$0] }.map { " · from \($0)" } ?? ""
            durations.append((meta, run, tail))
            let entry = RunEntry(arrangedSubviews: [top, meta]) { [open] in open(run.id) }
            entry.accessibilityLabel = "\(started.text ?? ""), \(run.status.rawValue)"
            rows.addArrangedSubview(entry)
        }
        tick()
    }

    /// A running run's time counts on.
    func tick() {
        let now = Date()
        for entry in durations {
            let start = Date(timeIntervalSince1970: entry.run.startedAt / 1000)
            let end = entry.run.endedAt.map { Date(timeIntervalSince1970: $0 / 1000) }
            entry.label.text = RunModel.duration(start, end, now) + entry.tail
        }
    }

    /// `.run-entry`: 11pt in over a hairline, its two lines 14pt apart.
    private final class RunEntry: UIControl {
        private let action: () -> Void

        init(arrangedSubviews: [UIView], action: @escaping () -> Void) {
            self.action = action
            super.init(frame: .zero)
            let stack = UIStackView(arrangedSubviews: arrangedSubviews)
            stack.axis = .vertical
            stack.spacing = Space.space4
            stack.isUserInteractionEnabled = false
            stack.translatesAutoresizingMaskIntoConstraints = false
            addSubview(stack)
            let rule = UIView()
            rule.backgroundColor = Palette.borderHairline
            rule.translatesAutoresizingMaskIntoConstraints = false
            addSubview(rule)
            NSLayoutConstraint.activate([
                stack.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
                stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3 - 1),
                stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
                stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
                rule.leadingAnchor.constraint(equalTo: leadingAnchor),
                rule.trailingAnchor.constraint(equalTo: trailingAnchor),
                rule.bottomAnchor.constraint(equalTo: bottomAnchor),
                rule.heightAnchor.constraint(equalToConstant: 1),
            ])
            addAction(UIAction { [weak self] _ in self?.action() }, for: .touchUpInside)
            addInteraction(UIPointerInteraction(delegate: nil))
            isAccessibilityElement = true
            accessibilityTraits = .link
            accessibilityIdentifier = "workflow-run"
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("RunEntry is built in code")
        }

        override var isHighlighted: Bool {
            didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
        }
    }
}
