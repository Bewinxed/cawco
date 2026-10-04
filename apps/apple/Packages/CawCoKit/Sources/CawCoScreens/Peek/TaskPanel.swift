import CawCoCore
import CawCoDesign
import UIKit

/// A session's plan, in the order it was written (TaskPanel.svelte). Ids are
/// the order: nothing here re-ranks by status. A task with a description is
/// its own switch: the row opens it. Never shown for a session with no
/// tasks: its hosts check the count first.
final class TaskPanelView: UIStackView {
    private let hub: HubConnection
    private let instanceId: String
    /// The peek pane's version: shorter rows, and the card above says the count.
    private let dense: Bool
    private var opened: Set<String> = []
    private var drawn: [SessionTask] = []
    private let count = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
    /// Its height changed: a task opened or folded.
    var onResize: () -> Void = {}

    init(hub: HubConnection, instanceId: String, dense: Bool = false) {
        self.hub = hub
        self.instanceId = instanceId
        self.dense = dense
        super.init(frame: .zero)
        axis = .vertical
        translatesAutoresizingMaskIntoConstraints = false
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("TaskPanelView is built in code")
    }

    /// Draws the plan as the store holds it. Read under the caller's observation.
    func refresh() {
        let tasks = hub.tasks.snapshot(instanceId)?.tasks ?? []
        guard tasks != drawn || arrangedSubviews.isEmpty else { return }
        drawn = tasks
        draw()
    }

    private func draw() {
        arrangedSubviews.forEach { $0.removeFromSuperview() }
        let side: Double = dense ? 8 : 12
        if !dense {
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.foreground)
            title.text = "Tasks"
            count.tabular = true
            count.text = "\(drawn.filter { $0.status == .completed }.count) of \(drawn.count)"
            let head = UIStackView(arrangedSubviews: [title, UIView(), count])
            head.alignment = .firstBaseline
            head.spacing = 8
            head.isLayoutMarginsRelativeArrangement = true
            head.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 4, trailing: 12)
            addArrangedSubview(head)
        }
        for task in drawn {
            let blocker = hub.tasks.blocker(of: task, in: drawn)
            let row = TaskRow(task: task, blocker: blocker, side: side, height: dense ? 32 : 36)
            addArrangedSubview(row)
            guard let description = task.description, !description.isEmpty else { continue }
            let body = KitLabel(TypeScale.typeBody, ink: Palette.foreground, lines: 0)
            body.text = description
            body.wrap = .pretty
            let box = UIView()
            body.translatesAutoresizingMaskIntoConstraints = false
            box.addSubview(body)
            NSLayoutConstraint.activate([
                body.topAnchor.constraint(equalTo: box.topAnchor),
                body.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -8),
                body.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: dense ? 28 : 32),
                body.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor, constant: -side),
                // `max-w-[60ch]`: sixty of the body face's zeros.
                body.widthAnchor.constraint(lessThanOrEqualToConstant: 60 * ("0" as NSString).size(withAttributes: [.font: TypeScale.typeBody.font]).width),
            ])
            box.isHidden = !opened.contains(task.id)
            addArrangedSubview(box)
            row.opens = true
            row.accessibilityValue = box.isHidden ? "Collapsed" : "Expanded"
            row.addAction(UIAction { [weak self, weak box, weak row] _ in
                guard let self, let box, let row else { return }
                if opened.remove(task.id) == nil { opened.insert(task.id) }
                box.isHidden = !opened.contains(task.id)
                row.accessibilityValue = box.isHidden ? "Collapsed" : "Expanded"
                onResize()
            }, for: .touchUpInside)
        }
    }
}

/// One task's line: its state's glyph, its subject, who owns it, what it
/// waits on, and its id at the row's end.
private final class TaskRow: UIControl {
    /// It has a description to open: only then does it take a press or a pointer.
    var opens = false {
        didSet { isUserInteractionEnabled = opens }
    }

    init(task: SessionTask, blocker: String?, side: Double, height: Double) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        let subject = KitLabel(TypeScale.typeLabel, ink: task.status == .completed ? Palette.mutedForeground : Palette.foreground)
        subject.text = task.subject
        subject.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [TaskGlyph(task.status), subject])
        row.spacing = 8
        row.alignment = .center
        row.isUserInteractionEnabled = false
        if let owner = task.owner, !owner.isEmpty {
            let name = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground)
            name.text = owner
            let pill = UIView()
            pill.backgroundColor = Palette.muted
            name.translatesAutoresizingMaskIntoConstraints = false
            pill.addSubview(name)
            NSLayoutConstraint.activate([
                name.topAnchor.constraint(equalTo: pill.topAnchor),
                name.bottomAnchor.constraint(equalTo: pill.bottomAnchor),
                name.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 6),
                name.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -6),
            ])
            pill.layer.cornerRadius = TypeScale.typeLabel.lineHeight / 2
            pill.setContentHuggingPriority(.required, for: .horizontal)
            pill.setContentCompressionResistancePriority(.required, for: .horizontal)
            row.addArrangedSubview(pill)
        }
        row.addArrangedSubview(UIView())
        if let blocker {
            let after = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
            after.text = "after #\(blocker)"
            after.setContentHuggingPriority(.required, for: .horizontal)
            after.setContentCompressionResistancePriority(.required, for: .horizontal)
            row.addArrangedSubview(after)
        }
        let id = KitLabel(TypeScale.typeMeta.with(family: FontFamily.fontMono), ink: Palette.mutedForeground)
        id.tabular = true
        id.text = "#\(task.id)"
        id.setContentHuggingPriority(.required, for: .horizontal)
        id.setContentCompressionResistancePriority(.required, for: .horizontal)
        row.addArrangedSubview(id)
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: height),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: side),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -side),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        alpha = blocker == nil ? 1 : 0.6
        isAccessibilityElement = true
        let state = switch task.status {
        case .completed: "Done"
        case .in_progress: "In progress"
        case .pending: "Pending"
        }
        accessibilityLabel = [state, task.subject, task.owner, blocker.map { "after task \($0)" }, "task \(task.id)"].compactMap(\.self).joined(separator: ", ")
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskRow is built in code")
    }

    override var accessibilityTraits: UIAccessibilityTraits {
        get { opens ? .button : .staticText }
        set {}
    }

    /// `hover:bg-accent/40`, on a row that opens.
    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let over = opens && (hover.state == .began || hover.state == .changed)
        backgroundColor = over ? Palette.accent.withAlphaComponent(0.4) : .clear
    }
}

/// A task's state in a 12pt box: a check when done, a filled dot while in
/// progress, a ring while pending.
private final class TaskGlyph: UIView {
    private let status: SessionTask.Status

    init(_ status: SessionTask.Status) {
        self.status = status
        super.init(frame: .zero)
        isOpaque = false
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 12), heightAnchor.constraint(equalToConstant: 12)])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TaskGlyph, _: UITraitCollection) in view.setNeedsDisplay() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskGlyph is built in code")
    }

    override func draw(_: CGRect) {
        let dot = CGRect(x: 3, y: 3, width: 6, height: 6)
        switch status {
        case .completed:
            let check = UIBezierPath()
            check.move(to: CGPoint(x: 2.4, y: 6.4))
            check.addLine(to: CGPoint(x: 4.6, y: 8.6))
            check.addLine(to: CGPoint(x: 9.4, y: 3.6))
            check.lineWidth = 1.5
            check.lineCapStyle = .round
            check.lineJoinStyle = .round
            Palette.success.setStroke()
            check.stroke()
        case .in_progress:
            Palette.warning.setFill()
            UIBezierPath(ovalIn: dot).fill()
        case .pending:
            let ring = UIBezierPath(ovalIn: dot.insetBy(dx: 0.5, dy: 0.5))
            ring.lineWidth = 1
            Palette.mutedForeground.withAlphaComponent(0.4).setStroke()
            ring.stroke()
        }
    }
}
