import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// A workflow run's tab (WorkflowRunView.svelte): what a session's tab is for
/// a session. Its name with its status, when it started and how long it has
/// run, what it was given, Cancel or Re-run and Edit workflow; its steps hung
/// under it on the nesting rails (RunSteps.svelte), each folding open its
/// result and opening its own session or run; the question it waits on; and
/// its log. Cancel asks first, in the house confirm.
final class WorkflowRunViewController: ObservedViewController, UIGestureRecognizerDelegate {
    let runId: String
    private let hub: HubConnection
    private let detail: WorkflowRunDetail
    private let scroll = UIScrollView()
    private let column = UIStackView()
    private let error = WorkflowError()
    private let loading = UIStackView()
    private let head = UIStackView()
    private let steps = RunStepsView()
    private let answer = UIStackView()
    private let log = RunLogView()
    private let feedback = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let note = UITextField()
    private let other = UITextField()
    private let value = UITextView(usingTextLayoutManager: true)
    private var answerButtons: [UIButton] = []
    private var durations: [(label: KitLabel, start: Date?, end: Date?)] = []
    private var askId: String?
    private var contentPrint = ""
    private var clock: Timer?
    private var headDuration: KitLabel?
    private var hintObserver: (any NSObjectProtocol)?
    var onReturn: () -> Void = {}
    var onOpen: (String) -> Void = { _ in }

    init(hub: HubConnection, runId: String) {
        self.hub = hub; self.runId = runId
        detail = hub.workflowRuns.open(runId)
        super.init(nibName: nil, bundle: nil)
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("WorkflowRunViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        dressBar()
        column.axis = .vertical
        column.spacing = Space.space5
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll); scroll.addSubview(column)
        let endEditing = UITapGestureRecognizer(target: self, action: #selector(endFormEditing))
        endEditing.cancelsTouchesInView = false
        endEditing.delegate = self
        view.addGestureRecognizer(endEditing)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            // The transcript's own ledger padding; 14pt a side on a phone.
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space4),
            column.trailingAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space4),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: 760),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space7),
        ])
        let width = column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space4 * 2)
        width.priority = .defaultHigh
        width.isActive = true

        // While the run and the workflow list are read: three skeleton bars.
        loading.axis = .vertical
        loading.spacing = Space.space3
        loading.alignment = .leading
        for (w, h) in [(224.0, 24.0), (160.0, 16.0), (0.0, 96.0)] {
            let bar = UIView()
            bar.backgroundColor = Palette.surfaceFill
            bar.layer.cornerRadius = Radius.radiusSm
            bar.translatesAutoresizingMaskIntoConstraints = false
            bar.heightAnchor.constraint(equalToConstant: h).isActive = true
            loading.addArrangedSubview(bar)
            if w > 0 { bar.widthAnchor.constraint(equalToConstant: w).isActive = true }
            else { bar.widthAnchor.constraint(equalTo: loading.widthAnchor).isActive = true }
        }
        loading.isAccessibilityElement = true
        loading.accessibilityLabel = "Loading workflow run"
        head.axis = .vertical
        head.spacing = Space.space2
        let run = UIStackView(arrangedSubviews: [head, steps])
        run.axis = .vertical
        run.spacing = Space.space1
        answer.axis = .vertical
        answer.spacing = Space.space4
        answer.isLayoutMarginsRelativeArrangement = true
        answer.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space4, leading: Space.space4, bottom: Space.space4, trailing: Space.space4)
        answer.backgroundColor = Palette.surfaceRaised
        answer.layer.cornerRadius = Radius.radiusSm
        answer.isHidden = true
        for view in [error, loading, run, answer, feedback, log] as [UIView] { column.addArrangedSubview(view) }
        error.isHidden = true
        feedback.isHidden = true
        log.isHidden = true
        steps.onOpen = { [weak self] id in self?.onOpen(id) }
        steps.onHeight = { [weak self] in self?.animateLayout() }
        log.onHeight = { [weak self] in self?.animateLayout() }
    }

    /// The system bar, dressed as the session's.
    private func dressBar() {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = Palette.surfaceRaised
        appearance.shadowColor = Palette.seam
        navigationItem.standardAppearance = appearance
        navigationItem.scrollEdgeAppearance = appearance
        navigationItem.compactAppearance = appearance
        let back = UIBarButtonItem(title: "Fleet", image: Glyph.chevronLeft.image.resized(to: Size.iconLg), primaryAction: UIAction { [weak self] _ in self?.onReturn() })
        back.tintColor = Palette.inkStrong
        if #available(iOS 26.0, macCatalyst 26.0, *) { back.hidesSharedBackground = true }
        NavigationItems.configure(navigationItem, leading: [back])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        clock?.invalidate()
        // The clock runs while the run does.
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        clock?.invalidate()
        clock = nil
    }

    /// The rails are drawn off the laid-out glyphs: the run's (in the head)
    /// and each step's, so they are redrawn once the whole column has laid out.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        scroll.layoutIfNeeded()
        steps.drawRails()
    }

    private func animateLayout() {
        guard view.window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        Motion.easeDrawer.animator(Motion.durPanel) { self.view.layoutIfNeeded() }.startAnimation()
    }

    // MARK: Model

    override func refreshContent() {
        guard isViewLoaded else { return }
        error.text = detail.error
        error.isHidden = detail.error == nil
        let named = detail.run.flatMap { hub.fleet.workflowNames[$0.workflowId] }
        guard let run = detail.run, named != nil || hub.fleet.fleetRead else {
            loading.isHidden = false
            return
        }
        loading.isHidden = true
        let model = RunModel(run, name: named ?? "Workflow")
        navigationItem.title = nil
        let print = model.print + "\(hub.state == .connected)\(detail.acting ?? "")"
        if print != contentPrint {
            contentPrint = print
            buildHead(model)
            steps.configure(model, going: model.going, live: hub.state == .connected, rerun: { [weak self] stepId in self?.rerun(from: stepId) })
            durations = (headDuration.map { [($0, model.startedAt, model.endedAt)] } ?? []) + steps.durations
        }
        if let ask = run.ask, run.status == .waiting {
            if askId != ask.stepId { buildAnswer(ask); askId = ask.stepId }
            answer.isHidden = false
        } else { answer.isHidden = true; askId = nil }
        let enabled = detail.acting == nil && hub.state == .connected
        answerButtons.forEach { $0.isEnabled = enabled }
        note.isEnabled = enabled; other.isEnabled = enabled; value.isEditable = enabled
        switch detail.answerStage {
        case .submitting: feedback.text = "Answering…"
        case .answered: feedback.text = "Answered"
        case .failed, .pending: feedback.text = detail.answerStage == .pending && hub.state != .connected ? "Can't answer while the hub is unreachable" : ""
        }
        feedback.isHidden = feedback.text?.isEmpty != false || answer.isHidden
        log.configure(detail.log)
        log.isHidden = detail.log.isEmpty
    }

    private func tick() {
        let now = Date()
        for entry in durations {
            entry.label.text = RunModel.duration(entry.start, entry.end, now)
        }
    }

    // MARK: Head

    private func buildHead(_ model: RunModel) {
        head.arrangedSubviews.forEach { $0.removeFromSuperview() }
        // The status's glyph leads the name and its word follows it.
        let status = SessionStatusView(model.face, compact: true)
        let name = KitLabel(TypeScale.typeTitle.with(weight: .medium), ink: Palette.inkStrong)
        name.text = model.name
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let word = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        word.text = model.face.label
        let title = UIStackView(arrangedSubviews: [status, name, word, UIView()])
        title.spacing = Space.space2
        title.alignment = .center
        title.isAccessibilityElement = true
        title.accessibilityTraits = .header
        title.accessibilityLabel = "\(model.name), \(model.face.label)"
        head.addArrangedSubview(title)
        steps.anchor = status

        let started = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        started.text = "Started \(model.startedText)"
        let duration = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        duration.tabular = true
        duration.text = RunModel.duration(model.startedAt, model.endedAt, Date())
        let meta = UIStackView(arrangedSubviews: [started, duration, UIView()])
        meta.spacing = Space.space3
        head.addArrangedSubview(meta)
        headDuration = duration

        if !model.inputs.isEmpty {
            let grid = UIStackView()
            grid.axis = .vertical
            grid.spacing = Space.space1
            for (key, value) in model.inputs {
                let k = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
                k.text = key
                k.setContentHuggingPriority(.required, for: .horizontal)
                let v = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.inkStrong, lines: 0)
                v.text = value
                let row = UIStackView(arrangedSubviews: [k, v])
                row.spacing = Space.space3
                row.alignment = .firstBaseline
                grid.addArrangedSubview(row)
            }
            head.addArrangedSubview(grid)
        }

        let live = hub.state == .connected
        let primary: UIButton
        if model.going {
            primary = KitButton.workflow("Cancel run") { [weak self] in self?.confirmCancel(model) }
            primary.isEnabled = detail.acting == nil && live
        } else {
            primary = KitButton.workflow("Re-run") { [weak self] in self?.rerun(from: nil) }
            primary.isEnabled = (detail.acting == nil || detail.acting == "rerun") && live
            PromptCardView.setPending(primary, detail.acting == "rerun", label: "Re-running…")
        }
        let edit = KitButton.workflow("Edit workflow") { [weak self] in
            guard let address = self?.hub.address else { return }
            var url = address.appendingPathComponent("workflows/\(model.workflowId)")
            url.append(queryItems: [URLQueryItem(name: "tab", value: "program")])
            UIApplication.shared.open(url)
        }
        let actions = UIStackView(arrangedSubviews: [primary, edit, UIView()])
        actions.spacing = Space.space2
        head.addArrangedSubview(actions)
        head.setCustomSpacing(Space.space2 + Space.space1, after: head.arrangedSubviews[head.arrangedSubviews.count - 2])

        if let failure = model.failure {
            let block = WorkflowError()
            block.text = failure
            head.addArrangedSubview(block)
            head.setCustomSpacing(Space.space3, after: actions)
        }
    }

    // MARK: Answer

    private func buildAnswer(_ ask: CawCoAPI.Components.Schemas.WorkflowAsk) {
        answer.arrangedSubviews.forEach { $0.removeFromSuperview() }
        answerButtons = []; note.text = ""; other.text = ""; value.text = ""
        let heading = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        heading.text = "Answer · \(ask.question)"
        heading.accessibilityTraits = .header
        answer.addArrangedSubview(heading)
        var options: [UIView] = []
        for option in ask.options {
            let button = KitButton.workflow(option.label) { [weak self] in self?.submit(choice: option.label) }
            if let description = option.description {
                var config = button.configuration
                config?.attributedSubtitle = AttributedString(description, attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
                config?.titleAlignment = .leading
                config?.contentInsets = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
                button.configuration = config
                button.widthAnchor.constraint(lessThanOrEqualToConstant: 320).isActive = true
            }
            answerButtons.append(button)
            options.append(button)
        }
        if !options.isEmpty { answer.addArrangedSubview(WrapLayout(options, gap: Space.space3)) }
        field(note, name: "Note (optional)")
        if let schema = ask.answerSchema {
            let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
            name.text = "Answer value (JSON)"
            value.font = TypeScale.typeBody.font; value.textColor = Palette.inkStrong; value.backgroundColor = Palette.surfaceRaised
            value.layer.cornerRadius = Radius.radiusSm
            value.layer.borderWidth = 1
            value.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
            value.accessibilityLabel = "Answer value (JSON)"
            value.accessibilityHint = shown(schema)
            // The schema the program declared is the field's placeholder.
            value.textContainerInset = UIEdgeInsets(top: Space.space2, left: Space.space3 - 5, bottom: Space.space2, right: Space.space3 - 5)
            let hint = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
            hint.text = shown(schema)
            hint.isUserInteractionEnabled = false
            value.addSubview(hint)
            NSLayoutConstraint.activate([
                hint.leadingAnchor.constraint(equalTo: value.frameLayoutGuide.leadingAnchor, constant: Space.space3),
                hint.trailingAnchor.constraint(equalTo: value.frameLayoutGuide.trailingAnchor, constant: -Space.space3),
                hint.topAnchor.constraint(equalTo: value.frameLayoutGuide.topAnchor, constant: Space.space2),
                hint.bottomAnchor.constraint(lessThanOrEqualTo: value.frameLayoutGuide.bottomAnchor, constant: -Space.space2),
            ])
            hintObserver = NotificationCenter.default.addObserver(forName: UITextView.textDidChangeNotification, object: value, queue: .main) { [weak hint, weak value] _ in
                MainActor.assumeIsolated { hint?.isHidden = value?.text.isEmpty == false }
            }
            value.heightAnchor.constraint(equalToConstant: Space.space8 * 3).isActive = true
            let typed = UIStackView(arrangedSubviews: [name, value])
            typed.axis = .vertical
            typed.spacing = Space.space2
            answer.addArrangedSubview(typed)
            if ask.options.isEmpty { addSend { [weak self] in self?.submit(choice: nil) } }
        }
        if ask.allowOther {
            field(other, name: "Other answer")
            addSend { [weak self] in self?.submit(choice: self?.other.text) }
        }
        // It folds open (`unfold`).
        if view.window != nil, !UIAccessibility.isReduceMotionEnabled {
            answer.alpha = 0
            Motion.easeDrawer.animator(Motion.durPanel) { self.answer.alpha = 1 }.startAnimation()
        }
    }

    private func addSend(_ action: @escaping () -> Void) {
        let button = KitButton.workflow("Send answer", action: action)
        answerButtons.append(button)
        let row = UIStackView(arrangedSubviews: [button, UIView()])
        answer.addArrangedSubview(row)
    }

    private func field(_ field: UITextField, name: String) {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = name
        field.font = TypeScale.typeBody.font
        field.textColor = Palette.inkStrong
        field.backgroundColor = Palette.surfaceRaised
        field.accessibilityLabel = name
        field.layer.cornerRadius = Radius.radiusSm
        field.layer.borderWidth = 1
        field.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: Space.space3, height: 1))
        field.leftViewMode = .always
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        let stack = UIStackView(arrangedSubviews: [label, field])
        stack.axis = .vertical
        stack.spacing = Space.space2
        answer.addArrangedSubview(stack)
    }

    private func submit(choice: String?) {
        view.endEditing(true)
        hub.workflowRuns.answer(runId, choice: choice, note: note.text ?? "", valueText: value.text ?? "")
        requestRefresh()
    }

    private func shown(_ value: Any?) -> String {
        guard let value else { return "" }
        if let text = value as? String { return text }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        if let encoded = value as? any Encodable,
           let data = try? encoder.encode(encoded), let text = String(data: data, encoding: .utf8) { return text }
        return String(describing: value)
    }

    // MARK: Actions

    /// Runs the workflow again, from the start or from one step, and opens the new run.
    private func rerun(from stepId: String?) {
        hub.workflowRuns.rerun(runId, fromStepId: stepId) { [weak self] id in self?.onOpen(BoardRun.prefix + id) }
        requestRefresh()
    }

    private func confirmCancel(_ model: RunModel) {
        let names = model.steps.filter { $0.status == "running" && $0.instanceId != nil }.map(\.title)
        ConfirmSheetController.present(
            from: self,
            title: "Cancel workflow run?",
            body: "Stops these live sessions and any child runs: \(names.isEmpty ? "No live step sessions reported" : names.joined(separator: ", ")). Pending steps will be skipped.",
            confirmLabel: "Cancel run",
            pendingLabel: "Cancelling…",
            destructive: true
        ) { [weak self] done in
            guard let self else { return }
            hub.workflowRuns.cancel(runId, done: done)
        }
    }

    @objc private func endFormEditing() { view.endEditing(true) }
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var target = touch.view
        while let candidate = target {
            if candidate is UITextField || candidate is UITextView || candidate is UIControl { return false }
            target = candidate.superview
        }
        return true
    }
}

/// `.wf-error`: the error's ink on its wash, 11pt in, radius 8.
final class WorkflowError: UIView {
    private let label = KitLabel(TypeScale.typeBody, ink: Palette.error11, lines: 0)
    var text: String? {
        get { label.text }
        set { label.text = newValue }
    }

    init() {
        super.init(frame: .zero)
        backgroundColor = Palette.error3
        layer.cornerRadius = Radius.radiusSm
        addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
            label.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
        ])
        label.accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("WorkflowError is built in code") }
}

// MARK: The run, as the tab reads it

/// The run's detail as the tab draws it, read once per change.
struct RunModel {
    struct Step {
        let id: String
        let title: String
        let status: String
        let startedAt: Date?
        let endedAt: Date?
        let failure: String?
        let result: String?
        let instanceId: String?
        let childRunId: String?
    }

    let name: String
    let workflowId: String
    let status: String
    let face: SessionStatusView.Face
    let startedAt: Date?
    let endedAt: Date?
    let inputs: [(String, String)]
    let failure: String?
    let steps: [Step]
    let print: String

    var going: Bool { status == "running" || status == "waiting" }

    /// When it started, to the minute, with the day when it was not today.
    var startedText: String {
        guard let startedAt else { return "" }
        return Calendar.current.isDateInToday(startedAt)
            ? startedAt.formatted(date: .omitted, time: .shortened)
            : startedAt.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    init(_ run: Components.Schemas.GetApiWorkflowRunsById200, name: String) {
        let data = (try? JSONEncoder().encode(run)) ?? Data()
        let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        print = String(data: data, encoding: .utf8) ?? ""
        self.name = name
        workflowId = raw["workflowId"] as? String ?? ""
        status = raw["status"] as? String ?? "unknown"
        // A run's tab reads its status on the session scale (SessionStatus.svelte).
        face = switch status {
        case "running": .working
        case "waiting": .needsYou
        case "done": .done
        case "failed": .failed
        case "cancelled": .cancelled
        default: .unknown
        }
        startedAt = Self.date(raw["startedAt"])
        endedAt = Self.date(raw["endedAt"])
        inputs = ((raw["inputs"] as? [String: Any]) ?? [:]).sorted { $0.key < $1.key }.map { ($0.key, Self.shown($0.value)) }
        failure = raw["failure"] as? String
        let nodes = ((raw["graph"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []
        let result = raw["result"]
        let list = (raw["steps"] as? [[String: Any]]) ?? []
        steps = list.map { step in
            let nodeId = step["nodeId"] as? String ?? ""
            let instanceId = step["instanceId"] as? String
            // workflow-runs.ts `stepTitle`: the node's title, else what its call named it, else its id.
            var title = nodes.first { $0["id"] as? String == nodeId }?["title"] as? String
                ?? step["title"] as? String
                ?? nodeId
            if let index = step["mapIndex"] as? Double { title += " [\(Int(index))]" }
            let failure = step["failure"] as? String
            let value = step["kind"] as? String == "end" ? result : step["result"]
            let returned = failure ?? ((value == nil || value is NSNull) ? nil : Self.pretty(value))
            return Step(
                id: step["id"] as? String ?? nodeId,
                title: title,
                status: step["status"] as? String ?? "unknown",
                startedAt: Self.date(step["startedAt"]),
                endedAt: Self.date(step["endedAt"]),
                failure: failure,
                result: returned,
                instanceId: instanceId,
                childRunId: step["childRunId"] as? String
            )
        }.sorted { ($0.startedAt ?? .distantFuture) < ($1.startedAt ?? .distantFuture) }
    }

    /// workflow-ui.ts `duration`: tenths under ten seconds once ended, then
    /// whole seconds, then minutes and seconds.
    static func duration(_ start: Date?, _ end: Date?, _ now: Date) -> String {
        guard let start else { return "—" }
        let ms = max(0, ((end ?? now).timeIntervalSince(start)) * 1000)
        if end != nil, ms < 9950 { return String(format: "%.1fs", ms / 1000) }
        let seconds = Int(ms / 1000)
        return seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
    }

    /// A date as the typed run re-encodes it (Foundation's default: seconds
    /// since the reference date), or an ISO string where one stayed a string.
    private static func date(_ value: Any?) -> Date? {
        if let seconds = value as? Double { return Date(timeIntervalSinceReferenceDate: seconds) }
        // An `anyOf` (date or null string) encodes as its case's wrapper.
        if let wrapped = value as? [String: Any] { return wrapped.values.lazy.compactMap { date($0) }.first }
        guard let text = value as? String else { return nil }
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return precise.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }

    private static func shown(_ value: Any) -> String {
        if let text = value as? String { return text }
        guard JSONSerialization.isValidJSONObject(value) || value is NSNumber,
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .withoutEscapingSlashes]) else { return "\(value)" }
        return String(data: data, encoding: .utf8) ?? "\(value)"
    }

    private static func pretty(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let text = value as? String, let data = try? JSONSerialization.data(withJSONObject: text, options: .fragmentsAllowed) { return String(data: data, encoding: .utf8) }
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .fragmentsAllowed, .withoutEscapingSlashes]) else { return "\(value)" }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: Steps

/// The run's steps on the nesting rails (RunSteps.svelte): the rail runs down
/// from the run's glyph, round an 8pt elbow, out to each step's glyph. A step
/// is its status glyph and title, the way into its own tab, its time, and
/// the count of what it folds; open, its result (and Re-run from this step)
/// hangs under it.
final class RunStepsView: UIView {
    weak var anchor: UIView?
    var onOpen: (String) -> Void = { _ in }
    var onHeight: () -> Void = {}
    private(set) var durations: [(label: KitLabel, start: Date?, end: Date?)] = []
    private let list = UIStackView()
    private let rails = CAShapeLayer()
    private var glyphs: [UIView] = []
    private var opened: Set<String> = []
    private var taps: [TapBox] = []

    init() {
        super.init(frame: .zero)
        list.axis = .vertical
        list.spacing = Space.spaceRow
        list.translatesAutoresizingMaskIntoConstraints = false
        addSubview(list)
        rails.fillColor = nil
        rails.lineWidth = 1
        layer.addSublayer(rails)
        // `--nest-pad`: the run glyph's centre (8) plus `--nest-in`.
        NSLayoutConstraint.activate([
            list.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Size.iconMd / 2 + Space.space2),
            list.trailingAnchor.constraint(equalTo: trailingAnchor),
            list.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1),
            list.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: RunStepsView, _: UITraitCollection) in
            view.rails.strokeColor = Palette.nestInk.resolvedColor(with: view.traitCollection).cgColor
        }
        rails.strokeColor = Palette.nestInk.resolvedColor(with: traitCollection).cgColor
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("RunStepsView is built in code") }

    func configure(_ model: RunModel, going: Bool, live: Bool, rerun: @escaping (String) -> Void) {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        glyphs = []
        durations = []
        taps = []
        isHidden = model.steps.isEmpty
        for step in model.steps {
            let glyph = SessionStatusView(RunStepsView.face(step.status), compact: true)
            glyphs.append(glyph)
            let title = KitLabel(TypeScale.typeBody, ink: step.status == "failed" ? Palette.statusFailInk : Palette.inkStrong)
            title.text = step.title
            title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let line = UIStackView(arrangedSubviews: [glyph, title])
            line.spacing = Space.space2
            line.alignment = .center
            line.isLayoutMarginsRelativeArrangement = true
            line.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
            line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
            let row = UIStackView(arrangedSubviews: [line])
            row.spacing = Space.space1
            row.alignment = .center
            if let target = step.instanceId ?? step.childRunId.map({ BoardRun.prefix + $0 }) {
                var config = UIButton.Configuration.plain()
                config.image = Glyph.external.image.resized(to: 12)
                config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
                config.contentInsets = .zero
                let jump = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.onOpen(target) })
                jump.accessibilityLabel = "Open \(step.title)"
                jump.houseStyle()
                NSLayoutConstraint.activate([jump.widthAnchor.constraint(equalToConstant: 26), jump.heightAnchor.constraint(equalToConstant: Size.cBtnHLg)])
                row.addArrangedSubview(jump)
            }
            let time = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            time.tabular = true
            time.text = RunModel.duration(step.startedAt, step.endedAt, Date())
            time.setContentHuggingPriority(.required, for: .horizontal)
            row.addArrangedSubview(time)
            durations.append((time, step.startedAt, step.endedAt))
            let box = UIStackView(arrangedSubviews: [row])
            box.axis = .vertical
            box.spacing = Space.space1
            // On the tab every step folds: its result, and Re-run from this step (offered dimmed while the run goes).
            do {
                let count = TreeCountButton()
                let lines = step.result.map { $0.split(separator: "\n", omittingEmptySubsequences: false).count } ?? 1
                let open = opened.contains(step.id)
                count.configure(count: lines, failed: 0, open: open)
                count.accessibilityLabel = "\(open ? "Hide" : "Show") \(lines) \(step.result == nil ? "action" : (lines == 1 ? "line" : "lines"))"
                row.addArrangedSubview(count)
                let fold = UIStackView()
                fold.axis = .vertical
                fold.alignment = .leading
                fold.spacing = Space.space2
                fold.isLayoutMarginsRelativeArrangement = true
                fold.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space2, trailing: 0)
                if let result = step.result {
                    fold.addArrangedSubview(ResultBlock(result, failed: step.failure != nil))
                    fold.arrangedSubviews.last?.widthAnchor.constraint(equalTo: fold.widthAnchor).isActive = true
                }
                do {
                    let button = KitButton.workflow("Re-run from this step") { rerun(step.id) }
                    button.isEnabled = live && !going
                    fold.addArrangedSubview(button)
                }
                fold.isHidden = !open
                box.addArrangedSubview(fold)
                let toggle = { [weak self, weak fold, weak count, weak line] in
                    guard let self, let fold, let count else { return }
                    let now = !opened.contains(step.id)
                    if now { opened.insert(step.id) } else { opened.remove(step.id) }
                    count.configure(count: lines, failed: 0, open: now)
                    line?.accessibilityValue = now ? "Expanded" : "Collapsed"
                    fold.isHidden = !now
                    // Opening, the result comes up as its room opens (`branch`).
                    if now, !UIAccessibility.isReduceMotionEnabled {
                        fold.alpha = 0
                        Motion.easeOut.animator(Motion.durPanel) { fold.alpha = 1 }.startAnimation()
                    }
                    onHeight()
                }
                count.onToggle = toggle
                let tap = TapBox(toggle)
                taps.append(tap)
                line.addGestureRecognizer(UITapGestureRecognizer(target: tap, action: #selector(TapBox.fire)))
                line.isAccessibilityElement = true
                line.accessibilityLabel = "\(step.title), \(RunStepsView.face(step.status).label)"
                line.accessibilityTraits = .button
                line.accessibilityValue = open ? "Expanded" : "Collapsed"
            }
            list.addArrangedSubview(box)
        }
        setNeedsLayout()
    }

    /// A step's status on the session's scale (SessionStatus.svelte `STEP`).
    static func face(_ status: String) -> SessionStatusView.Face {
        switch status {
        case "running": .working
        case "waiting": .needsYou
        case "held": .held
        case "failed": .failed
        case "passed": .passed
        case "pending": .pending
        case "skipped": .skipped
        case "cancelled": .cancelled
        default: .unknown
        }
    }

    /// The rail from under the run's glyph, an elbow of `radiusSm` to each step's glyph.
    override func layoutSubviews() {
        super.layoutSubviews()
        drawRails()
    }

    func drawRails() {
        guard let anchor, anchor.window != nil else { rails.path = nil; return }
        let origin = anchor.convert(CGPoint(x: anchor.bounds.midX, y: anchor.bounds.maxY + 2), to: self)
        let path = UIBezierPath()
        let radius = Radius.radiusSm
        for glyph in glyphs where !glyph.isHidden {
            let at = glyph.convert(CGPoint(x: 0, y: glyph.bounds.midY), to: self)
            path.move(to: origin)
            path.addLine(to: CGPoint(x: origin.x, y: at.y - radius))
            path.addArc(withCenter: CGPoint(x: origin.x + radius, y: at.y - radius), radius: radius, startAngle: .pi, endAngle: .pi / 2, clockwise: false)
            path.addLine(to: CGPoint(x: at.x - Space.space1 / 2, y: at.y))
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        rails.frame = bounds
        rails.path = path.cgPath
        CATransaction.commit()
    }
}

/// A closure as a target, for a gesture that toggles a step.
private final class TapBox: NSObject {
    private let action: () -> Void
    init(_ action: @escaping () -> Void) { self.action = action }
    @objc func fire() { action() }
}

/// A step's result (`.result`): mono meta on the recess, 7/11pt in, at most
/// 240pt tall and scrolling past it; a failure in the fail ink.
final class ResultBlock: UIView {
    init(_ text: String, failed: Bool) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusXs
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        let label = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: failed ? Palette.statusFailInk : Palette.inkStrong, lines: 0)
        label.text = text
        addSubview(scroll)
        scroll.addSubview(label)
        let fit = scroll.heightAnchor.constraint(equalTo: label.heightAnchor, constant: Space.space2 * 2)
        fit.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.heightAnchor.constraint(lessThanOrEqualToConstant: 240),
            fit,
            label.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space3),
            label.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            label.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space2),
            label.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space3 * 2),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("ResultBlock is built in code") }
}

// MARK: Log

/// The run's log (`details.log`): "Log · N", folded; open, one fixed height
/// (30% of the screen) of time and line, scrolling, holding its end in view
/// while the reader is at it.
final class RunLogView: UIView {
    var onHeight: () -> Void = {}
    private let summary = UIButton(type: .custom)
    private let mark = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let scroll = UIScrollView()
    private let lines = UIStackView()
    private var shown: [WorkflowRunDetail.LogLine] = []
    private var open = false

    init() {
        super.init(frame: .zero)
        mark.text = "▸"
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: Space.space4, leading: 0, bottom: Space.space4, trailing: 0)
        summary.configuration = config
        summary.contentHorizontalAlignment = .leading
        summary.addAction(UIAction { [weak self] _ in self?.toggle() }, for: .primaryActionTriggered)
        let head = UIStackView(arrangedSubviews: [mark, summary, UIView()])
        head.spacing = Space.space2
        head.alignment = .center
        lines.axis = .vertical
        lines.spacing = Space.space2
        lines.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(lines)
        scroll.isHidden = true
        let column = UIStackView(arrangedSubviews: [head, scroll])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.heightAnchor.constraint(equalToConstant: (UIScreen.main.bounds.height * 0.3).rounded()),
            lines.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            lines.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            lines.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            lines.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("RunLogView is built in code") }

    func configure(_ log: [WorkflowRunDetail.LogLine]) {
        summary.configuration?.attributedTitle = AttributedString("Log · \(log.count)", attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkMuted)))
        guard log != shown else { return }
        let atEnd = scroll.contentOffset.y >= scroll.contentSize.height - scroll.bounds.height - 4
        for line in log.dropFirst(shown.count) where shown.count <= log.count {
            let time = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
            time.tabular = true
            time.text = line.at.formatted(date: .omitted, time: .standard)
            time.setContentHuggingPriority(.required, for: .horizontal)
            let text = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            text.text = line.text
            let row = UIStackView(arrangedSubviews: [time, text])
            row.spacing = Space.space3
            row.alignment = .firstBaseline
            lines.addArrangedSubview(row)
        }
        shown = log
        if atEnd {
            scroll.layoutIfNeeded()
            scroll.setContentOffset(CGPoint(x: 0, y: max(0, scroll.contentSize.height - scroll.bounds.height)), animated: false)
        }
    }

    private func toggle() {
        open.toggle()
        scroll.isHidden = !open
        summary.accessibilityValue = open ? "Expanded" : "Collapsed"
        let turn = CGAffineTransform(rotationAngle: open ? .pi / 2 : 0)
        if UIAccessibility.isReduceMotionEnabled { mark.transform = turn }
        else { Motion.easeOut.animator(Motion.durControl) { self.mark.transform = turn }.startAnimation() }
        onHeight()
    }
}
